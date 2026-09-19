"""Run Streamlit against an isolated fixture for browser navigation tests."""
import os
from pathlib import Path
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
with tempfile.TemporaryDirectory(prefix='record-life-streamlit-e2e-') as directory:
    os.environ['RECORD_LIFE_DB'] = str(Path(directory) / 'test.duckdb')
    from core import db, fx
    import duckdb
    con = duckdb.connect(str(db.DB_PATH))
    db.ensure_schema(con, seed=True)
    con.executemany('insert into dim_fx_rate(rate_date,base_ccy,quote_ccy,rate,source) values (?,?,?,?,?)', [
        (fx.d_minus_1(), 'USD', code, rate, 'test-fixture')
        for code, rate in {'USD': 1, 'TWD': 32, 'JPY': 150, 'EUR': .85, 'GBP': .75, 'KRW': 1350}.items()
    ])
    con.close()
    from streamlit.web import cli
    sys.argv = ['streamlit', 'run', str(root / 'app.py'), '--server.port=8503',
                '--server.address=127.0.0.1', '--server.headless=true', '--server.fileWatcherType=none']
    cli.main()
