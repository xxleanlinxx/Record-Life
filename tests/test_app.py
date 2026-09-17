import datetime as dt
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import duckdb
import pytest
import requests
from streamlit.testing.v1 import AppTest
from core import db,fx,services,maps

ROOT = Path(__file__).resolve().parents[1]
RATES = {"USD":1,"EUR":0.85,"GBP":0.75,"JPY":150,"TWD":32,"KRW":1350}

def rates(con,date=None,values=None):
    con.executemany("insert into dim_fx_rate(rate_date,base_ccy,quote_ccy,rate,source) values (?,?,?,?,?)",
        [(date or fx.d_minus_1(),"USD",q,v,"test") for q,v in (values or RATES).items()])

@pytest.fixture
def con(tmp_path):
    c = duckdb.connect(str(tmp_path/"test.duckdb"))
    db.ensure_schema(c,seed=True)
    rates(c)
    yield c
    c.close()

def total(con,tid="t1"):
    return con.execute("select sum(spent_home) from dws_trip_daily where trip_id=?",[tid]).fetchone()[0]

def expense(con,**overrides):
    data = dict(tid="t1",title="Test meal",category="Food",amount=1500,currency="JPY",when=dt.date(2026,10,3),
        payer="mia",split=["mia","alex"],submission_id=uuid4().hex)
    data.update(overrides)
    return services.save_expense(con,**data)

def test_schema_repeat_and_persistence(con):
    before = total(con)
    db.ensure_schema(con,seed=True)
    assert total(con)==before
    assert con.execute("select count(*) from dwd_expense").fetchone()[0]==10
    assert con.execute("select count(*) from schema_version").fetchone()[0]==1

def test_record_splits_dws_and_idempotency(con):
    before = total(con)
    eid = expense(con,submission_id="once")
    assert expense(con,submission_id="once")==eid
    assert total(con)==pytest.approx(before+10)
    assert con.execute("select sum(share) from dwd_expense_split where expense_id=?",[eid]).fetchone()[0]==pytest.approx(1)
    assert con.execute("select sum(balance_home) from dws_member_balance where trip_id='t1'").fetchone()[0]==pytest.approx(0,abs=1e-6)

def test_refresh_failure_rolls_back_every_write(con,monkeypatch):
    before = total(con)
    count = con.execute("select count(*) from dwd_expense").fetchone()[0]
    def fail(*args):
        raise RuntimeError("simulated summary failure")
    monkeypatch.setattr(db,"_refresh_dws",fail)
    with pytest.raises(RuntimeError):
        expense(con)
    assert total(con)==before
    assert con.execute("select count(*) from dwd_expense").fetchone()[0]==count

def test_fx_refresh_does_not_revalue_recorded_expenses(con,monkeypatch):
    expense(con)
    before = total(con)
    next_day = fx.d_minus_1()+dt.timedelta(days=1)
    monkeypatch.setattr(fx,"d_minus_1",lambda:next_day)
    rates(con,next_day,{**RATES,"JPY":200})
    db.refresh_dws(con,"t1")
    assert total(con)==before
    eid = expense(con)
    assert con.execute("select booked_home_amount from dwd_expense where expense_id=?",[eid]).fetchone()[0]==Decimal("7.5")

def test_currency_switch_preserves_budget_ratio(con):
    before = total(con)
    budget = services.trip(con,"t1").budget_home
    services.change_home_currency(con,"t1","TWD")
    assert services.trip(con,"t1").budget_home==pytest.approx(budget*32)
    assert total(con)==pytest.approx(before*32)
    assert con.execute("select count(*) from dwd_currency_change").fetchone()[0]==1
    assert con.execute("select count(*) from dwd_expense where currency='USD'").fetchone()[0]==2

def test_invalid_member_or_split_cannot_write(con):
    with pytest.raises(ValueError):
        expense(con,split=[])
    with pytest.raises(ValueError):
        expense(con,payer="not-a-member")
    with pytest.raises(ValueError):
        expense(con,amount=-10)

def test_correction_and_delete_shopping_link(con):
    before = total(con)
    item = con.execute("select min(item_id) from dwd_shopping_item").fetchone()[0]
    eid = expense(con,shopping_id=item)
    with pytest.raises(ValueError):
        expense(con,shopping_id=item)
    new = expense(con,shopping_id=item,replaces=eid,amount=3000)
    assert total(con)==pytest.approx(before+20)
    assert con.execute("select expense_id from dwd_shopping_item where item_id=?",[item]).fetchone()[0]==new
    services.delete_expense(con,"t1",new)
    assert total(con)==pytest.approx(before)
    assert con.execute("select expense_id,is_bought from dwd_shopping_item where item_id=?",[item]).fetchone()==(None,False)

def test_trip_creation_edit_and_isolation(con):
    original = total(con)
    tid = services.create_trip(con,"Taipei",dt.date(2026,11,1),dt.date(2026,11,3),"TWD","TWD",1000,["Me"])
    services.update_trip(con,tid,"Taipei edited",dt.date(2026,11,1),dt.date(2026,11,2),"TWD",1200,{"Food":600})
    services.add_member(con,tid,"Friend")
    assert services.trip(con,tid).n_days==2
    assert total(con,tid)==0
    assert total(con)==original
    assert con.execute("select count(*) from dws_trip_daily where trip_id=?",[tid]).fetchone()[0]==3

def test_future_or_partial_rates_not_usable(con):
    rates(con,fx.d_minus_1()+dt.timedelta(days=1))
    assert fx.latest_rate_date(con)==fx.d_minus_1()
    con.execute("delete from dim_fx_rate where source<>'seed'")
    rates(con,values={"USD":1,"TWD":32})
    assert fx.latest_rate_date(con) is None
    assert fx.convert(con,100,"TWD","TWD")==100
    with pytest.raises(fx.RateUnavailable):
        fx.convert(con,100,"TWD","USD")

def test_offline_preserves_complete_snapshot(con,monkeypatch):
    def offline(*args,**kwargs):
        raise requests.ConnectionError("offline")
    monkeypatch.setattr(fx.requests,"get",offline)
    result = fx.ensure_rates(con,force=True)
    assert result.date==fx.d_minus_1()
    assert result.error

def test_same_day_refresh_is_immutable(con,monkeypatch):
    monkeypatch.setattr(fx,"fetch_rates",lambda:fx.Snapshot(fx.d_minus_1(),{**RATES,"JPY":200},"new provider"))
    fx.ensure_rates(con,force=True)
    assert fx.convert(con,150,"JPY","USD")==1

def test_itinerary_and_booking_round_trip(con):
    services.save_itinerary(con,"t1",1,dt.time(9),"food","Lunch","Cafe","Kyoto","",1000,"JPY","Bring cash")
    item = con.execute("select max(item_id) from dwd_itinerary_item").fetchone()[0]
    services.save_itinerary(con,"t1",2,dt.time(10),"sight","Temple","Temple","Kyoto","",0,"JPY","",item)
    assert con.execute("select day_no from dwd_itinerary_item where item_id=?",[item]).fetchone()[0]==2
    services.delete_item(con,"t1","dwd_itinerary_item","item_id",item)
    services.save_booking(con,"t1","flight","Return","UA","1","ABC","KIX","SFO",dt.datetime(2026,10,8,17),
        dt.datetime(2026,10,8,11),"Asia/Tokyo","America/Los_Angeles","KIX","Osaka","",None,"JPY","")
    assert con.execute("select price from dwd_booking order by booking_id desc limit 1").fetchone()[0] is None

def test_maps_encode_names_and_ids():
    url = maps.search_url("A & B","台北","place&id")
    assert "A+%26+B" in url and "place%26id" in url
    assert "&amp;" in maps.link("A & B","Taipei")

def app(con,monkeypatch):
    monkeypatch.setattr(db,"connect",lambda:con)
    monkeypatch.setattr(fx,"ensure_rates",lambda *a,**kw:fx.RateStatus(fx.d_minus_1(),"test"))
    return AppTest.from_file(str(ROOT/"app.py"),default_timeout=20).run()

@pytest.mark.parametrize("page",["home","plan","record","bookings","budget"])
def test_five_pages_render(con,monkeypatch,page):
    t = app(con,monkeypatch)
    assert not t.exception
    if page!="home":
        t.switch_page(f"screens/{page}.py").run()
    assert not t.exception
    assert len(t.markdown)>1
    expected = {"home":"Manage this trip","plan":"Add activity","record":"What","bookings":"Add booking","budget":"Budget view"}
    if page in ("home","plan","bookings"):
        assert any(x.label==expected[page] for x in t.expander)
    elif page=="record":
        assert find(t.text_input,expected[page])
    else:
        assert find(t.radio,expected[page])

def find(elements,label):
    return next(x for x in elements if x.label==label)

def test_record_ui_submit_and_empty_split_validation(con,monkeypatch):
    t = app(con,monkeypatch).switch_page("screens/record.py").run()
    before = total(con)
    find(t.text_input,"What").input("UI meal")
    find(t.number_input,"Amount").set_value(1500)
    find(t.multiselect,"Split among").set_value([])
    find(t.button,"Save expense").click().run()
    assert not t.exception and t.error
    assert total(con)==before
    find(t.multiselect,"Split among").set_value(["mia","alex"])
    find(t.button,"Save expense").click().run()
    assert not t.exception
    assert total(con)==pytest.approx(before+10)

def test_ui_trip_switch_loads_its_currency(con,monkeypatch):
    tid = services.create_trip(con,"Taiwan",dt.date(2026,11,1),dt.date(2026,11,3),"TWD","TWD",1000,["Me"])
    t = app(con,monkeypatch)
    find(t.selectbox,"Trip").set_value("t1").run()
    assert t.session_state.home_currency=="USD"
    find(t.selectbox,"Trip").set_value(tid).run()
    assert t.session_state.home_currency=="TWD"
    t.switch_page("screens/budget.py").run()
    assert not t.exception

def test_empty_database_ui(monkeypatch):
    con = duckdb.connect(":memory:")
    db.ensure_schema(con)
    t = app(con,monkeypatch)
    assert not t.exception
    assert find(t.button,"Create trip")
    find(t.text_input,"Trip name").input("New journey")
    find(t.number_input,"Total budget").set_value(20000)
    find(t.button,"Create trip").click().run()
    assert not t.exception
    assert services.trip(con,t.session_state.trip_id)["name"]=="New journey"
    con.close()

def test_legacy_fk_migration_preserves_details():
    c = duckdb.connect(":memory:")
    sql = (db.SQL_DIR/"00_dim.sql").read_text()
    sql = sql.replace("check (home_currency in ('TWD','USD','EUR','GBP'))","references dim_currency(ccy)")
    sql = sql.replace("check (local_currency in ('TWD','USD','EUR','GBP','JPY','KRW'))","references dim_currency(ccy)")
    c.execute(sql)
    db.run_sql_file(c,"10_dwd.sql")
    db.run_sql_file(c,"40_v1.sql")
    db.run_sql_file(c,"30_seed.sql")
    db.ensure_schema(c)
    rates(c)
    assert c.execute("select count(*) from dwd_expense").fetchone()[0]==10
    assert c.execute("select count(*) from dwd_expense_split").fetchone()[0]==40
    services.change_home_currency(c,"t1","TWD")
    assert services.trip(c,"t1").budget_home==153600
    c.close()

def test_parallel_saves_are_serialized(con):
    from concurrent.futures import ThreadPoolExecutor
    before = total(con)
    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = list(pool.map(lambda _:expense(con),range(12)))
    assert len(set(ids))==12
    assert total(con)==pytest.approx(before+120)

def test_reopen_persists_saved_values(con):
    path = con.execute("pragma database_list").fetchone()[2]
    eid = expense(con)
    before = total(con)
    con.close()
    with duckdb.connect(path) as reopened:
        db.ensure_schema(reopened)
        assert total(reopened)==before
        assert reopened.execute("select booked_home_amount from dwd_expense where expense_id=?",[eid]).fetchone()[0]==10

def test_fx_provider_validates_dates_and_currency_coverage(monkeypatch):
    target = fx.d_minus_1()
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return [{"date":target.isoformat(),"base":"USD","quote":q,"rate":v} for q,v in RATES.items() if q!="USD"]
    monkeypatch.setattr(fx.requests,"get",lambda *a,**kw:Response())
    snapshot = fx.fetch_rates(target)
    assert snapshot.date==target and snapshot.rates["TWD"]==32
    with pytest.raises(fx.RateUnavailable):
        fx.validate_snapshot(target+dt.timedelta(days=1),RATES,"test",target)
    with pytest.raises(fx.RateUnavailable):
        fx.validate_snapshot(target,{"USD":1},"test",target)

def test_ui_shopping_and_budget_modes(con,monkeypatch):
    t = app(con,monkeypatch).switch_page("screens/plan.py").run()
    find(t.radio,"View").set_value("Shopping").run()
    assert not t.exception and len(t.checkbox)==5
    # One unchecked seeded item becomes bought without inventing a payment.
    before = total(con)
    item = next(x for x in t.checkbox if not x.value)
    item.check().run()
    assert not t.exception and total(con)==before
    t.switch_page("screens/budget.py").run()
    for mode in ["Per day","Plan vs actual","Category"]:
        find(t.radio,"Budget view").set_value(mode).run()
        assert not t.exception

def test_ui_add_activity_booking_and_currency_conversion(con,monkeypatch):
    t = app(con,monkeypatch).switch_page("screens/plan.py").run()
    find(t.text_input,"Activity").input("UI attraction")
    find(t.button,"Save activity").click().run()
    assert not t.exception
    assert con.execute("select count(*) from dwd_itinerary_item where title='UI attraction'").fetchone()[0]==1
    t.switch_page("screens/bookings.py").run()
    find(t.text_input,"Booking title").input("UI reservation")
    find(t.button,"Save booking").click().run()
    assert not t.exception
    assert con.execute("select price from dwd_booking where title='UI reservation'").fetchone()[0] is None
    before = total(con)
    find(t.selectbox,"Home currency").set_value("TWD")
    find(t.button,"Convert home currency").click().run()
    assert not t.exception and services.trip(con,"t1").home_currency=="TWD"
    assert total(con)==pytest.approx(before*32)

def test_weekend_snapshot_records_actual_date(con,monkeypatch):
    con.execute("delete from dim_fx_rate where source<>'seed'")
    date = fx.d_minus_1()-dt.timedelta(days=2)
    monkeypatch.setattr(fx,"fetch_rates",lambda:fx.Snapshot(date,RATES,"historical"))
    result = fx.ensure_rates(con)
    assert result.date==date
    eid = expense(con)
    assert con.execute("select fx_rate_date from dwd_expense where expense_id=?",[eid]).fetchone()[0]==date
