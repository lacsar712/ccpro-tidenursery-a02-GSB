from datetime import datetime
from typing import List, Optional

from sqlalchemy import String, Integer, Float, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RotiferTank(Base):
    __tablename__ = "rotifer_tanks"
    __table_args__ = (
        UniqueConstraint("hatchery_id", "tank_code", name="uq_hatchery_tank_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    hatchery_id: Mapped[int] = mapped_column(
        ForeignKey("hatcheries.id"), nullable=False, index=True
    )
    tank_code: Mapped[str] = mapped_column(String(64), nullable=False)
    inoculation_density: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="culturing")

    hatchery: Mapped["Hatchery"] = relationship("Hatchery", back_populates="rotifer_tanks")
    harvests: Mapped[List["RotiferHarvest"]] = relationship(
        "RotiferHarvest", back_populates="tank", cascade="all, delete-orphan"
    )


class RotiferHarvest(Base):
    __tablename__ = "rotifer_harvests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tank_id: Mapped[int] = mapped_column(
        ForeignKey("rotifer_tanks.id"), nullable=False, index=True
    )
    amount_kg: Mapped[float] = mapped_column(Float, nullable=False)
    harvested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pond_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("ponds.id"), nullable=True, index=True
    )

    tank: Mapped["RotiferTank"] = relationship("RotiferTank", back_populates="harvests")
    pond: Mapped[Optional["Pond"]] = relationship("Pond")
