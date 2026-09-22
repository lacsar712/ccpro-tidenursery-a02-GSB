from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Float, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RotiferHarvest(Base):
    __tablename__ = "rotifer_harvests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tank_id: Mapped[int] = mapped_column(
        ForeignKey("rotifer_tanks.id"), nullable=False, index=True
    )
    amount_kg: Mapped[float] = mapped_column(Float, nullable=False)
    harvested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    destination_pond_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("ponds.id"), nullable=True, index=True
    )

    tank: Mapped["RotiferTank"] = relationship("RotiferTank", back_populates="harvests")
    destination_pond: Mapped[Optional["Pond"]] = relationship("Pond")
