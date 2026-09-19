import streamlit as st
from core import db,fx,ui,maps,forms,services

con,tid,H,trip = ui.context()
ui.header("Bookings","Flights · hotels · tables")
bookings = db.q(con,"""select b.*,p.name place,p.locality,p.gmaps_place_id from dwd_booking b
    left join dim_place p using(place_id) where b.trip_id=? order by starts_at,booking_id""",[tid])
if bookings.empty:
    st.info("Add your flights, accommodation and restaurant reservations.")
for kind,label in [("flight","Flights"),("hotel","Hotels"),("reservation","Restaurant reservations")]:
    part = bookings[bookings.kind==kind]
    if part.empty:
        continue
    st.subheader(label)
    for _,r in part.iterrows():
        price = fx.fmt(r.price,r.price_ccy) if ui.text(r.price) else "Price not entered"
        if ui.text(r.price) and r.price_ccy != H:
            try:
                with db.LOCK:
                    price += f" ≈ {fx.fmt(fx.convert(con,r.price,r.price_ccy,H),H)}"
            except fx.RateUnavailable:
                pass
        link = maps.link(ui.text(r.place),ui.text(r.locality),ui.text(r.gmaps_place_id)) if ui.text(r.place) else ""
        start = f"{r.starts_at:%b %d %H:%M} {ui.text(r.start_zone)}" if ui.text(r.starts_at) else "Time not entered"
        end = f"{r.ends_at:%b %d %H:%M} {ui.text(r.end_zone)}" if ui.text(r.ends_at) else "Time not entered"
        ui.card(f'<b>{ui.escape(r.title)}</b><div class="tr-mute">{ui.escape(start)} → {ui.escape(end)}</div>'
            f'<div>{ui.escape(ui.text(r.provider))} {ui.escape(ui.text(r.ref_code))}</div>'
            f'<div class="tr-mute">Conf. {ui.escape(ui.text(r.confirmation,"—"))} · {price}</div>'
            f'<div class="tr-mute">{ui.escape(ui.text(r.notes))} {link}</div>')
st.caption("Booking prices are planned amounts. Record paid amounts in Record to count them toward your budget.")
with st.expander("Add booking"):
    forms.booking(con,tid,trip)
if not bookings.empty:
    with st.expander("Edit / delete booking"):
        selected = st.selectbox("Booking to edit",bookings.booking_id.tolist(),format_func=lambda i:bookings.set_index("booking_id").title[i])
        forms.booking(con,tid,trip,bookings[bookings.booking_id==selected].iloc[0])
        if st.button("Delete booking"):
            services.delete_item(con,tid,"dwd_booking","booking_id",int(selected))
            ui.saved("Booking deleted.")
