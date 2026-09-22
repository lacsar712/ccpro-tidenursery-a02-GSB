from typing import List

from sqlalchemy import String, Integer, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

TANK_STATUS_CULTURING = "culturing"
TANK_STATUS_CLEANED = "cleaned"


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
    inoculum_density: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=TANK_STATUS_CULTURING
    )

    hatchery: Mapped["Hatchery"] = relationship("Hatchery", back_populates="rotifer_tanks")
    harvests: Mapped[List["RotiferHarvest"]] = relationship(
        "RotiferHarvest", back_populates="tank", cascade="all, delete-orphan"
    )
