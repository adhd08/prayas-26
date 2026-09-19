"""Respectful single-query Overpass supplement, cached compressed JSON."""
import gzip, json, logging, time
import requests
import geopandas as gpd
from shapely.geometry import Point, LineString, Polygon
from shapely.ops import polygonize, unary_union
from shapely import make_valid
from common import *
ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']

def osm_category(tags):
    amenity=tags.get('amenity','')
    if amenity in ['hospital','clinic','school','university','pharmacy','police','fire_station']:return amenity
    if tags.get('leisure') in ['park','garden','nature_reserve']:return 'park'
    if tags.get('highway')=='bus_stop':return 'bus_stop'
    if tags.get('railway') in ['station','halt','tram_stop'] or tags.get('public_transport')=='station':return 'transit_station'
    if tags.get('public_transport')=='platform':return 'transit_stop'
    return 'other'

def element_geometry(e):
    if e['type']=='node':return Point(e['lon'],e['lat'])
    coords=e.get('geometry')
    if coords:
        pts=[(x['lon'],x['lat']) for x in coords if 'lon' in x]
        if len(pts)>=4 and pts[0]==pts[-1]:return make_valid(Polygon(pts))
        if len(pts)>=2:return LineString(pts)
    if e['type']=='relation':
        outer=[];inner=[]
        for member in e.get('members',[]):
            pts=[(x['lon'],x['lat']) for x in member.get('geometry',[]) if 'lon' in x]
            if len(pts)>=2:(inner if member.get('role')=='inner' else outer).append(LineString(pts))
        polys=list(polygonize(unary_union(outer))) if outer else []
        holes=list(polygonize(unary_union(inner))) if inner else []
        if polys:return make_valid(unary_union(polys).difference(unary_union(holes)))
    if 'center' in e:return Point(e['center']['lon'],e['center']['lat'])
    return None

def fetch(city_id,boundary):
    p=RAW/'osm'/(city_id+'.json.gz');mp=Path(str(p)+'.meta.json')
    if p.exists():return p,json.loads(mp.read_text())
    # Across restarts, respect the same cooldown.
    stamp=RAW/'osm/last_request.txt'
    if stamp.exists():time.sleep(max(0,5-(time.time()-float(stamp.read_text()))))
    w,s,e,n=boundary.bounds
    selectors=['nwr[amenity~"^(hospital|clinic|school|university|pharmacy|police|fire_station)$"]','nwr[leisure~"^(park|garden|nature_reserve)$"]','nwr[railway~"^(station|halt|tram_stop)$"]','node[highway=bus_stop]','nwr[public_transport~"^(station|platform)$"]']
    query='[out:json][timeout:120];('+''.join(x+f'({s},{w},{n},{e});' for x in selectors)+');out center geom;'
    errors=[]
    for endpoint in ENDPOINTS:
        stamp.write_text(str(time.time()));logging.info('%s requesting OSM supplement',city_id)
        try:
            r=requests.post(endpoint,data={'data':query},timeout=(20,160),headers={'User-Agent':'PrayasUrbanDataset/1.0 academic hackathon'});r.raise_for_status();j=r.json()
            if j.get('remark'):raise RuntimeError(j['remark'])
            if 'elements' not in j:raise RuntimeError('Missing elements')
            tmp=p.with_suffix('.tmp')
            with gzip.open(tmp,'wt') as f:json.dump(j,f)
            tmp.replace(p);metadata(p,endpoint,query=query,osm_timestamp=j.get('osm3s',{}).get('timestamp_osm_base'),license='ODbL 1.0; © OpenStreetMap contributors',raw_records=len(j['elements']))
            return p,json.loads(mp.read_text())
        except Exception as exc:errors.append(str(exc));time.sleep(5)
    raise RuntimeError('; '.join(errors))

def load(p,boundary):
    with gzip.open(p,'rt') as f:elements=json.load(f)['elements']
    rows=[];invalid=0
    for e in elements:
        geom=element_geometry(e)
        if geom is None or geom.is_empty:invalid+=1;continue
        if not geom.is_valid:geom=make_valid(geom)
        if not geom.intersects(boundary):continue
        geom=geom.intersection(boundary)
        if geom.is_empty:continue
        tags=e.get('tags',{});category=osm_category(tags)
        rows.append({'id':f"{e['type']}/{e['id']}",'name':tags.get('name'),'category':category,'tags_json':json.dumps(tags,ensure_ascii=False),'geometry':geom})
    if not rows:return gpd.GeoDataFrame(columns=['id','name','category','tags_json','geometry'],geometry='geometry',crs=4326),invalid
    return gpd.GeoDataFrame(rows,crs=4326).drop_duplicates('id'),invalid
