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
  inoculumDensity: 100,
}

export default function RotiferTanks() {
  const [me, setMe] = useState<User | null>(null)
  const [hatcheries, setHatcheries] = useState<Hatchery[]>([])
  const [ponds, setPonds] = useState<Pond[]>([])
  const [tanks, setTanks] = useState<RotiferTank[]>([])
  const [harvests, setHarvests] = useState<Record<number, RotiferHarvest[]>>({})
  const [tankForm, setTankForm] = useState(emptyTank)
  const [harvestForm, setHarvestForm] = useState<
    Record<number, { amountKg: number; harvestedAt: string; destinationPondId: string }>
  >({})
  const [error, setError] = useState('')

  async function load() {
    const [u, hs, ps, ts] = await Promise.all([
      api<User>('/api/auth/me'),
      api<Hatchery[]>('/api/hatcheries'),
      api<Pond[]>('/api/ponds'),
      api<RotiferTank[]>('/api/rotifer-tanks'),
    ])
    setMe(u)
    setHatcheries(hs)
    setPonds(ps)
    setTanks(ts)
    if (!tankForm.hatcheryId && hs[0]) {
      setTankForm((f) => ({ ...f, hatcheryId: hs[0].id }))
    }
    const allHarvests = await Promise.all(
      ts.map((t) =>
        api<RotiferHarvest[]>(`/api/rotifer-tanks/${t.id}/harvests`).then((rows) => [
          t.id,
          rows,
        ]),
      ),
    )
    setHarvests(Object.fromEntries(allHarvests as [number, RotiferHarvest[]][]))
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [])

  function formFor(tankId: number) {
    return (
      harvestForm[tankId] ?? {
        amountKg: 6,
        harvestedAt: nowLocal(),
        destinationPondId: '',
      }
    )
  }

  function setFormFor(
    tankId: number,
    patch: Partial<{ amountKg: number; harvestedAt: string; destinationPondId: string }>,
  ) {
    setHarvestForm((m) => ({ ...m, [tankId]: { ...formFor(tankId), ...patch } }))
  }

  async function createTank(e: FormEvent) {
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
      setError(err instanceof Error ? err.message : '建缸失败')
    }
  }

  async function registerHarvest(tank: RotiferTank) {
    const f = formFor(tank.id)
    setError('')
    try {
      await api(`/api/rotifer-tanks/${tank.id}/harvest`, {
        method: 'POST',
        body: JSON.stringify({
          amountKg: f.amountKg,
          harvestedAt: new Date(f.harvestedAt).toISOString(),
          destinationPondId: f.destinationPondId ? Number(f.destinationPondId) : null,
        }),
      })
      setFormFor(tank.id, { harvestedAt: nowLocal() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '收获登记失败')
    }
  }

  async function cleanTank(tank: RotiferTank) {
    if (!confirm(`确认清缸 ${tank.tankCode}？清缸后不可再收获。`)) return
    setError('')
    try {
      await api(`/api/rotifer-tanks/${tank.id}/clean`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '清缸失败')
    }
  }

  const hatcheryName = (id: number) =>
    hatcheries.find((h) => h.id === id)?.name || `#${id}`
  const pondLabel = (id?: number | null) => {
    if (id == null) return '—'
    const p = ponds.find((x) => x.id === id)
    return p ? `${p.pondCode} · ${p.species}` : `#${id}`
  }

  return (
    <div>
      <header className="page-header">
        <h1>轮虫扩培</h1>
        <p className="muted">
          扩培缸挂育苗场，同场缸号唯一；单次收获超过 5 kg 须指定同场塘口，并自动登记「轮虫鲜料」投喂
        </p>
      </header>
      {error && <div className="error">{error}</div>}

      <form className="panel form-grid" onSubmit={createTank}>
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
            value={tankForm.inoculumDensity}
            onChange={(e) =>
              setTankForm({ ...tankForm, inoculumDensity: Number(e.target.value) })
            }
            required
          />
        </label>
        <button type="submit" className="btn primary">
          新建扩培缸
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
              <th>登记收获</th>
              <th>收获记录</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tanks.map((t) => {
              const f = formFor(t.id)
              const sameHatcheryPonds = ponds.filter((p) => p.hatcheryId === t.hatcheryId)
              const isCulturing = t.status === 'culturing'
              return (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{hatcheryName(t.hatcheryId)}</td>
                  <td>{t.tankCode}</td>
                  <td>{t.inoculumDensity}</td>
                  <td>
                    <span className={`badge ${t.status}`}>
                      {isCulturing ? '培养中' : '已清缸'}
                    </span>
                  </td>
                  <td>
                    {isCulturing ? (
                      <div className="harvest-form">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          aria-label="收获千克"
                          value={f.amountKg}
                          onChange={(e) =>
                            setFormFor(t.id, { amountKg: Number(e.target.value) })
                          }
                        />
                        <input
                          type="datetime-local"
                          aria-label="收获时刻"
                          value={f.harvestedAt}
                          onChange={(e) =>
                            setFormFor(t.id, { harvestedAt: e.target.value })
                          }
                        />
                        <select
                          aria-label="去向塘口"
                          value={f.destinationPondId}
                          onChange={(e) =>
                            setFormFor(t.id, { destinationPondId: e.target.value })
                          }
                        >
                          <option value="">去向塘口（可空）</option>
                          {sameHatcheryPonds.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.pondCode} · {p.species}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => registerHarvest(t)}
                        >
                          登记收获
                        </button>
                      </div>
                    ) : (
                      <span className="muted">已清缸，禁止收获</span>
                    )}
                  </td>
                  <td>
                    {(harvests[t.id] ?? []).map((hv) => (
                      <div key={hv.id} className="harvest-row">
                        {hv.amountKg} kg · {new Date(hv.harvestedAt).toLocaleString()} ·{' '}
                        {pondLabel(hv.destinationPondId)}
                      </div>
                    ))}
                  </td>
                  <td>
                    {isCulturing && me?.role === 'admin' && (
                      <button className="btn ghost" onClick={() => cleanTank(t)}>
                        清缸
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
