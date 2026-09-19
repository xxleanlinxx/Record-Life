"""Generate a data-free-of-user-content v1 fixture in the browser storage format."""
from pathlib import Path
import sys
import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import db

if __name__ == '__main__':
    target = str(Path(sys.argv[1]).resolve()).replace("'", "''")
    with duckdb.connect(':memory:') as con:
        con.execute(f"ATTACH '{target}' AS fixture (STORAGE_VERSION 'v1.3.0')")
        con.execute('USE fixture')
        db.ensure_schema(con, seed=True)
        con.execute('CHECKPOINT')
