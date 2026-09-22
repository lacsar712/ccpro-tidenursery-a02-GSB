import { FormEvent, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Hatchery, Pond, RotiferHarvest, RotiferTank, User } from '../types'

function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const emptyTank = {
  hatcheryId: 0,
  tankCode: '',
  inoculationDensity: 100,
}

const emptyHarvest = {
  tankId: 0,
  amountKg: 1,
  harvestedAt: nowLocal(),
  pondId: 0, // 0 表示不选去向塘口
}

const statusLabel: Record<RotiferTank['status'], string> = {
  culturing: '培养中',
  cleared: '已清缸',
}

export default function RotiferTanks() {
  const [hatcheries, setHatcheries] = useState<Hatchery[]>([])
  const [ponds, setPonds] = useState<Pond[]>([])
  const [tanks, setTanks] = useState<RotiferTank[]>([])
  const [harvests, setHarvests] = useState<RotiferHarvest[]>([])
  const [me, setMe] = useState<User | null>(null)
  const [tankForm, setTankForm] = useState(emptyTank)
  const [harvestForm, setHarvestForm] = useState(emptyHarvest)
  const [error, setError] = useState('')

  async function load() {
    const [hs, ps, ts, vs, user] = await Promise.all([
      api<Hatchery[]>('/api/hatcheries'),
      api<Pond[]>('/api/ponds'),
      api<RotiferTank[]>('/api/rotifer-tanks'),
      api<RotiferHarvest[]>('/api/rotifer-tanks/harvests'),
      api<User>('/api/auth/me'),
    ])
    setHatcheries(hs)
    setPonds(ps)
    setTanks(ts)
    setHarvests(vs)
    setMe(user)
    setTankForm((f) => (f.hatcheryId ? f : { ...f, hatcheryId: hs[0]?.id ?? 0 }))
    setHarvestForm((f) => {
      if (f.tankId) return f
      const first = ts.find((t) => t.status === 'culturing')
      return first ? { ...f, tankId: first.id } : f
    })
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [])

  async function onCreateTank(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/rotifer-tanks', {
        method: 'POST',
        body: JSON.stringify(tankForm),
      })
      setTankForm((f) => ({ ...emptyTank, hatcheryId: f.hatcheryId }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function onCreateHarvest(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/rotifer-tanks/harvests', {
        method: 'POST',
        body: JSON.stringify({
          tankId: harvestForm.tankId,
          amountKg: harvestForm.amountKg,
          harvestedAt: new Date(harvestForm.harvestedAt).toISOString(),
          pondId: harvestForm.pondId || null,
        }),
      })
      setHarvestForm((f) => ({ ...emptyHarvest, tankId: f.tankId, harvestedAt: nowLocal() }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '收获登记失败')
    }
  }

  async function clearTank(id: number) {
    if (!confirm('确认清缸？清缸后禁止再收获。')) return
    setError('')
    try {
      await api(`/api/rotifer-tanks/${id}/clear`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '清缸失败')
    }
  }

  const hatcheryName = (id: number) =>
    hatcheries.find((h) => h.id === id)?.name || `#${id}`
  const tankLabel = (id: number) => {
    const t = tanks.find((x) => x.id === id)
    return t ? `${t.tankCode} (${hatcheryName(t.hatcheryId)})` : `#${id}`
  }
  const pondLabel = (id?: number | null) => {
    if (!id) return '—'
    const p = ponds.find((x) => x.id === id)
    return p ? `${p.pondCode} (${p.species})` : `#${id}`
  }

  const culturingTanks = tanks.filter((t) => t.status === 'culturing')
  const selectedTank = tanks.find((t) => t.id === harvestForm.tankId)
  const destPonds = selectedTank
    ? ponds.filter((p) => p.hatcheryId === selectedTank.hatcheryId)
    : []

  return (
    <div>
      <header className="page-header">
        <h1>轮虫扩培</h1>
        <p className="muted">
          同场缸号唯一；仅培养中可收获；单次收获超过 5 kg 必须选择去向塘口，并同步写入「轮虫鲜料」投喂事件
        </p>
      </header>
      {error && <div className="error">{error}</div>}

      <form className="panel form-grid" onSubmit={onCreateTank}>
        <label>
          所属育苗场
          <select
            value={tankForm.hatcheryId}
            onChange={(e) => setTankForm({ ...tankForm, hatcheryId: Number(e.target.value) })}
            required
          >
            {hatcheries.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          缸号
          <input
            value={tankForm.tankCode}
            onChange={(e) => setTankForm({ ...tankForm, tankCode: e.target.value })}
            required
          />
        </label>
        <label>
          接种密度 (个/mL)
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={tankForm.inoculationDensity}
            onChange={(e) =>
              setTankForm({ ...tankForm, inoculationDensity: Number(e.target.value) })
            }
            required
          />
        </label>
        <button type="submit" className="btn primary">
          新建扩培缸
        </button>
      </form>

      <form className="panel form-grid" onSubmit={onCreateHarvest}>
        <label>
          扩培缸（培养中）
          <select
            value={harvestForm.tankId}
            onChange={(e) =>
              setHarvestForm({ ...harvestForm, tankId: Number(e.target.value), pondId: 0 })
            }
            required
          >
            {culturingTanks.length === 0 && <option value={0}>暂无培养中的缸</option>}
            {culturingTanks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tankCode} · {hatcheryName(t.hatcheryId)}
              </option>
            ))}
          </select>
        </label>
        <label>
          收获 kg
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={harvestForm.amountKg}
            onChange={(e) =>
              setHarvestForm({ ...harvestForm, amountKg: Number(e.target.value) })
            }
            required
          />
        </label>
        <label>
          收获时刻
          <input
            type="datetime-local"
            value={harvestForm.harvestedAt}
            onChange={(e) => setHarvestForm({ ...harvestForm, harvestedAt: e.target.value })}
            required
          />
        </label>
        <label>
          去向塘口（可空；超过 5 kg 必选）
          <select
            value={harvestForm.pondId}
            onChange={(e) =>
              setHarvestForm({ ...harvestForm, pondId: Number(e.target.value) })
            }
          >
            <option value={0}>不投塘</option>
            {destPonds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pondCode} · {p.species}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={!harvestForm.tankId}>
          登记收获
        </button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>育苗场</th>
              <th>缸号</th>
              <th>接种密度</th>
              <th>状态</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tanks.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{hatcheryName(t.hatcheryId)}</td>
                <td>{t.tankCode}</td>
                <td>{t.inoculationDensity}</td>
                <td>
                  <span className={`badge ${t.status}`}>{statusLabel[t.status]}</span>
                </td>
                <td>
                  {me?.role === 'admin' && t.status === 'culturing' && (
                    <button className="btn ghost" onClick={() => clearTank(t.id)}>
                      清缸
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">收获记录</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>扩培缸</th>
              <th>收获 kg</th>
              <th>收获时刻</th>
              <th>去向塘口</th>
              <th>联动投喂</th>
            </tr>
          </thead>
          <tbody>
            {harvests.map((v) => (
              <tr key={v.id}>
                <td>{v.id}</td>
                <td>{tankLabel(v.tankId)}</td>
                <td>{v.amountKg}</td>
                <td>{new Date(v.harvestedAt).toLocaleString()}</td>
                <td>{pondLabel(v.pondId)}</td>
                <td>{v.amountKg > 5 ? '轮虫鲜料已投喂' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
