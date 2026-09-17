"""Isolated browser-test server; never opens the user's database."""
import os
from pathlib import Path
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
with tempfile.TemporaryDirectory(prefix='record-life-e2e-') as directory:
    os.environ['RECORD_LIFE_DB']=str(Path(directory)/'test.duckdb')
    os.environ['RECORD_LIFE_ORIGINS']='http://127.0.0.1:5174'
    from core import db,fx
    import duckdb
    c=duckdb.connect(str(db.DB_PATH))
    db.ensure_schema(c)
    c.executemany('insert into dim_fx_rate(rate_date,base_ccy,quote_ccy,rate,source) values (?,?,?,?,?)',[(fx.d_minus_1(),'USD',ccy,rate,'test-fixture') for ccy,rate in {'USD':1,'TWD':32,'JPY':150,'EUR':.85,'GBP':.75,'KRW':1350}.items()])
    c.close()
    import uvicorn
    uvicorn.run('api.main:app',host='127.0.0.1',port=8001,log_level='warning')
