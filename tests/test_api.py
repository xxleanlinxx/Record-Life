import datetime as dt
from uuid import uuid4
import duckdb
import pytest
from fastapi.testclient import TestClient
from api.main import create_app
from core import db, fx

@pytest.fixture
def client(tmp_path):
    con=duckdb.connect(str(tmp_path/'api.duckdb'))
    db.ensure_schema(con,seed=True)
    con.executemany('insert into dim_fx_rate(rate_date,base_ccy,quote_ccy,rate,source) values (?,?,?,?,?)',[(fx.d_minus_1(),'USD',c,r,'test') for c,r in {'USD':1,'TWD':32,'JPY':150,'EUR':.85,'GBP':.75,'KRW':1350}.items()])
    with TestClient(create_app(con)) as client:
        yield client
    con.close()

def snapshot(c,tid='t1'):
    res=c.get(f'/api/trips/{tid}')
    assert res.status_code==200,res.text
    return res.json()

def expense(**extra):
    return dict(title='測試午餐',category='Food',amount=1500,currency='JPY',when='2026-10-03',payer='mia',split=['mia','alex'],submission_id=uuid4().hex,**extra)

def test_snapshot_and_contract(client):
    d=snapshot(client)
    assert d['trip']['n_days']==6
    assert d['revision']>0
    assert len(d['fx']['rates'])==6
    assert d['fx']['date']==str(fx.d_minus_1())
    assert client.get('/api/bootstrap').status_code==200
    assert client.get('/api/trips/missing').status_code==404

def test_expense_idempotency_edit_conflict_and_delete(client):
    before=snapshot(client)
    body=expense()
    r=client.post('/api/trips/t1/expenses',json=body)
    assert r.status_code==201,r.text
    eid=r.json()['expense_id']
    assert client.post('/api/trips/t1/expenses',json=body).json()['expense_id']==eid
    d=snapshot(client)
    assert len(d['expenses'])==len(before['expenses'])+1
    assert sum(x['spent_home'] for x in d['daily'])==pytest.approx(sum(x['spent_home'] for x in before['daily'])+10)
    assert abs(sum(x['balance_home'] for x in d['balances']))<.01
    assert client.delete(f'/api/trips/t1/expenses/{eid}',headers={'If-Match':str(before['revision'])}).status_code==409
    edit={**body,'submission_id':uuid4().hex,'replaces':eid,'amount':3000}
    r=client.post('/api/trips/t1/expenses',json=edit,headers={'If-Match':str(d['revision'])})
    assert r.status_code==201,r.text
    eid=r.json()['expense_id']
    d=snapshot(client)
    assert len(d['expenses'])==len(before['expenses'])+1
    assert client.delete(f'/api/trips/t1/expenses/{eid}',headers={'If-Match':str(d['revision'])}).status_code==200
    assert len(snapshot(client)['expenses'])==len(before['expenses'])

def test_create_and_isolate_trips(client):
    res=client.post('/api/trips',json={'name':'台北週末','start':'2026-10-01','end':'2026-10-04','home':'TWD','local':'TWD','budget':10000,'members':['我','小安']})
    assert res.status_code==201,res.text
    tid=res.json()['trip_id'];d=snapshot(client,tid)
    assert d['expenses']==[]
    assert len(d['members'])==2
    assert client.post(f'/api/trips/{tid}/expenses',json=expense()).status_code==400
    assert client.post(f'/api/trips/{tid}/members',json={'name':'小安'}).status_code==400
    assert client.post(f'/api/trips/{tid}/members',json={'name':'小明'}).status_code==200

@pytest.mark.parametrize('kind,body',[
 ('activities',dict(day=1,time='09:00',kind='sight',title='測試景點',place='清水寺',locality='京都',currency='JPY')),
 ('bookings',dict(kind='flight',title='跨時區航班',start='2026-10-01T23:00',end='2026-10-01T20:00',start_zone='Asia/Taipei',end_zone='America/Los_Angeles',currency='TWD')),
 ('shopping',dict(title='抹茶',where='京都',price=1000,currency='JPY'))])
def test_crud_scopes(client,kind,body):
    d=snapshot(client)
    assert client.post(f'/api/trips/t1/{kind}',json=body).status_code==201
    d=snapshot(client);key={'activities':'itinerary','bookings':'bookings','shopping':'shopping'}[kind]
    row=next(x for x in d[key] if x['title']==body['title']);id=row.get('item_id',row.get('booking_id'))
    edit={**body,'title':'已修改'}
    assert client.put(f'/api/trips/t1/{kind}/{id}',json=edit,headers={'If-Match':str(d['revision'])}).status_code==200
    d=snapshot(client)
    assert client.delete(f'/api/trips/t1/{kind}/{id}',headers={'If-Match':str(d['revision'])}).status_code==200
    assert not any(x['title']=='已修改' for x in snapshot(client)[key])
    d=snapshot(client)
    assert client.put(f'/api/trips/t1/{kind}/999999',json=edit,headers={'If-Match':str(d['revision'])}).status_code==404

def test_shopping_expense_atomic_link(client):
    client.post('/api/trips/t1/shopping',json={'title':'連動測試','price':1500,'currency':'JPY'})
    d=snapshot(client);item=next(x for x in d['shopping'] if x['title']=='連動測試')
    r=client.post('/api/trips/t1/expenses',json=expense(shopping_id=item['item_id']))
    assert r.status_code==201,r.text
    d=snapshot(client);item=next(x for x in d['shopping'] if x['title']=='連動測試')
    assert item['expense_id']==r.json()['expense_id'] and item['is_bought']
    assert client.post('/api/trips/t1/expenses',json=expense(shopping_id=item['item_id'])).status_code==400
    assert client.patch(f"/api/trips/t1/shopping/{item['item_id']}",json={'bought':False},headers={'If-Match':str(d['revision'])}).status_code==400

def test_backup_authorization_and_validation(client,monkeypatch):
    result=client.get('/api/backup')
    assert result.status_code==200,result.text
    assert result.json()['format']=='record-life'
    assert len(result.json()['tables'])==13
    assert client.get('/api/bootstrap',headers={'Origin':'https://untrusted.example'}).status_code==403
    assert client.get('/api/bootstrap',headers={'Origin':'http://127.0.0.1:5173'}).status_code==200
    assert client.post('/api/trips/t1/expenses',json={**expense(),'amount':-1}).status_code==422
    monkeypatch.setenv('RECORD_LIFE_API_TOKEN','a-private-token')
    assert client.get('/api/bootstrap').status_code==401
    assert client.get('/api/bootstrap',headers={'Authorization':'Bearer a-private-token'}).status_code==200
