from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.feed_event import FeedEvent
from app.models.hatchery import Hatchery
from app.models.pond import Pond
from app.models.rotifer_harvest import RotiferHarvest
from app.models.rotifer_tank import RotiferTank, TANK_STATUS_CULTURING, TANK_STATUS_CLEANED
from app.models.user import User
from app.schemas.rotifer_tank import (
    RotiferTankCreate,
    RotiferTankOut,
    RotiferHarvestCreate,
    RotiferHarvestOut,
)

router = APIRouter(prefix="/api/rotifer-tanks", tags=["rotifer-tanks"])

# 单缸累计收获超过该千克数时，必须随收获同事务写一条投喂事件
LARGE_HARVEST_KG = 5.0
ROTIFER_FEED_TYPE = "轮虫鲜料"


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
        inoculum_density=payload.inoculum_density,
        status=TANK_STATUS_CULTURING,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="同场缸号已存在")
    db.refresh(item)
    return item


@router.get("/{tank_id}", response_model=RotiferTankOut)
def get_tank(
    tank_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(RotiferTank).filter(RotiferTank.id == tank_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="扩培缸不存在")
    return item


@router.get("/{tank_id}/harvests", response_model=List[RotiferHarvestOut])
def list_tank_harvests(
    tank_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tank = db.query(RotiferTank).filter(RotiferTank.id == tank_id).first()
    if not tank:
        raise HTTPException(status_code=404, detail="扩培缸不存在")
    return (
        db.query(RotiferHarvest)
        .filter(RotiferHarvest.tank_id == tank_id)
        .order_by(RotiferHarvest.harvested_at.desc(), RotiferHarvest.id.desc())
        .all()
    )


@router.post(
    "/{tank_id}/harvest",
    response_model=RotiferHarvestOut,
    status_code=status.HTTP_201_CREATED,
)
def harvest_tank(
    tank_id: int,
    payload: RotiferHarvestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 锁定缸行，避免清缸与收获并发导致状态判断失效
    tank = (
        db.query(RotiferTank)
        .filter(RotiferTank.id == tank_id)
        .with_for_update()
        .first()
    )
    if not tank:
        raise HTTPException(status_code=404, detail="扩培缸不存在")
    if tank.status != TANK_STATUS_CULTURING:
        raise HTTPException(status_code=400, detail="扩培缸已清缸，禁止再收获")

    destination_pond: Optional[Pond] = None
    if payload.destination_pond_id is not None:
        destination_pond = (
            db.query(Pond).filter(Pond.id == payload.destination_pond_id).first()
        )
        if not destination_pond:
            raise HTTPException(status_code=400, detail="去向塘口不存在")
        if destination_pond.hatchery_id != tank.hatchery_id:
            raise HTTPException(status_code=400, detail="去向塘口必须与扩培缸属于同一育苗场")

    # 单次收获合计超过阈值属于大额收获：必须带同场去向塘口
    need_feed_event = payload.amount_kg > LARGE_HARVEST_KG
    if need_feed_event and destination_pond is None:
        raise HTTPException(
            status_code=400,
            detail=f"单次收获超过 {LARGE_HARVEST_KG:g} kg，必须指定同场去向塘口以登记投喂",
        )

    harvest = RotiferHarvest(
        tank_id=tank_id,
        amount_kg=payload.amount_kg,
        harvested_at=payload.harvested_at,
        destination_pond_id=payload.destination_pond_id,
    )
    db.add(harvest)

    if need_feed_event:
        # 与收获同一事务、同一提交：投喂写不进去则收获一并回滚
        db.add(
            FeedEvent(
                pond_id=destination_pond.id,
                fed_at=payload.harvested_at,
                feed_type=ROTIFER_FEED_TYPE,
                amount_kg=payload.amount_kg,
                operator_name=current_user.display_name,
            )
        )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="收获登记失败")
    db.refresh(harvest)
    return harvest


@router.post("/{tank_id}/clean", response_model=RotiferTankOut)
def clean_tank(
    tank_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅场长可执行清缸")
    tank = db.query(RotiferTank).filter(RotiferTank.id == tank_id).first()
    if not tank:
        raise HTTPException(status_code=404, detail="扩培缸不存在")
    tank.status = TANK_STATUS_CLEANED
    db.commit()
    db.refresh(tank)
    return tank
