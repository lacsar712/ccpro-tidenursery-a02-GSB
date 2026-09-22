from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.feed_event import FeedEvent
from app.models.hatchery import Hatchery
from app.models.pond import Pond
from app.models.rotifer import RotiferHarvest, RotiferTank
from app.models.user import User
from app.schemas.rotifer import (
    RotiferHarvestCreate,
    RotiferHarvestOut,
    RotiferTankCreate,
    RotiferTankOut,
)

router = APIRouter(prefix="/api/rotifer-tanks", tags=["rotifer-tanks"])

# 单次收获超过该重量（kg）必须指定去向塘口，并同事务登记一条轮虫鲜料投喂事件
LARGE_HARVEST_KG = 5.0
HARVEST_FEED_TYPE = "轮虫鲜料"


@router.get("", response_model=List[RotiferTankOut])
def list_tanks(
    hatchery_id: Optional[int] = Query(None, alias="hatcheryId"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(RotiferTank)
    if hatchery_id is not None:
        q = q.filter(RotiferTank.hatchery_id == hatchery_id)
    return q.order_by(RotiferTank.id).all()


@router.post("", response_model=RotiferTankOut, status_code=status.HTTP_201_CREATED)
def create_tank(
    payload: RotiferTankCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    hatchery = db.query(Hatchery).filter(Hatchery.id == payload.hatchery_id).first()
    if not hatchery:
        raise HTTPException(status_code=400, detail="育苗场不存在")
    item = RotiferTank(
        hatchery_id=payload.hatchery_id,
        tank_code=payload.tank_code,
        inoculation_density=payload.inoculation_density,
        status="culturing",
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="同场缸号已存在")
    db.refresh(item)
    return item


@router.get("/harvests", response_model=List[RotiferHarvestOut])
def list_harvests(
    tank_id: Optional[int] = Query(None, alias="tankId"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(RotiferHarvest)
    if tank_id is not None:
        q = q.filter(RotiferHarvest.tank_id == tank_id)
    return q.order_by(RotiferHarvest.harvested_at.desc()).all()


@router.post(
    "/harvests", response_model=RotiferHarvestOut, status_code=status.HTTP_201_CREATED
)
def create_harvest(
    payload: RotiferHarvestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tank = db.query(RotiferTank).filter(RotiferTank.id == payload.tank_id).first()
    if not tank:
        raise HTTPException(status_code=400, detail="扩培缸不存在")
    if tank.status != "culturing":
        raise HTTPException(status_code=400, detail="已清缸禁止再收获")

    pond = None
    if payload.pond_id is not None:
        pond = db.query(Pond).filter(Pond.id == payload.pond_id).first()
        if not pond:
            raise HTTPException(status_code=400, detail="去向塘口不存在")
        if pond.hatchery_id != tank.hatchery_id:
            raise HTTPException(status_code=400, detail="去向塘口必须属于同一育苗场")

    need_feed_event = payload.amount_kg > LARGE_HARVEST_KG
    if need_feed_event and pond is None:
        raise HTTPException(
            status_code=400, detail="单次收获超过 5 kg 必须选择去向塘口"
        )

    harvest = RotiferHarvest(
        tank_id=tank.id,
        amount_kg=payload.amount_kg,
        harvested_at=payload.harvested_at,
        pond_id=pond.id if pond else None,
    )
    db.add(harvest)
    if need_feed_event:
        # 大额收获与投喂事件同一事务提交：要么同时落库，要么一起回滚，
        # 不允许出现“收获成功却漏写投喂”的中间状态。
        db.add(
            FeedEvent(
                pond_id=pond.id,
                fed_at=payload.harvested_at,
                feed_type=HARVEST_FEED_TYPE,
                amount_kg=payload.amount_kg,
                operator_name=current_user.display_name,
            )
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="收获登记失败，未写入任何数据")
    db.refresh(harvest)
    return harvest


@router.post("/{tank_id}/clear", response_model=RotiferTankOut)
def clear_tank(
    tank_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅场长可执行清缸")
    item = db.query(RotiferTank).filter(RotiferTank.id == tank_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="扩培缸不存在")
    if item.status == "cleared":
        raise HTTPException(status_code=400, detail="该缸已清缸")
    item.status = "cleared"
    db.commit()
    db.refresh(item)
    return item
