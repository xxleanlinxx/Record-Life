"""Google Maps deep links — universal URLs, no API key required."""
from urllib.parse import quote_plus
from html import escape

def search_url(name: str, locality: str | None = None, place_id: str | None = None) -> str:
    q = quote_plus(f"{name} {locality or ''}".strip())
    url = f"https://www.google.com/maps/search/?api=1&query={q}"
    return url + f"&query_place_id={quote_plus(place_id)}" if place_id else url

def directions_url(origin: str, destination: str, mode: str = "transit") -> str:
    return (f"https://www.google.com/maps/dir/?api=1&origin={quote_plus(origin)}"
            f"&destination={quote_plus(destination)}&travelmode={mode}")

def link(name: str, locality: str | None = None, place_id: str | None = None, label: str = "Map") -> str:
    """Inline anchor for st.markdown(..., unsafe_allow_html=True)."""
    return f'<a class="tr-map" href="{escape(search_url(name, locality, place_id), quote=True)}" target="_blank" rel="noopener">{escape(label)} ↗</a>'
