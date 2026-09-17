"""Small forms shared by the five screens."""
import datetime as dt
import streamlit as st
from core import fx, ui, services

def create_trip(con):
    with st.form("new_trip"):
        name = st.text_input("Trip name")
        a,b = st.columns(2)
        start = a.date_input("Departure",fx.today())
        end = b.date_input("Return",fx.today()+dt.timedelta(days=5))
        home = st.selectbox("Budget currency",fx.HOME_CURRENCIES)
        local = st.selectbox("Destination currency",fx.SPEND_CURRENCIES)
        budget = st.number_input("Total budget",min_value=0.0,step=1000.0)
        members = st.text_area("Members (one name per line)",value="Me")
        if st.form_submit_button("Create trip",type="primary"):
            try:
                tid = services.create_trip(con,name,start,end,home,local,budget,members.splitlines())
                st.session_state.pending_trip = tid
                ui.saved("Trip created. Add plans, bookings and expenses below.")
            except ValueError as exc:
                st.error(str(exc))

def place_fields(row=None):
    get = lambda key:ui.text(row.get(key)) if row is not None else ""
    name = st.text_input("Place name",value=get("place"))
    locality = st.text_input("City / area",value=get("locality"))
    google = st.text_input("Google Place ID (optional)",value=get("gmaps_place_id"))
    return name,locality,google

def itinerary(con,tid,trip,row=None):
    get = lambda key,default: row[key] if row is not None and ui.text(row[key]) else default
    item_id = int(row.item_id) if row is not None else None
    with st.form(f"itinerary_{tid}_{item_id}"):
        title = st.text_input("Activity",value=get("title",""))
        a,b = st.columns(2)
        day = a.number_input("Day",min_value=1,max_value=int(trip.n_days),value=int(get("day_no",1)))
        time = b.time_input("Start time",value=dt.time.fromisoformat(get("start_time","09:00")))
        kind = st.selectbox("Activity type",services.KINDS,index=services.KINDS.index(get("kind","sight")))
        place,locality,google = place_fields(row)
        currency = st.selectbox("Planned currency",fx.SPEND_CURRENCIES,index=fx.SPEND_CURRENCIES.index(get("planned_ccy",trip.local_currency)))
        cost = st.number_input("Planned cost",min_value=0.0,value=float(get("planned_cost",0)))
        notes = st.text_area("Notes",value=get("notes",""))
        if st.form_submit_button("Save activity",type="primary"):
            try:
                services.save_itinerary(con,tid,day,time,kind,title,place,locality,google,cost,currency,notes,item_id)
                ui.saved("Activity saved.")
            except ValueError as exc:
                st.error(str(exc))

def booking(con,tid,trip,row=None):
    get = lambda key,default: row[key] if row is not None and ui.text(row[key]) else default
    bid = int(row.booking_id) if row is not None else None
    with st.form(f"booking_{tid}_{bid}"):
        kinds = ["flight","hotel","reservation"]
        kind = st.selectbox("Booking type",kinds,index=kinds.index(get("kind","flight")))
        title = st.text_input("Booking title",value=get("title",""))
        provider = st.text_input("Provider",value=get("provider",""))
        ref = st.text_input("Flight / reservation number",value=get("ref_code",""))
        confirmation = st.text_input("Confirmation code",value=get("confirmation",""))
        origin = st.text_input("Origin",value=get("origin",""))
        destination = st.text_input("Destination",value=get("destination",""))
        start = get("starts_at",dt.datetime.combine(trip.start_date,dt.time(12)))
        end = get("ends_at",dt.datetime.combine(trip.start_date,dt.time(14)))
        a,b = st.columns(2)
        sd = a.date_input("Start date",value=start.date())
        stime = b.time_input("Start time",value=start.time())
        sz = st.text_input("Start time zone",value=get("start_zone","Asia/Taipei"))
        a,b = st.columns(2)
        ed = a.date_input("End date",value=end.date())
        etime = b.time_input("End time",value=end.time())
        ez = st.text_input("End time zone",value=get("end_zone","Asia/Taipei"))
        st.caption("Use local times and IANA zones, e.g. Asia/Tokyo or America/Los_Angeles.")
        place,locality,google = place_fields(row)
        known = st.checkbox("Price known",value=row is not None and bool(ui.text(row.price)))
        price = st.number_input("Price",min_value=0.0,value=float(get("price",0)))
        currency = st.selectbox("Price currency",fx.SPEND_CURRENCIES,index=fx.SPEND_CURRENCIES.index(get("price_ccy",trip.local_currency)))
        notes = st.text_area("Notes",value=get("notes",""))
        if st.form_submit_button("Save booking",type="primary"):
            try:
                services.save_booking(con,tid,kind,title,provider,ref,confirmation,origin,destination,dt.datetime.combine(sd,stime),
                    dt.datetime.combine(ed,etime),sz,ez,place,locality,google,price if known else None,currency,notes,bid)
                ui.saved("Booking saved. Record any payment separately in Record.")
            except ValueError as exc:
                st.error(str(exc))

def shopping(con,tid,trip,row=None):
    get = lambda key,default: row[key] if row is not None and ui.text(row[key]) else default
    item_id = int(row.item_id) if row is not None else None
    with st.form(f"shopping_{tid}_{item_id}"):
        title = st.text_input("Item",value=get("title",""))
        where = st.text_input("Where",value=get("where_hint",""))
        currency = st.selectbox("Planned currency",fx.SPEND_CURRENCIES,index=fx.SPEND_CURRENCIES.index(get("planned_ccy",trip.local_currency)))
        price = st.number_input("Planned price",min_value=0.0,value=float(get("planned_price",0)))
        if st.form_submit_button("Save shopping item",type="primary"):
            try:
                services.save_shopping(con,tid,title,where,price,currency,item_id)
                ui.saved("Shopping item saved.")
            except ValueError as exc:
                st.error(str(exc))
