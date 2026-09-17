"""Build the empty, data-free DuckDB 1.3 storage template bundled with the UI.

A registered valid file buffer is needed for writable WASM snapshots. Opening
an unregistered path uses a different virtual filesystem and cannot be exported
via copyFileToBuffer. This template contains no user data and no application tables.
Only needed when intentionally updating the bundled engine/storage format.
"""
from pathlib import Path
import tempfile
import shutil
import duckdb

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    target=root/'web/src/lib/device/empty-db.bin'
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'empty.duckdb'
        con=duckdb.connect(':memory:')
        con.execute(f"ATTACH '{str(path).replace(chr(39),chr(39)*2)}' AS blank (STORAGE_VERSION 'v1.3.0')")
        con.close()
        shutil.copyfile(path,target)
    print(f'Created data-free template: {target} ({target.stat().st_size} bytes)')
