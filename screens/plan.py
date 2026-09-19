import streamlit as st
from core import db,fx,ui,maps,forms,services

con,tid,H,trip = ui.context()
ui.header("Plan","Itinerary & shopping")
mode = st.radio("View",["Itinerary","Shopping"],horizontal=True)
if mode=="Itinerary":
    selected_day = st.session_state.pop("requested_day", st.session_state.get(f"last_plan_day_{tid}", 1))
    day = st.selectbox("Day",range(1,int(trip.n_days)+1),index=min(int(trip.n_days), max(1, selected_day))-1,format_func=lambda d:f"Day {d}")
    st.session_state[f"last_plan_day_{tid}"] = day
    items = db.q(con,"""select i.*,p.name place,p.locality,p.gmaps_place_id from dwd_itinerary_item i
        left join dim_place p using(place_id) where i.trip_id=? and i.day_no=? order by start_time,item_id""",[tid,day])
    totals = items.groupby("planned_ccy").planned_cost.sum()
    st.caption(f"{len(items)} stops · " + " / ".join(fx.fmt(a,c) for c,a in totals.items()))
    import datetime as dt
    date = trip.start_date + dt.timedelta(days=day-1)
    ui.day_header(day, f"{date:%b %d · %A}", " · ".join(items.title.head(3)) if not items.empty else "Make room for your favourite places.")
    layout = st.radio("Presentation", ["Timeline", "Cards"], horizontal=True, key=f"plan_layout_{tid}")
    prev = None
    for _,r in items.iterrows():
        place = ui.text(r.place)
        locality = ui.text(r.locality)
        if layout == "Timeline" and prev and place:
            st.link_button("Directions to next stop ↗",maps.directions_url(prev,f"{place} {locality}"))
        link = maps.link(place,locality,ui.text(r.gmaps_place_id)) if place else ""
        content = (f'<div class="tr-kicker">{r.start_time} · {r.kind}</div><b>{ui.escape(r.title)}</b>'
                   f'<div>{link} · {fx.fmt(r.planned_cost,r.planned_ccy)}</div><div class="tr-mute">{ui.escape(ui.text(r.notes))}</div>')
        if layout == "Timeline":
            st.markdown(f'<div class="tr-timeline" style="--day-color:{ui.day_color(day)}"><div class="tr-card">{content}</div></div>', unsafe_allow_html=True)
        else:
            ui.card(content, day)
        prev = f"{place} {locality}" if place else prev
    if items.empty:
        st.info("Add an attraction, restaurant, hotel or transport leg.")
    with st.expander("Add activity"):
        forms.itinerary(con,tid,trip)
    if not items.empty:
        with st.expander("Edit / delete activity"):
            selected = st.selectbox("Activity to edit",items.item_id.tolist(),format_func=lambda i:items.set_index("item_id").title[i])
            forms.itinerary(con,tid,trip,items[items.item_id==selected].iloc[0])
            if st.button("Delete activity"):
                services.delete_item(con,tid,"dwd_itinerary_item","item_id",int(selected))
                ui.saved("Activity deleted.")
else:
    shop = db.q(con,"select * from dwd_shopping_item where trip_id=? order by is_bought,item_id",[tid])
    st.caption(f"{int(shop.is_bought.sum())} of {len(shop)} bought")
    for c,amount in shop.groupby("planned_ccy").planned_price.sum().items():
        st.write(f"Planned: {fx.fmt(amount,c)}")
    st.caption("Bought status tracks your list. Link a payment in Record to include it in your budget.")
    for _,r in shop.iterrows():
        linked = bool(ui.text(r.expense_id))
        value = st.checkbox(f"{r.title} · {fx.fmt(r.planned_price,r.planned_ccy)}",value=bool(r.is_bought),key=f"shop_{tid}_{r.item_id}",disabled=linked)
        st.caption(ui.text(r.where_hint) + (" · Expense recorded" if linked else ""))
        if value != bool(r.is_bought):
            services.set_bought(con,tid,int(r.item_id),value)
            st.rerun()
    with st.expander("Add shopping item"):
        forms.shopping(con,tid,trip)
    if not shop.empty:
        with st.expander("Edit / delete shopping item"):
            selected = st.selectbox("Shopping item to edit",shop.item_id.tolist(),format_func=lambda i:shop.set_index("item_id").title[i])
            forms.shopping(con,tid,trip,shop[shop.item_id==selected].iloc[0])
            st.caption("Deleting a list item keeps its recorded payment in Budget.")
            if st.button("Delete shopping item"):
                services.delete_item(con,tid,"dwd_shopping_item","item_id",int(selected))
                ui.saved("Shopping item deleted.")
