from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

TankStatus = Literal["culturing", "cleared"]


class RotiferTankCreate(BaseModel):
    hatchery_id: int = Field(..., alias="hatcheryId")
    tank_code: str = Field(..., min_length=1, max_length=64, alias="tankCode")
    inoculation_density: float = Field(..., gt=0, alias="inoculationDensity")

    model_config = ConfigDict(populate_by_name=True)


class RotiferTankOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    hatchery_id: int = Field(serialization_alias="hatcheryId")
    tank_code: str = Field(serialization_alias="tankCode")
    inoculation_density: float = Field(serialization_alias="inoculationDensity")
    status: TankStatus


class RotiferHarvestCreate(BaseModel):
    tank_id: int = Field(..., alias="tankId")
    amount_kg: float = Field(..., gt=0, alias="amountKg")
    harvested_at: datetime = Field(..., alias="harvestedAt")
    pond_id: Optional[int] = Field(None, alias="pondId")

    model_config = ConfigDict(populate_by_name=True)


class RotiferHarvestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    tank_id: int = Field(serialization_alias="tankId")
    amount_kg: float = Field(serialization_alias="amountKg")
    harvested_at: datetime = Field(serialization_alias="harvestedAt")
    pond_id: Optional[int] = Field(serialization_alias="pondId")
