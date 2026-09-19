"""Public request contracts, independent of Streamlit widgets."""
import datetime as dt
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Currency = Literal['TWD','USD','EUR','GBP','JPY','KRW']
HomeCurrency = Literal['TWD','USD','EUR','GBP']
Category = Literal['Transport','Stay','Food','Sights','Shopping','Other']

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class TripCreate(Input):
    name: str = Field(min_length=1,max_length=120)
    start: dt.date
    end: dt.date
    home: HomeCurrency = 'TWD'
    local: Currency = 'JPY'
    budget: float = Field(ge=0,le=1e12,allow_inf_nan=False)
    members: list[str] = Field(min_length=1,max_length=50)

class TripEdit(Input):
    name: str = Field(min_length=1,max_length=120)
    start: dt.date
    end: dt.date
    local: Currency
    budget: float = Field(ge=0,le=1e12,allow_inf_nan=False)
    category_budgets: dict[Category,float]

class CurrencyChange(Input):
    home: HomeCurrency

class Member(Input):
    name: str = Field(min_length=1,max_length=80)

class Expense(Input):
    title: str = Field(min_length=1,max_length=240)
    category: Category
    amount: float = Field(gt=0,le=1e12,allow_inf_nan=False)
    currency: Currency
    when: dt.date
    payer: str
    split: list[str] = Field(min_length=1,max_length=50)
    submission_id: str = Field(min_length=8,max_length=100)
    shopping_id: int | None = None
    replaces: int | None = None
    split_mode: Literal["preserve", "equal"] = "preserve"

class Activity(Input):
    day: int = Field(ge=1,le=366)
    time: dt.time
    kind: Literal['flight','transport','hotel','sight','food','shop']
    title: str = Field(min_length=1,max_length=240)
    place: str = Field(default='',max_length=240)
    locality: str = Field(default='',max_length=240)
    google_id: str = Field(default='',max_length=240)
    cost: float = Field(default=0,ge=0,le=1e12,allow_inf_nan=False)
    currency: Currency
    notes: str = Field(default='',max_length=4000)

class Booking(Input):
    kind: Literal['flight','hotel','reservation']
    title: str = Field(min_length=1,max_length=240)
    provider: str = Field(default='',max_length=240)
    ref: str = Field(default='',max_length=240)
    confirmation: str = Field(default='',max_length=240)
    origin: str = Field(default='',max_length=240)
    destination: str = Field(default='',max_length=240)
    start: dt.datetime
    end: dt.datetime
    start_zone: str = 'Asia/Taipei'
    end_zone: str = 'Asia/Taipei'
    place: str = Field(default='',max_length=240)
    locality: str = Field(default='',max_length=240)
    google_id: str = Field(default='',max_length=240)
    price: float | None = Field(default=None,ge=0,le=1e12,allow_inf_nan=False)
    currency: Currency
    notes: str = Field(default='',max_length=4000)

class Shopping(Input):
    title: str = Field(min_length=1,max_length=240)
    where: str = Field(default='',max_length=240)
    price: float = Field(ge=0,le=1e12,allow_inf_nan=False)
    currency: Currency

class Bought(Input):
    bought: bool
