"""Start the device app; --server also starts the optional native DuckDB API."""
import argparse
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server', action='store_true', help='Use the legacy native DuckDB API')
    args = parser.parse_args()
    for port in ((8000, 5173) if args.server else (5173,)):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                sys.exit(f'Port {port} is already in use. Stop the existing server first.')
    processes = []
    try:
        if args.server:
            processes.append(subprocess.Popen(
                [sys.executable, '-m', 'uvicorn', 'api.main:app', '--host', '127.0.0.1', '--port', '8000'],
                cwd=ROOT, start_new_session=True))
        env = {**os.environ, 'VITE_STORAGE_MODE': 'server' if args.server else 'device'}
        env.pop('VITE_API_URL', None)
        processes.append(subprocess.Popen(
            ['npm', 'run', 'dev'], cwd=ROOT / 'web', env=env, start_new_session=True))
        print('\nRecord Life → http://127.0.0.1:5173/\n', flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(.5)
        raise SystemExit('A development server exited. See its output above.')
    except KeyboardInterrupt:
        pass
    finally:
        for p in processes:
            if p.poll() is None:
                os.killpg(p.pid, signal.SIGTERM)
        for p in processes:
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
                p.wait()


if __name__ == '__main__':
    main()
