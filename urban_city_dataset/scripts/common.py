from pathlib import Path
import hashlib, json, logging, os, time, uuid
from datetime import datetime, timezone
import requests
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
OUT = ROOT / 'data/processed'
BOUND = ROOT / 'data/boundaries'
GHSL_URL = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_UCDB_GLOBE_R2024A/GHS_UCDB_GLOBE_R2024A/V1-2/GHS_UCDB_GLOBE_R2024A_V1_2.zip'
GHSL_FILE = RAW/'ghsl/GHS_UCDB_GLOBE_R2024A.gpkg'
GHSL_LICENSE = 'European Commission reuse notice: reuse authorised with source acknowledgement'
OVERTURE_LICENSE = 'Theme-specific; see https://docs.overturemaps.org/attribution/ and retained feature sources'
REQUIRED = {'Tokyo':'Japan','Singapore':'Singapore','Copenhagen':'Denmark','Amsterdam':'Netherlands','Barcelona':'Spain','Zurich':'Switzerland','Stockholm':'Sweden','London':'United Kingdom','Paris':'France','New York City':'United States'}
ALIASES = {'New York City':['New York'],'Zurich':['Zürich'],'Bengaluru':['Bangalore'],'Hong Kong':['Hong Kong'],'Seoul':['Seoul'],'Delhi':['New Delhi']}
COUNTRY_ALIASES = {'United States':['United States of America'],'South Korea':['Republic of Korea','Korea, Republic of'],'China':['Hong Kong']}

def now(): return datetime.now(timezone.utc).isoformat()
def save_json(p, value):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    q=p.with_suffix(p.suffix+'.'+uuid.uuid4().hex+'.tmp');q.write_text(json.dumps(value,ensure_ascii=False,indent=2,default=str));q.replace(p)
def sha256(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def metadata(p,url,**kw):
    save_json(str(p)+'.meta.json',{'source_url':url,'download_date':now(),'sha256':sha256(p),**kw})
def cached_json(url,p):
    p=Path(p)
    if p.exists():return json.loads(p.read_text())
    r=requests.get(url,timeout=(20,90),headers={'User-Agent':'PrayasUrbanDataset/1.0 research'});r.raise_for_status()
    j=r.json();save_json(p,j);metadata(p,url);return j
def setup_logging():
    (ROOT/'logs').mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s',handlers=[logging.StreamHandler(),logging.FileHandler(ROOT/'logs/pipeline.log')])
