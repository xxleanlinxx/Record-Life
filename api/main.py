"""HTTP adapter for the existing domain services; one local DuckDB writer."""
from contextlib import asynccontextmanager
from dataclasses import asdict
import hmac
import os

import duckdb
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core import db,fx,services
from api import models

ALLOWED_ORIGINS = [x.strip() for x in os.getenv('RECORD_LIFE_ORIGINS','http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173').split(',')]

def create_app(connection=None):
    @asynccontextmanager
    async def lifespan(app):
        if connection is None:
            db.DB_PATH.parent.mkdir(parents=True,exist_ok=True)
            app.state.con = duckdb.connect(str(db.DB_PATH))
            db.ensure_schema(app.state.con)
        else:
            app.state.con = connection
        yield
        if connection is None:
            app.state.con.close()

    def authorize(request: Request):
        origin = request.headers.get('origin')
        if origin and origin not in ALLOWED_ORIGINS:
            raise HTTPException(403,'此來源尚未授權連線。')
        token = os.getenv('RECORD_LIFE_API_TOKEN')
        if token and not hmac.compare_digest(request.headers.get('authorization',''),f'Bearer {token}'):
            raise HTTPException(401,'請輸入存取密碼以開啟旅行手帳。')

    app = FastAPI(title='Record Life API',version='2.0.0',lifespan=lifespan,dependencies=[Depends(authorize)])
    app.add_middleware(CORSMiddleware,allow_origins=ALLOWED_ORIGINS,allow_methods=['GET','POST','PUT','PATCH','DELETE'],
        allow_headers=['Content-Type','Authorization','If-Match'],expose_headers=['ETag'])

    def con():
        return app.state.con

    def rows(sql,params=None):
        frame = db.q(con(),sql,params)
        frame = frame.astype(object).where(pd.notna(frame),None)
        return jsonable_encoder(frame.to_dict('records'))

    def version(tid):
        found = rows('select revision from app_trip_revision where trip_id=?',[tid])
        if not found:
            raise HTTPException(404,'找不到這趟旅程。')
        return int(found[0]['revision'])

    def check_version(tid,request):
        if request.headers.get('if-match') != str(version(tid)):
            raise HTTPException(409,'資料已在其他頁面更新。請重新載入後再試，避免覆蓋新的內容。')

    def require_item(tid, table, key, item_id):
        if not rows(f'select {key} from {table} where trip_id=? and {key}=?',[tid,item_id]):
            raise HTTPException(404,'找不到這項資料，可能已被刪除。')

    def fx_info():
        with db.LOCK:
            status = fx.rate_status(con())
            rate_rows = rows("select quote_ccy,rate from dim_fx_rate where base_ccy='USD' and rate_date=?",[status.date]) if status.date else []
            return {**asdict(status),'target_date':fx.d_minus_1(),'rates':{r['quote_ccy']:r['rate'] for r in rate_rows}}

    @app.exception_handler(ValueError)
    async def invalid(request,exc):
        return JSONResponse(status_code=400,content={'detail':str(exc)})

    @app.exception_handler(RequestValidationError)
    async def validation(request,exc):
        return JSONResponse(status_code=422,content={'detail':'請確認必填欄位、日期與金額格式。',
            'fields':['.'.join(str(x) for x in e['loc'][1:]) for e in exc.errors()]})

    @app.exception_handler(duckdb.Error)
    async def database_error(request,exc):
        return JSONResponse(status_code=409,content={'detail':'資料未能儲存，請重新載入後再試。原有資料已保留。'})

    @app.get('/api/health')
    def health():
        return {'status':'ok','version':'2.0.0'}

    @app.get('/api/bootstrap')
    def bootstrap():
        return {'trips':rows('select * from dim_trip order by start_date desc,trip_id'),'fx':fx_info()}

    @app.post('/api/fx/refresh')
    def refresh_fx():
        result = fx.ensure_rates(con(),force=True)
        return {**fx_info(),'error':result.error}

    @app.post('/api/demo')
    def demo():
        with db.LOCK:
            if rows('select trip_id from dim_trip limit 1'):
                raise HTTPException(409,'已經有旅程資料，無法再次載入範例。')
            db.ensure_schema(con(),seed=True)
            return {'trip_id':'t1'}

    @app.post('/api/trips',status_code=201)
    def add_trip(body:models.TripCreate):
        return {'trip_id':services.create_trip(con(),**body.model_dump())}

    @app.get('/api/trips/{tid}')
    def snapshot(tid:str):
        with db.LOCK:
            revision = version(tid)
            return {'revision':revision,'trip':rows('select * from dim_trip where trip_id=?',[tid])[0],
                'members':rows('select * from dim_member where trip_id=? order by is_owner desc,display_name',[tid]),
                'itinerary':rows('''select i.*,p.name place,p.locality,p.gmaps_place_id from dwd_itinerary_item i
                    left join dim_place p using(place_id) where i.trip_id=? order by day_no,start_time,item_id''',[tid]),
                'bookings':rows('''select b.*,p.name place,p.locality,p.gmaps_place_id from dwd_booking b
                    left join dim_place p using(place_id) where b.trip_id=? order by starts_at,booking_id''',[tid]),
                'shopping':rows('select * from dwd_shopping_item where trip_id=? order by is_bought,item_id',[tid]),
                'expenses':rows('''select e.*,m.display_name payer from v_dwd_expense_home e join dim_member m using(member_id)
                    where e.trip_id=? order by spent_at desc,expense_id desc''',[tid]),
                'splits':rows('''select s.* from dwd_expense_split s join v_dwd_expense_home e using(expense_id) where e.trip_id=?''',[tid]),
                'daily':rows('select * from dws_trip_daily where trip_id=? order by day_no',[tid]),
                'categories':rows('select * from dws_trip_category where trip_id=? order by actual_home desc',[tid]),
                'balances':rows('''select b.*,m.display_name from dws_member_balance b join dim_member m using(member_id)
                    where b.trip_id=? order by m.display_name''',[tid]),'fx':fx_info()}

    @app.put('/api/trips/{tid}')
    def edit_trip(tid:str,body:models.TripEdit,request:Request):
        with db.LOCK:
            check_version(tid,request)
            services.update_trip(con(),tid,**body.model_dump())
        return {'ok':True}

    @app.post('/api/trips/{tid}/currency')
    def currency(tid:str,body:models.CurrencyChange,request:Request):
        with db.LOCK:
            check_version(tid,request)
            services.change_home_currency(con(),tid,body.home)
        return {'ok':True}

    @app.post('/api/trips/{tid}/members')
    def member(tid:str,body:models.Member):
        services.add_member(con(),tid,body.name)
        return {'ok':True}

    @app.post('/api/trips/{tid}/expenses',status_code=201)
    def expense(tid:str,body:models.Expense,request:Request):
        with db.LOCK:
            if body.replaces is not None and not rows('select expense_id from dwd_expense where trip_id=? and submission_id=?',[tid,body.submission_id]):
                check_version(tid,request)
            eid = services.save_expense(con(),tid,**body.model_dump())
            return {'expense_id':eid,'expense':rows('select * from v_dwd_expense_home where expense_id=?',[eid])[0]}

    @app.delete('/api/trips/{tid}/expenses/{eid}')
    def delete_expense(tid:str,eid:int,request:Request):
        with db.LOCK:
            check_version(tid,request)
            services.delete_expense(con(),tid,eid)
        return {'ok':True}

    @app.post('/api/trips/{tid}/activities',status_code=201)
    def activity(tid:str,body:models.Activity):
        services.save_itinerary(con(),tid,**body.model_dump())
        return {'ok':True}

    @app.put('/api/trips/{tid}/activities/{item_id}')
    def edit_activity(tid:str,item_id:int,body:models.Activity,request:Request):
        with db.LOCK:
            check_version(tid,request)
            require_item(tid,'dwd_itinerary_item','item_id',item_id)
            services.save_itinerary(con(),tid,**body.model_dump(),item_id=item_id)
        return {'ok':True}

    @app.post('/api/trips/{tid}/bookings',status_code=201)
    def booking(tid:str,body:models.Booking):
        services.save_booking(con(),tid,**body.model_dump())
        return {'ok':True}

    @app.put('/api/trips/{tid}/bookings/{bid}')
    def edit_booking(tid:str,bid:int,body:models.Booking,request:Request):
        with db.LOCK:
            check_version(tid,request)
            require_item(tid,'dwd_booking','booking_id',bid)
            services.save_booking(con(),tid,**body.model_dump(),booking_id=bid)
        return {'ok':True}

    @app.post('/api/trips/{tid}/shopping',status_code=201)
    def shopping(tid:str,body:models.Shopping):
        services.save_shopping(con(),tid,**body.model_dump())
        return {'ok':True}

    @app.put('/api/trips/{tid}/shopping/{item_id}')
    def edit_shopping(tid:str,item_id:int,body:models.Shopping,request:Request):
        with db.LOCK:
            check_version(tid,request)
            require_item(tid,'dwd_shopping_item','item_id',item_id)
            services.save_shopping(con(),tid,**body.model_dump(),item_id=item_id)
        return {'ok':True}

    @app.patch('/api/trips/{tid}/shopping/{item_id}')
    def bought(tid:str,item_id:int,body:models.Bought,request:Request):
        with db.LOCK:
            check_version(tid,request)
            services.set_bought(con(),tid,item_id,body.bought)
        return {'ok':True}

    @app.delete('/api/trips/{tid}/{kind}/{item_id}')
    def remove(tid:str,kind:str,item_id:int,request:Request):
        tables = {'activities':('dwd_itinerary_item','item_id'),'bookings':('dwd_booking','booking_id'),'shopping':('dwd_shopping_item','item_id')}
        if kind not in tables:
            raise HTTPException(404,'找不到這項資料。')
        with db.LOCK:
            check_version(tid,request)
            require_item(tid,*tables[kind],item_id)
            services.delete_item(con(),tid,*tables[kind],item_id)
        return {'ok':True}

    @app.get('/api/backup')
    def backup():
        tables = ['dim_currency','dim_category','dim_fx_rate','dim_place','dim_trip','dim_member','dim_trip_budget',
            'dwd_expense','dwd_expense_split','dwd_itinerary_item','dwd_booking','dwd_shopping_item','dwd_currency_change']
        with db.LOCK:
            return JSONResponse(content=jsonable_encoder({'format':'record-life','version':1,'tables':{t:rows(f'select * from {t}') for t in tables}}),
                headers={'Content-Disposition':'attachment; filename="record-life-backup.json"'})

    return app

app = create_app()
