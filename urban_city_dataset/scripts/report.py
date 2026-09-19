"""Produce inspectable field documentation, coverage tables and an export audit."""
import json,re
import pandas as pd
import numpy as np
import geopandas as gpd
from common import *
from features import CATEGORIES,EXACT

def description(field,definitions):
    if field.startswith('ghsl_'):
        original=field[5:]
        for d in definitions:
            pattern=d['attribute_pattern']
            try:
                if re.fullmatch(re.escape(pattern).replace('XXXX',r'\d{4}'),original):return 'direct GHSL',d['description'],d['units'],d['upstream_source']
            except Exception:pass
        return 'direct GHSL','Original UCDB field '+original+'; consult retained official PDF.', 'see official dictionary','GHSL UCDB'
    fixed={
      'city_id':('identifier','Stable GHSL source identifier prefixed ghsl_','text'),
      'city_name':('metadata','Requested name or GHSL primary name','text'),
      'country':('direct GHSL','GHSL country assignment','text'),
      'population':('direct GHSL','GC_POP_TOT_2025; modelled residential population','people'),
      'population_year':('metadata','Population reference epoch','year'),
      'area_km2':('derived','Original Mollweide boundary area / 1e6','km²'),
      'population_density':('derived','population / area_km2','people/km²'),
      'built_up_population_density':('derived','population / built_up_area_km2','people/km² of built-up'),
      'built_up_area_km2':('derived GHSL','GH_BUS_TOT_2025 / 1e6','km²'),
      'green_space_pct':('unavailable','No defensible city-wide green-space percentage; greenness and mapped parks are distinct','%'),
      'road_length_km':('derived','Sum clipped Overture road subtype segment lengths in local metric CRS / 1000','km'),
      'road_density':('derived','road_length_km / area_km2','km/km²'),
      'intersection_density':('derived approximation','Road endpoints rounded to 0.1 m with degree >=3 / area_km2','junctions/km²'),
      'intersection_count_approx':('derived approximation','Road endpoints rounded to 0.1 m with degree >=3','junctions'),
      'road_network_mean_degree_approx':('derived approximation','2 × clipped road-part count / distinct rounded endpoints','ratio'),
      'road_network_edge_node_ratio_approx':('derived approximation','clipped road-part count / distinct rounded endpoints','ratio'),
      'building_footprint_area_km2':('derived','Sum clipped footprint areas; overlaps possible','km²'),
      'building_footprint_union_area_km2':('derived','Union of clipped building footprints; null above 200000 features','km²'),
      'building_footprint_sum_pct':('derived','100 × summed footprint area / city area; may double-count overlaps','%'),
      'built_area_pct':('derived','100 × union footprint area / city area; null above 200000 features','%'),
      'building_union_status':('quality','computed or skipped_over_200000_footprints','text'),
      'park_area_km2':('derived','Union of clipped mapped park/garden/nature-reserve polygons','km²'),
      'mapped_park_area_pct':('derived','100 × park_area_km2 / area_km2; parcel area, not all vegetation','%'),
      'poi_diversity':('derived','Shannon entropy -sum(p*ln(p)) over retained category proportions; includes other/uncategorized','nats'),
      'population_grid_sum':('derived GHSL','Sum selected positive 2025 GHSL population cell values','people'),
      'population_grid_to_ucdb_ratio':('quality','population_grid_sum / population','ratio'),
      'accessibility_weighting':('metadata','population: 1 km grid cell population; area_grid: equal weights on regular interior points','text'),
      'accessibility_sample_count':('quality','Number of population cells or fallback area points used','points'),
      'transit_stops_per_km2':('derived','(station + bus_stop + transit_stop counts) / area_km2','features/km²'),
    }
    if field in fixed:return (*fixed[field],'See city_sources.csv')
    if 'nearest_mean_km' in field:return 'derived approximation','Weighted mean straight-line nearest retained facility representative-point distance; weighting identified by accessibility_weighting','km','GHSL population + retained POIs'
    if 'nearest_median_km' in field:return 'derived approximation','Weighted median straight-line nearest retained facility representative-point distance; weighting identified by accessibility_weighting','km','GHSL population + retained POIs'
    if re.match(r'(population|area_grid)_within_',field):return 'derived approximation','100 × covered weight / total selected weight at named straight-line radius; cell centres and within-city facilities only','%','GHSL population (or area grid fallback) + retained POIs'
    if field.endswith('_observed_before_dedup'):return 'source diagnostic','Boundary-clipped category observations before unified-source selection and named-distance deduplication','features','Named source in field prefix'
    if field.endswith('_count'):return 'derived','Count retained mapped '+field.removesuffix('_count')+' features; observed zero is not proof of absence','features','Retained POIs or footprints; city_sources.csv'
    if field.endswith('_density'):return 'derived',field.removesuffix('_density')+'_count / area_km2','features/km²','Retained records + GHSL boundary'
    if field.endswith('_per_100k'):return 'derived','Corresponding category count × 100000 / population','features/100000 people','Retained records + GHSL population'
    return 'metadata','City/source/selection metadata; see README and city_sources.csv','text or documented source unit','city_sources.csv'

def main():
    cities=pd.read_csv(ROOT/'cities_master.csv');sources=pd.read_csv(ROOT/'city_sources.csv');quality=pd.read_csv(ROOT/'data_quality.csv')
    # Add context provenance/quality without duplicating repeated report runs.
    for path,kind in [(OUT/'city_level/eurostat_sources.csv','sources'),(OUT/'city_level/eurostat_quality.csv','quality')]:
        if path.exists():
            df=pd.read_csv(path)
            if kind=='sources':sources=pd.concat([sources[~sources.field_or_dataset.str.startswith('eurostat_',na=False)],df],ignore_index=True)
            else:quality=pd.concat([quality[~quality.dataset.str.startswith('eurostat_',na=False)],df],ignore_index=True)
    sources.to_csv(ROOT/'city_sources.csv',index=False);quality.to_csv(ROOT/'data_quality.csv',index=False)
    defs=pd.read_csv(OUT/'city_level/ghsl_indicator_dictionary.csv').fillna('').to_dict('records')
    fields=[]
    for field in cities:
        kind,meaning,units,source=description(field,defs);fields.append(dict(field=field,kind=kind,definition=meaning,units=units,source=source,non_null_cities=int(cities[field].notna().sum()),missing_cities=int(cities[field].isna().sum())))
    pd.DataFrame(fields).to_csv(OUT/'city_level/feature_dictionary.csv',index=False)
    save_json(OUT/'poi_level/category_mapping.json',{k:sorted(v) for k,v in EXACT.items()})
    errors=[];npoi=0;city_counts={};b=gpd.read_parquet(BOUND/'cities.parquet').set_index('city_id');category_counts={}
    for cid in cities.city_id:
        p=gpd.read_parquet(OUT/'poi_level'/f'{cid}.parquet');npoi+=len(p);city_counts[cid]=len(p);category_counts[cid]=p.poi_category.value_counts().to_dict()
        if p.poi_id.duplicated().any():errors.append(f'Duplicate POI id: {cid}')
        if not p.geometry.covered_by(b.loc[cid].geometry.buffer(1e-9)).all():errors.append(f'Outside POI: {cid}')
        for dataset in ['roads','buildings','land_use']:
            path=OUT/'spatial'/f'{cid}_{dataset}.parquet'
            if not path.exists():continue
            # Boundary-buffer allows only numeric projection/overlay tolerance (~sub-mm).
            g=gpd.read_parquet(path,columns=['geometry'])
            if not g.geometry.covered_by(b.loc[cid].geometry.buffer(1e-8)).all():errors.append(f'Outside {dataset}: {cid}')
        row=cities[cities.city_id==cid].iloc[0]
        for cat in CATEGORIES:
            expected=row.get(cat+'_count')
            if pd.notna(expected) and expected!=category_counts[cid].get(cat,0):errors.append(f'POI count mismatch {cid} {cat}')
        fields_for_city=set(sources[sources.city_id==cid].field_or_dataset)
        absent=set(cities.columns)-fields_for_city
        if absent:errors.append(f'Missing provenance {cid}: {sorted(absent)}')
    # Verify physical CSV record count with chunked parser (names can contain newlines).
    csv_count=sum(len(chunk) for chunk in pd.read_csv(ROOT/'poi_master.csv',chunksize=100000,usecols=['city_id']))
    if npoi!=csv_count:errors.append(f'POI CSV count {csv_count} differs from parquet {npoi}')
    ratios=cities.population_grid_to_ucdb_ratio.dropna()
    if not ratios.between(.98,1.02).all():errors.append('Population grid / UCDB differs by >2%')
    if len(cities)>=50 and not set(REQUIRED).issubset(set(cities.city_name)):errors.append('Required cities missing')
    summary={'validated_at':now(),'passed':not errors,'errors':errors,'cities':len(cities),'countries':int(cities.country.nunique()),'poi_rows':npoi,'city_columns':len(cities.columns),'source_rows':len(sources),'quality_rows':len(quality),'population_grid_ratio_range':[float(ratios.min()),float(ratios.max())],'dataset_status_counts':quality.groupby(['dataset','status']).size().rename('cities').reset_index().to_dict('records'),'missingness':{c:int(cities[c].isna().sum()) for c in ['hospital_count','school_count','park_count','road_length_km','building_count','built_area_pct','green_space_pct']}}
    save_json(ROOT/'logs/final_audit.json',summary)
    pd.DataFrame({'field':cities.columns,'non_null':cities.notna().sum().values,'missing':cities.isna().sum().values}).to_csv(OUT/'city_level/missingness.csv',index=False)
    headline=cities[['city_name','country','population','hospital_count','school_count','park_count','road_length_km','building_count','poi_count']]
    headline.to_csv(ROOT/'dataset_summary.csv',index=False)
    pd.DataFrame([{'city_id':cid,'category':cat,'count':n} for cid,cats in category_counts.items() for cat,n in cats.items()]).to_csv(OUT/'city_level/category_counts.csv',index=False)
    print(json.dumps(summary,indent=2))
    if errors:raise RuntimeError('Export audit failed')
if __name__=='__main__':main()
