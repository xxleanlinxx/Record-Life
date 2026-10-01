import streamlit as st
from core import db, forms, ui

st.page_link("screens/home.py", label="Back to Home", icon=":material/arrow_back:")
if not st.session_state.get("trip_id"):
    ui.header("Trips", "Create your first trip", "No trips yet. Add a trip before editing its details.")
    forms.create_trip(db.connect())
else:
    con, tid, home, trip = ui.context()
    ui.header("Trip settings", "Edit trip", trip["name"])
    forms.edit_trip(con, tid, home, trip)
