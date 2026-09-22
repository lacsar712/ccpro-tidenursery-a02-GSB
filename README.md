# TideNursery-01 · 潮汐育苗台账

海水育苗场「塘口水质采样与投喂事件」台账种子项目（非库存 / 电商 / 医院）。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.11 · FastAPI · SQLAlchemy 2 · Pydantic v2 · python-jose · passlib(bcrypt) · uvicorn |
| 前端 | React 18 · Vite · TypeScript · React Router v6 |
| 数据库 | PostgreSQL 15 |
| 部署 | docker-compose · 前端 Nginx 反代 `/api` |

## 端口与账号

| 服务 | 端口 |
| --- | --- |
| 前端 | **3400** |
| 后端 API | **8400** |
| PostgreSQL | **5434** |

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `123456` | 场长 |
| `technician` | `123456` | 水质技术员 |

## 一键启动

```bash
cd TideNursery-01
docker compose up --build
```

启动后访问：

- 前端：http://localhost:3400
- 后端健康检查：http://localhost:8400/api/health
- API 文档：http://localhost:8400/docs

后端 entrypoint 流程：等待数据库就绪 → `create_all` 建表 → seed 初始数据 → 启动 uvicorn。

## 功能模块

1. **Auth**：JWT 登录（OAuth2 Password），`/api/auth/login`、`/api/auth/me`
2. **Hatchery 育苗场**：`name`、`seawaterSource`、`notes`
3. **Pond 育苗塘**：`hatcheryId`、`pondCode`、`species`、`volumeM3`、`status(stocked|dry|quarantine)`；同场 `pondCode` 唯一
4. **WaterSample 水质样**：`pondId`、`sampledAt`、`tempC`、`salinityPpt`、`doMgL`、`ph`、`notes`；`doMgL > 0` 且 `ph ∈ [6,9]`，否则返回 **400**
5. **FeedEvent 投喂**：`pondId`、`fedAt`、`feedType`、`amountKg`、`operatorName`
6. **RotiferTank 轮虫扩培缸**：`hatcheryId`、`tankCode`、`inoculumDensity`、`status(culturing|cleaned)`；扩培缸挂场，同场 `tankCode` 唯一
7. **RotiferHarvest 收获行**：`tankId`、`amountKg`、`harvestedAt`、`destinationPondId`（可空）；去向塘口若填必须与扩培缸同场，否则 **400**
8. **Dashboard**：塘总数、quarantine 数、近 24h 采样数、近 7 日投喂总量 kg、培养中扩培缸数（与扩培缸列表 `culturing` 行数一致）

### 轮虫扩培业务规则

- **建缸 / 收获**：登录技术员与场长均可操作；新缸默认 `culturing 培养中`。
- **清缸**：仅场长（`admin`）可执行，技术员调用返回 **403**；清缸后状态为 `cleaned 已清缸`，禁止再登记收获（**400**）。
- **大额收获联动投喂**：单次收获量 **超过 5 kg** 时，必须指定与扩培缸**同一场**的去向塘口（空塘口直接 **400**），并与收获行在**同一数据库事务**内写入一条投喂事件：
  - 饵料类型固定 `轮虫鲜料`
  - 投喂重量 = 收获千克，投喂时刻 = 收获时刻
  - 操作人 = 当前登录用户的显示名
- 单次收获 ≤ 5 kg 时去向塘口可空，不产生投喂。
- 收获与投喂同事务提交：投喂写入失败则收获一并回滚，**不会出现收获成功却漏写投喂**。

## 前端页面

Login · Dashboard · Hatcheries · Ponds · WaterSamples · FeedEvents · RotiferTanks（侧栏「轮虫扩培」）

### 种子数据

种子含 1 个培养中扩培缸「RT-01」（盐田青湾育苗场，接种密度 120 个/mL），并已准备一次 **6 kg** 的大额收获，去向为同场塘口 B-01，同时写入一条对应的「轮虫鲜料」投喂事件，启动后即可在轮虫扩培页与投喂事件页查看联动结果。

## 本地开发（可选）

```bash
# 数据库（或用 compose 只起 db）
docker compose up -d db

# 后端
cd backend
pip install -r requirements.txt
set DATABASE_URL=postgresql+psycopg2://tidenursery:tidenursery@localhost:5434/tidenursery
python -c "from app.database import Base, engine; from app import models; Base.metadata.create_all(bind=engine)"
python -c "from app.seed import seed; seed()"
uvicorn app.main:app --reload --port 8400

# 前端
cd frontend
npm install
npm run dev
```

## 目录结构

```
TideNursery-01/
├── docker-compose.yml
├── README.md
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── auth.py
│       ├── seed.py
│       ├── models/
│       ├── schemas/
│       └── routers/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── pages/
        ├── components/
        └── api/
```
