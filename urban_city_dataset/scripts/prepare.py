"""Retrieve official GHSL data, select cities, retain fixed 2025 urban boundaries."""
import argparse, json, re, sqlite3, logging, unicodedata
import pandas as pd
import geopandas as gpd
from remotezip import RemoteZip
from pypdf import PdfReader
from common import *

def norm(s):return ''.join(c for c in unicodedata.normalize('NFKD',str(s)).casefold() if c.isalnum())
def download():
    names=['GHS_UCDB_GLOBE_R2024A.gpkg','readme_V1_2.txt','GHSL_UCDB_R2024_V1_2.pdf','GHS_UCDB_GLOBE_R2024A.pdf']
    missing=[n for n in names if not (RAW/'ghsl'/n).exists()]
    if missing:
        with RemoteZip(GHSL_URL,timeout=180) as z:
            for n in missing:
                logging.info('Download GHSL archive member %s',n)
                p=RAW/'ghsl'/n;tmp=p.with_suffix(p.suffix+'.tmp')
                with z.open(n) as src,open(tmp,'wb') as dst:
                    for b in iter(lambda:src.read(1024*1024),b''):dst.write(b)
                tmp.replace(p);metadata(p,GHSL_URL,archive_member=n)
    for n in names:
        p=RAW/'ghsl'/n
        if not Path(str(p)+'.meta.json').exists():metadata(p,GHSL_URL,archive_member=n)

def dictionary():
    p=RAW/'ghsl/GHSL_UCDB_R2024_V1_2.txt'
    if not p.exists():p.write_text('\n'.join(x.extract_text() for x in PdfReader(p.with_suffix('.pdf')).pages))
    txt=p.read_text();entries=[]
    for part in txt.split('Attribute ID')[1:]:
        m=re.search(r'\s*([A-Z0-9_ ]+)\s*Indicator Name\s*(.*?)\s*Units\s*(.*?)\s*Data Source\s*(.*?)\s*Indicator description\s*(.*?)\s*Methodology',part,re.S)
        if m:
            entries.append(dict(attribute_pattern=re.sub(r'\s+','',m[1]),description=' '.join(m[2].split()),units=' '.join(m[3].split()),upstream_source=' '.join(m[4].split()),details=' '.join(m[5].split())))
    pd.DataFrame(entries).to_csv(OUT/'city_level/ghsl_indicator_dictionary.csv',index=False)
    return entries

def prepare(target=50):
    download();defs=dictionary()
    con=sqlite3.connect(GHSL_FILE)
    general='GHSL_UCDB_THEME_GENERAL_CHARACTERISTICS_GLOBE_R2024A'
    tables=[r[0] for r in con.execute('select table_name from gpkg_contents') if r[0]!='UC_centroids']
    frames=[];field_tables={}
    for t in tables:
        cols=[r[1] for r in con.execute(f'pragma table_info("{t}")') if r[1] not in ['fid','geom']]
        cols=[c for c in cols if c=='ID_UC_G0' or c not in field_tables]
        df=pd.read_sql_query('select '+','.join('"'+c+'"' for c in cols)+f' from "{t}"',con).set_index('ID_UC_G0')
        if not df.index.is_unique:
            logging.warning('Duplicate source IDs in %s; retain agreeing cells, null conflicts',t)
            dup=df[df.index.duplicated(False)]
            dup.to_csv(RAW/'ghsl'/(t+'_duplicates.csv'))
            df=df.groupby(level=0).agg(lambda s: s.iloc[0] if s.nunique(dropna=False)==1 else None)
        frames.append(df)
        field_tables.update({c:t for c in cols if c!='ID_UC_G0'})
    full=pd.concat(frames,axis=1)
    # No zero imputation; convert only documented/common explicit sentinels, preserving real negatives.
    full=full.replace({-9999:float('nan'),-99999:float('nan'),'NULL':None,'N/A':None})
    selected=[];labels={}
    for city,country in REQUIRED.items():
        names={norm(x) for x in [city]+ALIASES.get(city,[])}
        countries={norm(x) for x in [country]+COUNTRY_ALIASES.get(country,[])}
        hit=full[full.GC_UCN_MAI_2025.map(norm).isin(names)&full.GC_CNT_GAD_2025.map(norm).isin(countries)]
        if len(hit)!=1:
            candidates=full[full.GC_UCN_MAI_2025.map(norm).isin(names)]
            raise ValueError(f'Ambiguous/missing city {city}: {candidates.iloc[:,:5].to_dict()}')
        i=int(hit.index[0]);selected.append(i);labels[i]=city
    # Availability-based expansion, with geographic and income variation; no outcome ranking.
    indicators=['SC_SEC_HDI_2020','EM_CO2_TOT_2024','GR_SQM_GRN_2025','IN_ROA_LEN_2024','HL_FCL_HOS_2024']
    full['selection_coverage']=full[indicators].notna().mean(axis=1)
    pool=full[(full.GC_POP_TOT_2025>=500000)&(full.selection_coverage>=0.8)&(~full.index.isin(selected))].copy()
    pool=pool.sort_values(['selection_coverage','GC_POP_TOT_2025'],ascending=False)
    # Round-robin across UN regions, initially at most two automatic additions per country.
    country_counts={};regions=sorted(pool.GC_DEV_USR_2025.dropna().unique())
    while len(selected)<target:
        changed=False
        for region in regions:
            candidates=pool[(pool.GC_DEV_USR_2025==region)&(~pool.index.isin(selected))]
            candidates=candidates[candidates.GC_CNT_GAD_2025.map(lambda c:country_counts.get(c,0)<2)]
            if candidates.empty:continue
            i=int(candidates.index[0]);selected.append(i);labels[i]=str(full.loc[i,'GC_UCN_MAI_2025'])
            country=full.loc[i,'GC_CNT_GAD_2025'];country_counts[country]=country_counts.get(country,0)+1;changed=True
            if len(selected)>=target:break
        if not changed:break
    g=gpd.read_file(GHSL_FILE,layer=general,where='ID_UC_G0 IN ('+','.join(map(str,selected))+')').set_index('ID_UC_G0').loc[selected]
    g.geometry=g.geometry.make_valid()
    # Preserve original equal-area boundary, then reproject for querying.
    g['city_id']=['ghsl_'+str(i) for i in g.index];g['city_name']=[labels[i] for i in g.index]
    areas=g.area/1e6;cent=g.centroid.to_crs(4326);wgs=g.to_crs(4326)
    wgs[['city_id','city_name','geometry']].to_file(BOUND/'cities.geojson',driver='GeoJSON')
    wgs[['city_id','city_name','geometry']].to_parquet(BOUND/'cities.parquet',index=False)
    rows=[]
    for i,r in full.loc[selected].iterrows():
        cid=f'ghsl_{i}';geom=wgs.loc[i].geometry
        gpd.GeoDataFrame({'city_id':[cid],'city_name':[labels[i]],'geometry':[geom]},crs=4326).to_file(BOUND/(cid+'.geojson'),driver='GeoJSON')
        rows.append({'city_id':cid,'city_name':labels[i],'ghsl_city_name':r.GC_UCN_MAI_2025,'country':r.GC_CNT_GAD_2025,'region':r.GC_DEV_USR_2025,'income_group':r.GC_DEV_WIG_2025,'boundary_source':'GHSL UCDB R2024A V1.2','boundary_identifier':int(i),'boundary_year':2025,'area_km2':areas.loc[i],'population':r.GC_POP_TOT_2025,'population_year':2025,'latitude':cent.loc[i].y,'longitude':cent.loc[i].x,'built_up_area_km2':r.GH_BUS_TOT_2025/1e6,'selection_reason':'required' if labels[i] in REQUIRED else 'GHSL coverage >=80%; population >=500k; region round-robin','selection_coverage':r.selection_coverage})
    master=pd.DataFrame(rows)
    latest={}
    for c in field_tables:
        m=re.match(r'^(.*)_(\d{4})$',c)
        if m:
            stem,year=m[1],int(m[2])
            if year<=2025 and (stem not in latest or year>latest[stem][0]):latest[stem]=(year,c)
        else:latest[c]=(0,c)
    wanted=[x[1] for x in latest.values()]
    sub=full.loc[selected,wanted].reset_index(drop=True).add_prefix('ghsl_')
    master=pd.concat([master,sub],axis=1)
    master['population_density']=master.population/master.area_km2
    master['built_up_population_density']=master.population/master.built_up_area_km2
    master['green_space_pct']=float('nan')  # Derived only from mapped vegetation polygons later.
    master.to_csv(OUT/'city_level/cities_base.csv',index=False)
    full.loc[selected].to_csv(OUT/'city_level/ghsl_all_indicators.csv')
    save_json(OUT/'city_level/ghsl_field_tables.json',field_tables)
    save_json(ROOT/'config.json',{'ghsl_version':'R2024A V1.2','ghsl_url':GHSL_URL,'population_year':2025,'overture_release':'2026-08-19.0','cities':master[['city_id','city_name','country']].to_dict('records'),'sampling_spacing_m':500,'max_accessibility_points':12000})
    logging.info('Prepared %s cities with %s recent GHSL fields',len(master),len(wanted))
    print(master[['city_id','city_name','country','population','area_km2']].to_string(index=False))

if __name__=='__main__':
    setup_logging();p=argparse.ArgumentParser();p.add_argument('--target',type=int,default=50);prepare(p.parse_args().target)
