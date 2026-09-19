"""Run pilot first, validate it, then scale; all downloaded extracts are cached."""
import argparse, json, logging, traceback, shutil
import numpy as np
import pandas as pd
import geopandas as gpd
from common import *
from overture import extract, THEMES
import osm
from features import *
from population import POP_FILE, POP_URL

PILOT=['Singapore','Tokyo','Copenhagen']
DATASETS=['places','roads','buildings','land_use']
POI_COLUMNS=['city_id','city_name','poi_id','poi_name','poi_category','poi_subcategory','latitude','longitude','source','source_id']

def quality(city_id,dataset,status,records=None,missing='',warnings=''):
    return dict(city_id=city_id,dataset=dataset,status=status,records_found=records,missing_fields=missing,warnings=warnings)
def clean_json(x):
    if isinstance(x,dict):return {k:clean_json(v) for k,v in x.items()}
    if isinstance(x,list):return [clean_json(v) for v in x]
    if isinstance(x,(np.integer,np.floating)):x=x.item()
    if isinstance(x,float) and not np.isfinite(x):return None
    return x

def process(city,boundary,config,use_osm=True,timeout=300):
    cid=city['city_id'];layers={};q=[];datasets={};crs=metric_crs(boundary)
    for dataset in DATASETS:
        if dataset == 'buildings' and float(city.get('area_km2', 0)) > 1000:
            layers[dataset] = None
            q.append(quality(cid, 'overture_buildings', 'skipped', warnings='Large GHSL urban centre (>1000 km²); remote Overture building query exceeds hackathon resource budget. GHSL built-up area remains available; no building count imputed.'))
            continue
        try:
            path,meta=extract(cid,boundary,dataset,config['overture_release'],timeout=timeout)
            g,stats=clip(gpd.read_parquet(path),boundary);layers[dataset]=g
            dest=OUT/'spatial'/f'{cid}_{dataset}.parquet';g.to_parquet(dest,index=False,compression="zstd")
            datasets[dataset]=meta
            warning=f'Observed map records; real-world completeness unknown. Raw bbox records={meta["raw_records"]}; clipping={stats}.'
            q.append(quality(cid,'overture_'+dataset,'success',len(g),warnings=warning))
        except Exception as exc:
            logging.error('%s %s failed: %s',cid,dataset,exc);layers[dataset]=None
            q.append(quality(cid,'overture_'+dataset,'failed',warnings=str(exc)))
    osm_g=None
    if use_osm:
        try:
            path,meta=osm.fetch(cid,boundary);osm_g,invalid=osm.load(path,boundary)
            osm_g.to_parquet(OUT/'spatial'/f'{cid}_osm.parquet',index=False,compression='zstd');datasets['osm']=meta
            q.append(quality(cid,'osm','success',len(osm_g),warnings=f'Invalid/missing geometry={invalid}; map completeness unknown. Preferred source for explicitly tagged facilities, transit and parks after pilot category sanity check; Overture fallback if no OSM category observed.'))
        except Exception as exc:
            logging.error('%s OSM failed: %s',cid,exc);q.append(quality(cid,'osm','failed',warnings=str(exc)))
    else:q.append(quality(cid,'osm','not_requested',warnings='Use --osm to query cached/remote supplementary OSM data.'))
    pois,stats=make_pois(layers['places'],osm_g,city,crs)
    pois.to_parquet(OUT/'poi_level'/f'{cid}.parquet',index=False,compression='zstd')
    f=calculate(city,boundary,pois,layers,osm_g)
    for field in ['hospital_nearest_mean_km','hospital_nearest_median_km','school_nearest_mean_km','school_nearest_median_km','park_nearest_mean_km','transit_station_nearest_mean_km','park_area_km2','mapped_park_area_pct','road_length_km','road_density','intersection_density','building_count','building_density','building_footprint_area_km2','built_area_pct','poi_diversity']:
        f.setdefault(field,None)
    for cat in ['hospital','school','park','transit_station']:
        for r in [1,3,5]:f.setdefault(f'population_within_{r}km_{cat}_pct',None)
    missing=[k for k,v in f.items() if v is None or (isinstance(v,float) and np.isnan(v))]
    q.append(quality(cid,'derived_features','success',len(pois),missing=';'.join(missing),warnings=json.dumps(stats)+'; distances are straight-line to mapped POI representative points; 1 km population cells, not travel times; facilities outside city boundary excluded.'))
    q.append(quality(cid,'ghsl_population_grid','success' if f.get('population_grid_sum') else 'unavailable',f.get('accessibility_sample_count'),warnings=f'Grid ratio to UCDB population={f.get("population_grid_to_ucdb_ratio")}; 2025 GHSL modelled population, 1 km cells.'))
    q.append(quality(cid,'worldpop','not_used',warnings='Matching GHSL R2023A population grid used instead.'))
    q.append(quality(cid,'eurostat','not_joined',warnings='Urban Audit administrative geographies differ from GHSL urban centres. No unverified boundary join.'))
    ghslmissing=[k for k,v in city.items() if k.startswith('ghsl_') and pd.isna(v)]
    q.append(quality(cid,'ghsl_ucdb','success',1,missing=';'.join(ghslmissing),warnings='Mixed indicator years retained in field names; 2025 boundary and population; Natural Systems duplicate source IDs: agreeing fields retained, conflicts null. Country/subnational modelled indicators are not independent city surveys.'))
    result={'city_id':cid,'features':clean_json(f),'quality':q,'datasets':datasets,'poi_source_counts':pois.groupby(['poi_category','source']).size().reset_index(name='count').to_dict('records'),'processed_at':now()}
    save_json(OUT/'city_level'/f'{cid}.json',result)
    logging.info('%s completed: %s POIs; hospital=%s school=%s road_km=%s buildings=%s',city['city_name'],len(pois),f.get('hospital_count'),f.get('school_count'),f.get('road_length_km'),f.get('building_count'))
    return result

def provenance(city,result):
    cid=city['city_id'];rows=[];tables=json.loads((OUT/'city_level/ghsl_field_tables.json').read_text())
    ghmeta=json.loads(Path(str(GHSL_FILE)+'.meta.json').read_text())
    def add(field,name,url,date,license,notes):rows.append(dict(city_id=cid,field_or_dataset=field,source_name=name,source_url=url,download_date=date,license=license,notes=notes))
    for k in city:
        if k.startswith('ghsl_') and k[5:] in tables:
            add(k,'GHSL UCDB R2024A V1.2',GHSL_URL,ghmeta['download_date'],GHSL_LICENSE,f'Direct field {k[5:]}; layer {tables[k[5:]]}; exact definition and upstream source in ghsl_indicator_dictionary.csv and official PDF.')
        else:
            mappings={'population':'GC_POP_TOT_2025','built_up_area_km2':'GH_BUS_TOT_2025 / 1e6','area_km2':'area of original Mollweide polygon / 1e6','population_density':'population / area_km2','built_up_population_density':'population / built_up_area_km2','latitude':'centroid of Mollweide boundary, transformed to WGS84','longitude':'centroid of Mollweide boundary, transformed to WGS84','city_name':'user requested label or exact GHSL name','green_space_pct':'Unavailable: GHSL greenness in built-up areas is not public green-space coverage.'}
            add(k,'GHSL UCDB / documented selection',GHSL_URL,ghmeta['download_date'],GHSL_LICENSE,mappings.get(k,'Boundary metadata or documented city selection; see README.'))
    for key,meta in result['datasets'].items():
        add(key,'OpenStreetMap' if key=='osm' else 'Overture Maps '+meta.get('release',''),meta['source_url'],meta['download_date'],meta.get('license',OVERTURE_LICENSE),'Raw query, contributing feature sources, checksums, timestamps and bbox retained in raw sidecar JSON.')
    for field,value in result['features'].items():
        # Record actual upstream sources per category, so OSM substitution is visible.
        cat=next((c for c in sorted(CATEGORIES,key=len,reverse=True) if field.startswith(c)),None)
        if field.startswith('population_within_'):cat=field.split('km_')[1].removesuffix('_pct')
        names={x['source'] for x in result['poi_source_counts'] if x['poi_category']==cat} if cat else set()
        if not names:names={'Overture Maps'} if 'places' in result['datasets'] else {'OpenStreetMap'}
        keys=['osm'] if names=={'OpenStreetMap'} else ['places']
        if field.startswith(('road','intersection')):keys=['roads']
        if field.startswith(('building','built_area')):keys=['buildings']
        if field.startswith(('park_area','mapped_park')):keys=['osm'] if str(result['features'].get('park_area_source','')).startswith('OpenStreetMap') else ['land_use']
        if field.startswith('poi_'):keys=[x for x in ['places','osm'] if x in result['datasets']]
        meta=[result['datasets'][k] for k in keys if k in result['datasets']]
        urls=[m['source_url'] for m in meta];dates=[m['download_date'] for m in meta]
        if 'nearest' in field or 'within_' in field or field.startswith(('population_grid','accessibility')):urls.append(POP_URL)
        note='Derived; formula/method in feature_dictionary.csv; source observations can be incomplete.'
        if value is None:note='Unavailable; no imputation. '+note
        add(field,'Derived from '+', '.join(keys)+(' + GHSL' if ('per_100k' in field or 'density' in field or 'within_' in field or 'nearest' in field) else ''),';'.join(urls),';'.join(dates),';'.join(sorted({m.get('license',OVERTURE_LICENSE) for m in meta})),note)
    return rows

def assemble(base,results,phase):
    rows=[];sources=[];q=[];poi_frames=[]
    for city in base.to_dict('records'):
        cid=city['city_id']
        if cid not in results:continue
        r=results[cid];rows.append({**city,**r['features']});sources+=provenance(city,r);q+=r['quality']
        poi_frames.append(gpd.read_parquet(OUT/'poi_level'/f'{cid}.parquet')[POI_COLUMNS])
    cities=pd.DataFrame(rows);pois=pd.concat(poi_frames,ignore_index=True) if poi_frames else pd.DataFrame(columns=POI_COLUMNS)
    cities.to_csv(OUT/'city_level/cities_master.csv',index=False)
    pois.to_csv(OUT/'poi_level/poi_master.csv',index=False)
    pd.DataFrame(sources).to_csv(OUT/'city_level/city_sources.csv',index=False)
    pd.DataFrame(q).to_csv(OUT/'city_level/data_quality.csv',index=False)
    # Root-level deliverables are symlinks, avoiding duplicate multi-million-row CSVs.
    for name,sub in [('cities_master.csv','city_level'),('poi_master.csv','poi_level'),('city_sources.csv','city_level'),('data_quality.csv','city_level')]:
        link=ROOT/name
        if not link.exists():link.symlink_to(Path('data/processed')/sub/name)
    return cities,pois

def validate(cities,pois,phase):
    errors=[]
    if not cities.city_id.is_unique:errors.append('Duplicate city IDs')
    if not ((cities.population>0)&(cities.area_km2>0)).all():errors.append('Nonpositive population/area')
    if pois.duplicated(['city_id','poi_id']).any():errors.append('Duplicate POI identifiers')
    if not (pois.latitude.between(-90,90)&pois.longitude.between(-180,180)).all():errors.append('Invalid coordinates')
    b=gpd.read_parquet(BOUND/'cities.parquet').set_index('city_id')
    for cid,g in pois.groupby('city_id'):
        if not gpd.GeoSeries(gpd.points_from_xy(g.longitude,g.latitude),crs=4326).covered_by(b.loc[cid].geometry.buffer(1e-9)).all():errors.append(f'Outside POI {cid}')
    for field in [c for c in cities if c.startswith('population_within_') or c in ['built_area_pct','mapped_park_area_pct']]:
        if not cities[field].dropna().between(0,100.001).all():errors.append('Invalid percentage '+field)
    for city in PILOT:
        match=cities[cities.city_name==city]
        if len(match)!=1:errors.append('Missing pilot '+city);continue
        for field in ['poi_count','hospital_count','school_count','road_length_km','population_grid_sum']:
            if field not in match or not (match.iloc[0][field]>0):errors.append(f'Pilot missing/zero {city} {field}')
    report={'phase':phase,'checked_at':now(),'passed':not errors,'errors':errors,'city_count':len(cities),'poi_count':len(pois),'pilot_summary':clean_json(cities[cities.city_name.isin(PILOT)][['city_name','population','area_km2','hospital_count','school_count','park_count','road_length_km','building_count','population_grid_to_ucdb_ratio']].to_dict('records'))}
    save_json(ROOT/'logs'/f'{phase}_validation.json',report)
    if errors:raise RuntimeError('Validation failed: '+str(errors))
    logging.info('VALIDATION PASSED: %s cities, %s POIs',len(cities),len(pois))
    return report

def main():
    setup_logging();p=argparse.ArgumentParser();p.add_argument('--phase',choices=['pilot','all'],default='pilot');p.add_argument('--osm',action=argparse.BooleanOptionalAction,default=True);p.add_argument('--timeout',type=int,default=300);p.add_argument('--recompute',action='store_true');a=p.parse_args()
    if a.phase=='all':
        gate=ROOT/'logs/pilot_validation.json'
        if not gate.exists() or not json.loads(gate.read_text())['passed']:raise RuntimeError('Run and pass --phase pilot before scaling.')
    config=json.loads((ROOT/'config.json').read_text());base=pd.read_csv(OUT/'city_level/cities_base.csv');b=gpd.read_parquet(BOUND/'cities.parquet').set_index('city_id')
    if a.phase=='pilot':base=base[base.city_name.isin(PILOT)]
    results={}
    for city in base.to_dict('records'):
        cid=city['city_id'];p=OUT/'city_level'/f'{cid}.json'
        if p.exists() and not a.recompute:results[cid]=json.loads(p.read_text());logging.info('%s using processed cache',city['city_name']);continue
        results[cid]=process(city,b.loc[cid].geometry,config,a.osm,a.timeout)
    cities,pois=assemble(base,results,a.phase);report=validate(cities,pois,a.phase)
    if a.phase=='pilot':
        dest=OUT/'pilot';dest.mkdir(exist_ok=True)
        for name in ['cities_master.csv','city_sources.csv','data_quality.csv']:shutil.copy2(ROOT/name,dest/name)
        shutil.copy2(ROOT/'logs/pilot_validation.json',dest/'validation.json')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
