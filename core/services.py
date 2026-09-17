"""Validated writes: detail records and summaries commit together."""
import datetime as dt
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo
from core import db, fx

CATEGORIES = ["Transport", "Stay", "Food", "Sights", "Shopping", "Other"]
KINDS = ["flight", "transport", "hotel", "sight", "food", "shop"]

def required(value, label):
    value = str(value).strip()
    if not value:
        raise ValueError(f"{label} is required.")
    return value

def money(value, positive=False):
    value = fx.decimal(value)
    if value < 0 or value > Decimal("999999999999"):
        raise ValueError("Amount must be positive." if positive else "Amount must be non-negative and within range.")
    value = value.quantize(Decimal("0.01"))
    if positive and value == 0:
        raise ValueError("Amount must be at least 0.01.")
    return value

def trip(con, tid):
    row = db.q(con,"select * from dim_trip where trip_id=?",[tid])
    if row.empty:
        raise ValueError("Trip not found.")
    return row.iloc[0]

def next_id(con, table, column):
    return con.execute(f"select coalesce(max({column}),0)+1 from {table}").fetchone()[0]

def create_trip(con, name, start, end, home, local, budget, members):
    name = required(name,"Trip name")
    names = [n.strip() for n in members if n.strip()]
    if not names or len(names) != len(set(names)):
        raise ValueError("Enter at least one member; member names must be unique.")
    if end < start or (end-start).days > 365:
        raise ValueError("Trip duration must be between 1 and 366 days.")
    if home not in fx.HOME_CURRENCIES or local not in fx.SPEND_CURRENCIES:
        raise ValueError("Unsupported currency.")
    tid = uuid4().hex
    with db.transaction(con):
        con.execute("""insert into dim_trip(trip_id,name,start_date,end_date,dates_label,home_currency,local_currency,budget_home)
            values (?,?,?,?,?,?,?,?)""",[tid,name,start,end,f"{start:%b %d} – {end:%b %d, %Y}",home,local,money(budget)])
        con.executemany("insert into dim_member values (?,?,?,?)",[(uuid4().hex,tid,n,i==0) for i,n in enumerate(names)])
        con.executemany("insert into dim_trip_budget values (?,?,?)",[(tid,c,0) for c in CATEGORIES])
        db._refresh_dws(con,tid)
    return tid

def update_trip(con, tid, name, start, end, local, budget, category_budgets):
    with db.transaction(con):
        old = trip(con,tid)
        if end < start or (end-start).days > 365:
            raise ValueError("Trip duration must be between 1 and 366 days.")
        if local not in fx.SPEND_CURRENCIES:
            raise ValueError("Unsupported currency.")
        if con.execute("select 1 from dwd_itinerary_item where trip_id=? and day_no>? limit 1",[tid,(end-start).days+1]).fetchone():
            raise ValueError("Move itinerary items within the new trip length first.")
        if con.execute("select 1 from dwd_expense where trip_id=? and not is_deleted and cast(spent_at as date)>? limit 1",[tid,end]).fetchone():
            raise ValueError("Trip end must include all recorded expenses.")
        budget = money(budget)
        amounts = {c:money(category_budgets.get(c,0)) for c in CATEGORIES}
        if sum(amounts.values()) > budget:
            raise ValueError("Category budgets cannot exceed the total budget.")
        con.execute("update dim_trip set name=?,start_date=?,end_date=?,dates_label=?,local_currency=?,budget_home=? where trip_id=?",
            [required(name,"Trip name"),start,end,f"{start:%b %d} – {end:%b %d, %Y}",local,budget,tid])
        for c,amount in amounts.items():
            con.execute("insert or replace into dim_trip_budget values (?,?,?)",[tid,c,amount])
        if start != old.start_date:
            con.execute("update dwd_expense set day_no=greatest(0,date_diff('day',?,cast(spent_at as date))+1) where trip_id=?",[start,tid])
        db._refresh_dws(con,tid)

def add_member(con, tid, name):
    with db.transaction(con):
        trip(con,tid)
        name = required(name,"Member name")
        if con.execute("select 1 from dim_member where trip_id=? and display_name=?",[tid,name]).fetchone():
            raise ValueError("Member name already exists.")
        con.execute("insert into dim_member values (?,?,?,false)",[uuid4().hex,tid,name])
        db._refresh_dws(con,tid)

def change_home_currency(con, tid, home):
    with db.transaction(con):
        old = trip(con,tid).home_currency
        if home not in fx.HOME_CURRENCIES:
            raise ValueError("Unsupported home currency.")
        if home == old:
            return
        factor,date = fx.factor(con,old,home)
        con.execute("update dim_trip set home_currency=?,budget_home=budget_home*? where trip_id=?",[home,factor,tid])
        con.execute("update dim_trip_budget set planned_home=planned_home*? where trip_id=?",[factor,tid])
        con.execute("update dwd_expense set booked_home_amount=booked_home_amount*?,booked_home_currency=? where trip_id=?",[factor,home,tid])
        con.execute("insert into dwd_currency_change(change_id,trip_id,from_ccy,to_ccy,factor,rate_date) values (?,?,?,?,?,?)",[uuid4().hex,tid,old,home,factor,date])
        db._refresh_dws(con,tid)

def save_expense(con, tid, title, category, amount, currency, when, payer, split, submission_id, shopping_id=None, replaces=None):
    with db.transaction(con):
        submission_id = required(submission_id,"Submission ID")
        existing = con.execute("select expense_id from dwd_expense where submission_id=? and trip_id=?",[submission_id,tid]).fetchone()
        if existing:
            return existing[0]
        t = trip(con,tid)
        amount = money(amount,positive=True)
        if currency not in fx.SPEND_CURRENCIES or category not in CATEGORIES:
            raise ValueError("Choose a supported category and currency.")
        members = {m for (m,) in con.execute("select member_id from dim_member where trip_id=?",[tid]).fetchall()}
        split = list(dict.fromkeys(split))
        if payer not in members or not split or not set(split) <= members:
            raise ValueError("Choose a payer and at least one participant from this trip.")
        if when > t.end_date:
            raise ValueError("Expense date must be on or before the trip end date.")
        if shopping_id is not None:
            item = con.execute("select expense_id from dwd_shopping_item where trip_id=? and item_id=?",[tid,shopping_id]).fetchone()
            if item is None or (item[0] is not None and item[0] != replaces):
                raise ValueError("Shopping item is missing or already linked to an expense.")
        rate,date = fx.factor(con,currency,t.home_currency)
        eid = next_id(con,"dwd_expense","expense_id")
        if replaces is not None:
            _void_expense(con,tid,replaces)
        con.execute("""insert into dwd_expense(expense_id,trip_id,day_no,spent_at,title,category,amount,currency,member_id,
            fx_rate_date,booked_home_amount,booked_home_currency,fx_home_currency,applied_fx_rate,submission_id)
            values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",[eid,tid,max(0,(when-t.start_date).days+1),dt.datetime.combine(when,dt.time(12)),
            required(title,"Expense description"),category,amount,currency,payer,date,amount*rate,t.home_currency,t.home_currency,rate,submission_id])
        con.executemany("insert into dwd_expense_split values (?,?,?)",[(eid,m,1/len(split)) for m in split])
        if shopping_id is not None:
            con.execute("update dwd_shopping_item set expense_id=?,is_bought=true,updated_at=now() where item_id=?",[eid,shopping_id])
        db._refresh_dws(con,tid)
        return eid

def _void_expense(con, tid, eid):
    if not con.execute("select 1 from dwd_expense where expense_id=? and trip_id=? and not is_deleted",[eid,tid]).fetchone():
        raise ValueError("Expense no longer exists. Reload this page.")
    con.execute("update dwd_shopping_item set expense_id=null,is_bought=false,updated_at=now() where expense_id=?",[eid])
    con.execute("update dwd_expense set is_deleted=true where expense_id=?",[eid])

def delete_expense(con, tid, eid):
    with db.transaction(con):
        _void_expense(con,tid,eid)
        db._refresh_dws(con,tid)

def _place(con, name, locality, google_id):
    if not name.strip():
        return None
    pid = uuid4().hex
    con.execute("insert into dim_place(place_id,name,locality,gmaps_place_id) values (?,?,?,?)",[pid,name.strip(),locality.strip(),google_id.strip() or None])
    return pid

def save_itinerary(con, tid, day, time, kind, title, place, locality, google_id, cost, currency, notes, item_id=None):
    with db.transaction(con):
        t = trip(con,tid)
        if not 1 <= day <= t.n_days or kind not in KINDS or currency not in fx.SPEND_CURRENCIES:
            raise ValueError("Invalid day, activity type or currency.")
        pid = _place(con,place,locality,google_id)
        values = [day,time.strftime("%H:%M"),kind,required(title,"Activity"),pid,money(cost),currency,notes]
        if item_id is None:
            item_id = next_id(con,"dwd_itinerary_item","item_id")
            con.execute("insert into dwd_itinerary_item values (?,?,?,?,?,?,?,?,?,?)",[item_id,tid]+values)
        else:
            con.execute("update dwd_itinerary_item set day_no=?,start_time=?,kind=?,title=?,place_id=?,planned_cost=?,planned_ccy=?,notes=? where trip_id=? and item_id=?",values+[tid,item_id])
        db._refresh_dws(con,tid)

def save_booking(con, tid, kind, title, provider, ref, confirmation, origin, destination, start, end, start_zone, end_zone, place, locality, google_id, price, currency, notes, booking_id=None):
    with db.transaction(con):
        trip(con,tid)
        if kind not in ("flight","hotel","reservation") or currency not in fx.SPEND_CURRENCIES:
            raise ValueError("Invalid booking type or currency.")
        try:
            utc_start = start.replace(tzinfo=ZoneInfo(start_zone)).astimezone(dt.timezone.utc)
            utc_end = end.replace(tzinfo=ZoneInfo(end_zone)).astimezone(dt.timezone.utc)
        except (KeyError,ValueError):
            raise ValueError("Use valid IANA time zones, such as Asia/Tokyo.") from None
        if utc_end < utc_start:
            raise ValueError("End time must be after start time, accounting for time zones.")
        pid = _place(con,place,locality,google_id)
        values = [kind,required(title,"Booking title"),provider,ref,confirmation,origin,destination,start,end,pid,
            None if price is None else money(price),currency,notes,start_zone,end_zone]
        if booking_id is None:
            booking_id = next_id(con,"dwd_booking","booking_id")
            con.execute("""insert into dwd_booking(booking_id,trip_id,kind,title,provider,ref_code,confirmation,origin,destination,
                starts_at,ends_at,place_id,price,price_ccy,notes,start_zone,end_zone) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",[booking_id,tid]+values)
        else:
            con.execute("""update dwd_booking set kind=?,title=?,provider=?,ref_code=?,confirmation=?,origin=?,destination=?,starts_at=?,
                ends_at=?,place_id=?,price=?,price_ccy=?,notes=?,start_zone=?,end_zone=? where trip_id=? and booking_id=?""",values+[tid,booking_id])
        db._refresh_dws(con,tid)

def save_shopping(con, tid, title, where, price, currency, item_id=None):
    with db.transaction(con):
        trip(con,tid)
        if currency not in fx.SPEND_CURRENCIES:
            raise ValueError("Unsupported currency.")
        values = [required(title,"Item"),where,money(price),currency]
        if item_id is None:
            con.execute("insert into dwd_shopping_item(trip_id,title,where_hint,planned_price,planned_ccy) values (?,?,?,?,?)",[tid]+values)
        else:
            con.execute("update dwd_shopping_item set title=?,where_hint=?,planned_price=?,planned_ccy=?,updated_at=now() where trip_id=? and item_id=?",values+[tid,item_id])
        db._refresh_dws(con,tid)

def set_bought(con, tid, item_id, bought):
    with db.transaction(con):
        row = con.execute("select expense_id from dwd_shopping_item where trip_id=? and item_id=?",[tid,item_id]).fetchone()
        if row is None:
            raise ValueError("Shopping item not found.")
        if row[0] is not None and not bought:
            raise ValueError("Delete the linked expense before marking this item as unbought.")
        con.execute("update dwd_shopping_item set is_bought=?,updated_at=now() where trip_id=? and item_id=?",[bought,tid,item_id])
        db._refresh_dws(con,tid)

def delete_item(con, tid, table, key, value):
    if (table,key) not in (("dwd_itinerary_item","item_id"),("dwd_booking","booking_id"),("dwd_shopping_item","item_id")):
        raise ValueError("Unsupported deletion.")
    with db.transaction(con):
        con.execute(f"delete from {table} where trip_id=? and {key}=?",[tid,value])
        db._refresh_dws(con,tid)
