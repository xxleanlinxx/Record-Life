import streamlit as st
from core import db, forms, ui

st.page_link("screens/home.py", label="Back to Home", icon=":material/arrow_back:")
has_trip = bool(st.session_state.get("trip_id"))
ui.header("Trips", "Create new trip" if has_trip else "Create your first trip",
          "Set your dates, budget and travel party." if has_trip else "No trips yet. Start with a name and travel dates.")
forms.create_trip(db.connect())
