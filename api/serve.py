"""Production entry point with an explicit network/authentication boundary."""
import os
import uvicorn

def main():
    host=os.environ.get('RECORD_LIFE_HOST','127.0.0.1')
    if host not in ('127.0.0.1','localhost','::1') and not os.environ.get('RECORD_LIFE_API_TOKEN'):
        raise SystemExit('Set RECORD_LIFE_API_TOKEN before exposing this API beyond loopback.')
    uvicorn.run('api.main:app',host=host,port=int(os.environ.get('PORT','8000')),workers=1)

if __name__=='__main__':main()
