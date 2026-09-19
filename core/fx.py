"""Immutable, complete FX snapshots with truthful provider dates."""
import datetime as dt
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from zoneinfo import ZoneInfo
import requests

BASE = "USD"
HOME_CURRENCIES = ["TWD", "USD", "EUR", "GBP"]
SPEND_CURRENCIES = ["JPY", "TWD", "USD", "EUR", "KRW", "GBP"]
SYMBOL = {"USD": "$", "EUR": "€", "GBP": "£", "TWD": "NT$", "JPY": "¥", "KRW": "₩"}
CURRENCIES = set(HOME_CURRENCIES + SPEND_CURRENCIES)

class RateUnavailable(ValueError):
    pass

def today():
    return dt.datetime.now(ZoneInfo("Asia/Taipei")).date()

def d_minus_1():
    return today() - dt.timedelta(days=1)

def decimal(value):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Enter a valid amount.") from None
    if not result.is_finite():
        raise ValueError("Enter a finite amount.")
    return result

@dataclass(frozen=True)
class Snapshot:
    date: dt.date
    rates: dict
    source: str

@dataclass(frozen=True)
class RateStatus:
    date: dt.date | None
    source: str | None
    error: str | None = None

def validate_snapshot(date, rates, source, target):
    if date > target or set(rates) != CURRENCIES:
        raise RateUnavailable("Provider did not return a complete snapshot at or before D-1.")
    parsed = {q: decimal(v) for q, v in rates.items()}
    if any(v <= 0 for v in parsed.values()) or parsed[BASE] != 1:
        raise RateUnavailable("Provider returned invalid rates.")
    return Snapshot(date, parsed, source)

def fetch_rates(target=None):
    target = target or d_minus_1()
    errors = []
    try:
        response = requests.get("https://api.frankfurter.dev/v2/rates", params={
            "base": BASE, "quotes": ",".join(sorted(CURRENCIES - {BASE})), "date": target.isoformat()
        }, timeout=8)
        response.raise_for_status()
        rows = response.json()
        dates = {dt.date.fromisoformat(r["date"]) for r in rows}
        if len(dates) != 1 or any(r["base"] != BASE for r in rows):
            raise RateUnavailable("Rates have inconsistent dates or bases.")
        rates = {r["quote"]: r["rate"] for r in rows}
        rates[BASE] = 1
        return validate_snapshot(dates.pop(), rates, "frankfurter.dev/v2", target)
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        errors.append(type(exc).__name__)
    try:
        response = requests.get(f"https://open.er-api.com/v6/latest/{BASE}", timeout=8)
        response.raise_for_status()
        data = response.json()
        if data.get("result") != "success":
            raise RateUnavailable("Provider reported failure.")
        date = dt.datetime.fromtimestamp(data["time_last_update_unix"], dt.timezone.utc).date()
        return validate_snapshot(date, {q: data["rates"][q] for q in CURRENCIES}, "open.er-api.com", target)
    except (requests.RequestException, ValueError, KeyError, TypeError, OverflowError) as exc:
        errors.append(type(exc).__name__)
    raise RateUnavailable("FX sync unavailable; keeping the last complete snapshot. " + "/".join(errors))

def latest_rate_date(con, on=None):
    row = con.execute("""select max(rate_date) from (
        select rate_date from dim_fx_rate where base_ccy=? and rate_date<=?
        and source<>'seed' and quote_ccy in ('USD','EUR','GBP','JPY','TWD','KRW')
        and rate>0 group by rate_date having count(distinct quote_ccy)=6)""",
        [BASE, on or d_minus_1()]).fetchone()
    return row[0]

def rate_status(con, error=None):
    date = latest_rate_date(con)
    source = con.execute("select min(source) from dim_fx_rate where rate_date=?", [date]).fetchone()[0] if date else None
    return RateStatus(date, source, error)

def ensure_rates(con, force=False):
    from core import db
    with db.LOCK:
        have = latest_rate_date(con)
    if not force and have == d_minus_1():
        with db.LOCK:
            return rate_status(con)
    try:
        snapshot = fetch_rates()
        with db.transaction(con):
            con.executemany("""insert or ignore into dim_fx_rate
                (rate_date,base_ccy,quote_ccy,rate,source) values (?,?,?,?,?)""",
                [(snapshot.date, BASE, q, float(v), snapshot.source) for q, v in snapshot.rates.items()])
        with db.LOCK:
            return rate_status(con)
    except RateUnavailable as exc:
        with db.LOCK:
            return rate_status(con, str(exc))

def factor(con, from_ccy, to_ccy, on=None):
    if from_ccy == to_ccy:
        return Decimal(1), None
    date = latest_rate_date(con, on)
    if date is None:
        raise RateUnavailable("No complete FX snapshot available. Refresh rates before saving foreign-currency expenses.")
    rates = dict(con.execute("select quote_ccy,rate from dim_fx_rate where base_ccy=? and rate_date=?", [BASE, date]).fetchall())
    if from_ccy not in rates or to_ccy not in rates:
        raise RateUnavailable("The selected currency is unavailable in this snapshot.")
    return decimal(rates[to_ccy]) / decimal(rates[from_ccy]), date

def convert(con, amount, from_ccy, to_ccy, on=None):
    return decimal(amount) * factor(con, from_ccy, to_ccy, on)[0]

def fmt(amount, ccy):
    try:
        value = decimal(amount)
    except ValueError:
        return "—"
    places = 0 if ccy in ("JPY", "KRW") else 2
    rounded = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return f"{SYMBOL.get(ccy, ccy + ' ')}{rounded:,.{places}f}"
