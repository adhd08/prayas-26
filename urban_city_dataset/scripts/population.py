"""Cached GHSL 2025 population grid, matching the UCDB source release."""
import logging
from remotezip import RemoteZip
from common import *
POP_NAME='GHS_POP_E2025_GLOBE_R2023A_54009_1000_V1_0'
POP_URL=f'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_54009_1000/V1-0/{POP_NAME}.zip'
POP_FILE=RAW/'ghsl'/(POP_NAME+'.tif')
def download_population():
    if POP_FILE.exists():return POP_FILE
    POP_FILE.parent.mkdir(parents=True, exist_ok=True)
    with RemoteZip(POP_URL,timeout=300) as z:
        name=next(x.filename for x in z.infolist() if x.filename.endswith('.tif'))
        logging.info('Download population grid %s',name)
        tmp=POP_FILE.with_suffix('.tmp')
        with z.open(name) as src,open(tmp,'wb') as dst:
            for b in iter(lambda:src.read(1024*1024),b''):dst.write(b)
        tmp.replace(POP_FILE);metadata(POP_FILE,POP_URL,archive_member=name)
    return POP_FILE
if __name__=='__main__':setup_logging();download_population()
