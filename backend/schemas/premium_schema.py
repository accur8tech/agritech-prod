from pydantic import BaseModel
from typing import List
from datetime import date

class Phase(BaseModel):
    phaseName: str
    length: int
    sosStart: int
    sosEnd: int

class Index(BaseModel):
    type: str
    trigger: float
    exit: float
    dailyCap: float
    unitPayout: float
    maxPayout: float
    consecutiveDays: int
    phases: List[str]

class PremiumRequest(BaseModel):
    productName: str
    commune: str
    cropType: str
    growingDuration: int
    weatherDataPeriod: int
    plantingDate: date
    phases: List[Phase]
    indexes: List[Index]
    coverageType: str 