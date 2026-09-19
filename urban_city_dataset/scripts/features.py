"""Boundary-clipped features in a local metric CRS; missing != zero."""
import json, math, re, unicodedata
from collections import Counter
import numpy as np
import pandas as pd
import geopandas as gpd
from pyproj import CRS
from scipy.spatial import cKDTree
from shapely.geometry import Point
from shapely import points, contains_xy
import rasterio
from rasterio.mask import mask
from common import *
from population import POP_FILE

CATEGORIES=['hospital','clinic','school','university','park','supermarket','pharmacy','police','fire_station','transit_station','bus_stop','transit_stop','restaurant','cafe','retail','accommodation','community','other','uncategorized']
EXACT={
 'hospital':{'hospital','maternity_hospital'},
 'clinic':{'clinic','medical_clinic','walk_in_clinic','public_health_clinic','dialysis_clinic','womens_health_clinic','eye_care_clinic','abortion_clinic','medical_center','health_center'},
 'school':{'school','elementary_school','middle_school','high_school','public_school','private_school','religious_school','special_education','primary_school','secondary_school'},
 'university':{'college_university','university','college','community_college'},
 'park':{'park','national_park','botanical_garden','garden','nature_reserve','dog_park'},
 'supermarket':{'supermarket','grocery_store','international_grocery_store','organic_grocery_store'},
 'pharmacy':{'pharmacy'},'police':{'police_department','police_station'},'fire_station':{'fire_department','fire_station'},
 'transit_station':{'train_station','metro_station','light_rail_and_subway_stations','bus_station','transit_station','railway_station'},
 'bus_stop':{'bus_stop'},'transit_stop':{'tram_stop','transit_stop'},
 'cafe':{'cafe','coffee_shop','tea_room'},'accommodation':{'hotel','hostel','motel','accommodation'},
 'community':{'library','community_center','community_services_non_profits'},
}
def category(value):
    if not isinstance(value,str) or not value:return 'uncategorized'
    for group,values in EXACT.items():
        if value in values:return group
    if 'restaurant' in value or value in {'fast_food','food_court'}:return 'restaurant'
    if value.endswith('_store') or value in {'shopping','shopping_center','department_store'}:return 'retail'
    return 'other'

def metric_crs(boundary):
    c=boundary.centroid
    return CRS.from_proj4(f'+proj=aeqd +lat_0={c.y} +lon_0={c.x} +datum=WGS84 +units=m +no_defs')
def empty_geo():return gpd.GeoDataFrame(columns=['id','geometry'],geometry='geometry',crs=4326)
def clip(g,boundary):
    if g.empty:return g.copy(),{'invalid_geometry':0,'outside_boundary':0}
    g=g.drop_duplicates('id').copy();valid=g.geometry.notna()&~g.geometry.is_empty
    bad=int((~valid).sum());g=g[valid].copy();before=len(g)
    # Avoid repairing every footprint in a broad Overture bbox.  The spatial
    # index first retains only features that can touch the city, then repairs
    # and clips that much smaller candidate set exactly.
    candidate_positions=g.sindex.query(boundary,predicate='intersects')
    g=g.iloc[np.unique(candidate_positions)].copy()
    g.geometry=g.geometry.make_valid()
    g=g[g.intersects(boundary)].copy();g.geometry=g.geometry.intersection(boundary)
    g=g[~g.geometry.is_empty].copy()
    return g,{'invalid_geometry':bad,'outside_boundary':before-len(g)}

def dedup(pois,crs):
    if pois.empty:return pois,0
    pois=pois.drop_duplicates('poi_id').copy().reset_index(drop=True)
    def norm(v):return re.sub(r'\W+','',unicodedata.normalize('NFKC',str(v)).casefold()) if pd.notna(v) else ''
    names=pois.poi_name.map(norm);projected=pois.to_crs(crs);xy=np.c_[projected.geometry.x,projected.geometry.y];remove=set()
    # Conservative same-name, same-category dedup; preserve unnamed sites and distinct campuses.
    for _,idx in pois.assign(_name=names).query('_name != ""').groupby(['poi_category','_name']).groups.items():
        idx=np.asarray(list(idx))
        if len(idx)<2:continue
        for a,b in sorted(cKDTree(xy[idx]).query_pairs(50)):
            ia,ib=int(idx[a]),int(idx[b])
            if ia not in remove:remove.add(ib)
    return pois.drop(index=list(remove)),len(remove)

def make_pois(overture,osm_g,city,crs):
    rows=[];count_closed=0
    if overture is not None:
        for r in overture.itertuples():
            if getattr(r,'operating_status',None)=='permanently_closed':count_closed+=1;continue
            p=r.geometry if r.geometry.geom_type=='Point' else r.geometry.representative_point()
            rows.append(dict(poi_id='overture:'+str(r.id),poi_name=getattr(r,'name',None),poi_category=category(getattr(r,'category',None)),poi_subcategory=getattr(r,'category',None),geometry=p,source='Overture Maps',source_id=str(r.id)))
    covered={x['poi_category'] for x in rows}
    # OSM is the preferred mapped-stop/park source; use OSM healthcare/education only
    # when Overture has no observed points in that category, avoiding mixed-source inflation.
    if osm_g is not None:
        osm_cats=set(osm_g.category)
        preferred={'hospital','clinic','school','university','pharmacy','police','fire_station','park','transit_station','bus_stop','transit_stop'}&osm_cats
        rows=[x for x in rows if x['poi_category'] not in preferred]
        for r in osm_g.itertuples():
            if r.category not in preferred and r.category in covered:continue
            rows.append(dict(poi_id='osm:'+str(r.id),poi_name=r.name,poi_category=r.category,poi_subcategory=r.category,geometry=r.geometry.representative_point(),source='OpenStreetMap',source_id=str(r.id)))
    cols=['poi_id','poi_name','poi_category','poi_subcategory','geometry','source','source_id']
    g=gpd.GeoDataFrame(rows,columns=cols,geometry='geometry',crs=4326)
    g,n=dedup(g,crs)
    g['city_id']=city['city_id'];g['city_name']=city['city_name'];g['longitude']=g.geometry.x;g['latitude']=g.geometry.y
    return g,{'duplicate_pois_removed':n,'permanently_closed_removed':count_closed}

def population_points(city_id,boundary):
    p=OUT/'spatial'/(city_id+'_population.parquet')
    if p.exists():return gpd.read_parquet(p)
    if not POP_FILE.exists():return None
    with rasterio.open(POP_FILE) as src:
        geom=gpd.GeoSeries([boundary],crs=4326).to_crs(src.crs).iloc[0]
        arr,transform=mask(src,[geom],crop=True,filled=False,all_touched=False)
        a=arr[0];valid=(~np.ma.getmaskarray(a))&np.isfinite(a.data)&(a.data>0)
        rr,cc=np.where(valid);xx,yy=rasterio.transform.xy(transform,rr,cc)
        g=gpd.GeoDataFrame({'population':a.data[rr,cc].astype(float),'geometry':gpd.points_from_xy(xx,yy)},crs=src.crs).to_crs(4326)
        g=g[g.intersects(boundary)].copy();g.to_parquet(p,index=False);return g

def spatial_access(city,boundary,pois,crs,available):
    features={};pop=population_points(city['city_id'],boundary)
    geom=gpd.GeoSeries([boundary],crs=4326).to_crs(crs).iloc[0]
    # Approximation fallback: regular interior grid, explicitly AREA weighted.
    if pop is None or pop.empty:
        a,b,c,d=geom.bounds;spacing=max(500,math.sqrt(geom.area/12000));xs=np.arange(a+spacing/2,c,spacing);ys=np.arange(b+spacing/2,d,spacing)
        xx,yy=np.meshgrid(xs,ys);xx=xx.ravel();yy=yy.ravel();inside=contains_xy(geom,xx,yy)
        xy=np.c_[xx[inside],yy[inside]];weights=np.ones(len(xy));prefix='area_grid';total=None
    else:
        pp=pop.to_crs(crs);xy=np.c_[pp.geometry.x,pp.geometry.y];weights=pp.population.to_numpy();prefix='population';total=float(weights.sum())
    features['accessibility_weighting']=prefix;features['accessibility_sample_count']=len(xy);features['population_grid_sum']=total
    if total is not None:features['population_grid_to_ucdb_ratio']=total/city['population']
    for cat in ['hospital','school','park','transit_station']:
        subset=pois[pois.poi_category==cat].to_crs(crs)
        if subset.empty or cat not in available or len(xy)==0:continue
        tree=cKDTree(np.c_[subset.geometry.x,subset.geometry.y]);dist=tree.query(xy)[0]/1000
        idx=np.argsort(dist);med=dist[idx][np.searchsorted(np.cumsum(weights[idx]),weights.sum()/2)]
        features[f'{cat}_nearest_mean_km']=float(np.average(dist,weights=weights))
        features[f'{cat}_nearest_median_km']=float(med)
        for radius in [1,3,5]:features[f'{prefix}_within_{radius}km_{cat}_pct']=float(100*weights[dist<=radius].sum()/weights.sum())
    return features

def road_features(g,crs,area):
    if g is None:return {}
    p=g.to_crs(crs);length=float(p.length.sum()/1000);ends=[]
    # Endpoint topology proxy: do not node every geometric crossing (bridges/underpasses).
    for geom in p.geometry:
        lines=list(geom.geoms) if geom.geom_type=='MultiLineString' else [geom]
        for line in lines:
            if line.geom_type!='LineString' or line.is_empty:continue
            for x,y,*_ in [line.coords[0],line.coords[-1]]:ends.append((round(x,1),round(y,1)))
    counts=Counter(ends);junctions=sum(v>=3 for v in counts.values());nodes=len(counts);edges=len(ends)//2
    return {'road_length_km':length,'road_density':length/area,'intersection_count_approx':junctions,'intersection_density':junctions/area,'road_network_mean_degree_approx':2*edges/nodes if nodes else None,'road_network_edge_node_ratio_approx':edges/nodes if nodes else None}

def building_features(g,crs,area):
    if g is None:return {}
    p=g.to_crs(crs);a=float(p.area.sum()/1e6)
    # Sum footprints can overlap: report sum separately, union for coverage percentage.
    union_area=(float(p.geometry.union_all().area/1e6) if len(p) else 0.0) if len(p)<=200000 else None
    return {'building_count':len(p),'building_density':len(p)/area,'building_footprint_area_km2':a,'building_footprint_union_area_km2':union_area,'built_area_pct':100*union_area/area if union_area is not None else None,'building_footprint_sum_pct':100*a/area,'building_union_status':'computed' if union_area is not None else 'skipped_over_200000_footprints'}

def park_features(osm_g,landuse,crs,area):
    # Land-use classes are not assumed to be vegetation; parks may contain buildings/paving.
    p=None;source=None
    if osm_g is not None:
        p=osm_g[(osm_g.category=='park')&osm_g.geometry.geom_type.isin(['Polygon','MultiPolygon'])];source='OpenStreetMap park/garden/nature_reserve polygons'
    if (p is None or p.empty) and landuse is not None and 'class' in landuse:
        p=landuse[landuse['class'].isin(['park','nature_reserve','garden'])];source='Overture land_use park/nature_reserve/garden polygons'
    if p is None:return {}
    sqm=float(p.to_crs(crs).geometry.union_all().area) if len(p) else 0
    return {'park_area_km2':sqm/1e6,'mapped_park_area_pct':sqm/(area*1e6)*100,'park_area_source':source}

def calculate(city,boundary,pois,layers,osm_g):
    crs=metric_crs(boundary);area=city['area_km2'];pop=city['population'];f={}
    # A successful query establishes observed zero, never real-world absence/completeness.
    available=set(CATEGORIES) if layers.get('places') is not None else set(osm_g.category if osm_g is not None else [])
    for cat in CATEGORIES:
        n=int((pois.poi_category==cat).sum()) if cat in available else None
        f[cat+'_count']=n;f[cat+'_density']=n/area if n is not None else None;f[cat+'s_per_100k']=n/pop*100000 if n is not None else None
    f['hospitals_per_100k']=f['hospitals_per_100k'];f['schools_per_100k']=f['schools_per_100k']
    f['transit_stops_per_km2']=(f['transit_station_count']+f['bus_stop_count']+f['transit_stop_count'])/area if all(f.get(x+'_count') is not None for x in ['transit_station','bus_stop','transit_stop']) else None
    f['poi_count']=len(pois) if available else None
    if len(pois):
        proportions=pois.poi_category.value_counts(normalize=True);f['poi_diversity']=float(-(proportions*np.log(proportions)).sum())
    for source,g in [('overture',layers.get('places')),('osm',osm_g)]:
        if g is not None:
            cats=g.category.map(category) if source=='overture' else g.category
            for cat in ['hospital','school','clinic','park','transit_station']:
                f[f'{source}_{cat}_count_observed_before_dedup']=int((cats==cat).sum())
    f.update(road_features(layers.get('roads'),crs,area));f.update(building_features(layers.get('buildings'),crs,area));f.update(park_features(osm_g,layers.get('land_use'),crs,area));f.update(spatial_access(city,boundary,pois,crs,available))
    return f
