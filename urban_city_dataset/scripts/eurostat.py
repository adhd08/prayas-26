"""Download Urban Audit context separately: administrative boundaries do not match GHSL."""
import json, logging, time
import numpy as np
import pandas as pd
from common import *
# Codes are checked against response labels below; labels are retained verbatim.
CITIES={'Copenhagen':('DK001C','københavn'),'Amsterdam':('NL002C','amsterdam'),'Barcelona':('ES002C','barcelona'),'Zurich':('CH002C','zurich'),'Vienna':('AT001C','wien'),'London':('UK001C','london'),'Paris':('FR001C','paris'),'Berlin':('DE001C','berlin'),'Madrid':('ES001C','madrid'),'Rome':('IT001C','roma')}
TABLES=['urb_cpop1','urb_ctran','urb_cenv','urb_ceduc','urb_clivcon']
def main():
    setup_logging();base=pd.read_csv(OUT/'city_level/cities_base.csv');rows=[];quality=[];sources=[]
    for city,(code,expected) in CITIES.items():
        match=base[base.city_name==city]
        if match.empty:continue
        cid=match.iloc[0].city_id
        for table in TABLES:
            url=f'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{table}?lang=EN&cities={code}&sinceTimePeriod=2015'
            if table=='urb_cpop1':url+='&indic_ur=DE1001V'
            path=RAW/'eurostat'/f'{code}_{table}.json'
            try:
                j=cached_json(url,path);dims=j['dimension'];label=dims['cities']['category'].get('label',{}).get(code)
                if label is None and not j.get('value'):
                    quality.append(dict(city_id=cid,dataset='eurostat_'+table,status='no_observations',records_found=0,missing_fields='',warnings='No observations returned for this city code.'))
                    continue
                if expected not in label.casefold():raise ValueError(f'Code/name mismatch: {city} -> {label}')
                lookup={dim:{v:k for k,v in dims[dim]['category']['index'].items()} for dim in j['id']}
                values=j.get('value',{});values=values.items() if isinstance(values,dict) else enumerate(values)
                count=0
                for index,value in values:
                    if value is None:continue
                    coords=np.unravel_index(int(index),tuple(j['size']));r={d:lookup[d][int(i)] for d,i in zip(j['id'],coords)}
                    indic=r.get('indic_ur');rows.append({'city_id':cid,'city_name':city,'eurostat_city_code':code,'eurostat_city_label':label,'dataset':table,'indicator':indic,'indicator_label':dims['indic_ur']['category']['label'].get(indic),'year':r.get('time'),'value':value,'status_flag':j.get('status',{}).get(str(index),'') if isinstance(j.get('status',{}),dict) else '', 'source_url':url,'boundary_compatible_with_ghsl':False});count+=1
                meta=json.loads(Path(str(path)+'.meta.json').read_text())
                quality.append(dict(city_id=cid,dataset='eurostat_'+table,status='context_only' if count else 'no_observations',records_found=count,missing_fields='',warnings='Administrative city/greater city; not joined to GHSL features.'))
                sources.append(dict(city_id=cid,field_or_dataset='eurostat_'+table,source_name='Eurostat Urban Audit',source_url=url,download_date=meta['download_date'],license='European Commission reuse policy; acknowledge Eurostat',notes=f'{code}: {label}; administrative context only, not GHSL boundary.'))
                logging.info('%s %s: %s observations',city,table,count)
            except Exception as exc:
                logging.warning('Eurostat %s %s: %s',city,table,exc);quality.append(dict(city_id=cid,dataset='eurostat_'+table,status='failed',records_found=None,missing_fields='',warnings=str(exc)))
            time.sleep(.25)
    pd.DataFrame(rows).to_csv(OUT/'city_level/eurostat_context.csv',index=False)
    pd.DataFrame(quality).to_csv(OUT/'city_level/eurostat_quality.csv',index=False)
    pd.DataFrame(sources).to_csv(OUT/'city_level/eurostat_sources.csv',index=False)
if __name__=='__main__':main()
