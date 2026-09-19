"""STAC-pruned, bbox-pushed-down DuckDB queries. No global parquet download."""
import argparse, json, logging, threading, time
from concurrent.futures import ThreadPoolExecutor
import duckdb
import geopandas as gpd
from common import *
THEMES={'places':('places','place'),'roads':('transportation','segment'),'buildings':('buildings','building'),'land_use':('base','land_use'),'infrastructure':('base','infrastructure')}

def overlap(a,b):return a[0]<=b[2] and a[2]>=b[0] and a[1]<=b[3] and a[3]>=b[1]
def sqlstr(x):return "'"+str(x).replace("'","''")+"'"
def asset_urls(release,dataset,bbox):
    theme,typ=THEMES[dataset];base=f'https://stac.overturemaps.org/{release}/{theme}/{typ}'
    cache=RAW/'overture'/release/'stac'/dataset
    collection=cached_json(base+'/collection.json',cache/'collection.json')
    items=[x for x in collection['links'] if x['rel']=='item']
    boxes=collection.get('extent',{}).get('spatial',{}).get('bbox',[])
    # Current Overture collections publish one spatial extent per item, in link
    # order.  Use that index when it is structurally complete: requesting every
    # global partition manifest before a city query made small city extracts take
    # minutes and did not improve the result.  If a future release changes that
    # structure, retain the conservative all-item path below.
    if len(boxes)==len(items):
        items=[item for item,item_bbox in zip(items,boxes) if overlap(item_bbox,bbox)]
        if not items:raise ValueError('No collection partition overlaps boundary bbox')
    def get(item):
        url=item['href'];obj=cached_json(url,cache/(url.split('/')[-1]))
        return obj
    with ThreadPoolExecutor(max_workers=6) as ex:objects=list(ex.map(get,items))
    return [o['assets']['aws']['href'] for o in objects if overlap(o['bbox'],bbox)]

def connection():
    c=duckdb.connect();c.execute("SET threads=4; SET memory_limit='1500MB';")
    for ext in ['httpfs','spatial']:
        try:c.execute(f'LOAD {ext}')
        except Exception:c.execute(f'INSTALL {ext}; LOAD {ext}')
    c.execute('SET http_timeout=60; SET http_retries=2; SET enable_progress_bar=false;')
    return c

def extract(city_id,boundary,dataset,release,timeout=300):
    p=RAW/'overture'/release/city_id/(dataset+'.parquet');p.parent.mkdir(parents=True,exist_ok=True)
    meta=Path(str(p)+'.meta.json');sig=hashlib.sha256(boundary.wkb).hexdigest()
    if p.exists() and meta.exists():
        m=json.loads(meta.read_text())
        if m.get('boundary_sha256')==sig:return p,m
    bbox=boundary.bounds;urls=asset_urls(release,dataset,bbox)
    if not urls:raise ValueError('No overlapping STAC assets')
    c=connection();timer=threading.Timer(timeout,c.interrupt);timer.daemon=True;timer.start()
    try:
        files='['+','.join(sqlstr(u) for u in urls)+']'
        src=f'read_parquet({files}, union_by_name=true)'
        cols={r[0] for r in c.execute(f'DESCRIBE SELECT * FROM {src}').fetchall()}
        select=['id','geometry']
        if 'names' in cols:select.append('names.primary AS name')
        if 'sources' in cols:select.append('CAST(sources AS JSON) AS sources_json')
        for col in ['class','subtype','height','confidence','operating_status','basic_category']:
            if col in cols:select.append('"'+col+'"')
        if dataset=='places':select+=['categories.primary AS category','CAST(categories AS JSON) AS categories_json']
        if 'connectors' in cols:select.append('CAST(connectors AS JSON) AS connectors_json')
        a,b,d,e=bbox
        where=f'bbox.xmin <= {d} AND bbox.xmax >= {a} AND bbox.ymin <= {e} AND bbox.ymax >= {b}'
        if dataset=='roads':where+=" AND subtype='road'"
        tmp=p.with_suffix('.tmp.parquet')
        query=f"COPY (SELECT {','.join(select)} FROM {src} WHERE {where}) TO {sqlstr(tmp)} (FORMAT PARQUET, COMPRESSION ZSTD)"
        logging.info('%s %s querying %s spatial assets',city_id,dataset,len(urls))
        start=time.monotonic();c.execute(query)
        count=c.execute(f'SELECT count(*) FROM read_parquet({sqlstr(tmp)})').fetchone()[0]
        tmp.replace(p);metadata(p,'https://stac.overturemaps.org/'+release+'/catalog.json',release=release,dataset=dataset,asset_urls=urls,bbox=list(bbox),boundary_sha256=sig,raw_records=count,query=query,elapsed_seconds=round(time.monotonic()-start,2),license=OVERTURE_LICENSE)
        logging.info('%s %s cached %s records in %.1fs',city_id,dataset,count,time.monotonic()-start)
        return p,json.loads(meta.read_text())
    finally:timer.cancel();c.close()

if __name__=='__main__':
    setup_logging();p=argparse.ArgumentParser();p.add_argument('--city',default='Singapore');p.add_argument('--dataset',default='places',choices=list(THEMES));a=p.parse_args()
    config=json.loads((ROOT/'config.json').read_text());b=gpd.read_parquet(BOUND/'cities.parquet');r=b[b.city_name==a.city].iloc[0]
    path,meta=extract(r.city_id,r.geometry,a.dataset,config['overture_release']);print(path,meta['raw_records'])
