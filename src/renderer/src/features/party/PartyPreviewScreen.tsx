import { listMonsters, type GameData, type GameState } from '@core'
import { MonsterCard } from '../../shared/components/MonsterCard'
import { nameOf } from '../../shared/lib/contentText'
import { formatNumber } from '../../shared/lib/format'
import { statBarScale } from '../../shared/lib/statBar'

export interface SaveStatus {
  /** Lần tự lưu / lưu tay gần nhất thành công. */
  lastSavedAt: Date | null
  /** Thông báo kết quả thao tác save gần nhất (thành công hoặc lỗi). */
  message: string | null
  isError: boolean
}

interface Props {
  data: GameData
  state: GameState
  saveStatus: SaveStatus
  onManualSave: () => void
  onExport: () => void
  onExit: () => void
}

/** Màn tạm sau khi vào game: xem đội, tiền, túi đồ, lưu / xuất save. Sẽ thay bằng màn thị trấn. */
export function PartyPreviewScreen({
  data,
  state,
  saveStatus,
  onManualSave,
  onExport,
  onExit
}: Props): React.JSX.Element {
  const views = listMonsters(data, state, { location: 'party' })
  const statScale = statBarScale(views)
  const inBattle = state.battle !== null

  return (
    <main className="screen">
      <h1 className="screen-title">Đội của bạn</h1>
      <p className="muted">Thị trấn — đang xây dựng.</p>

      <div className="card-grid">
        {views.map((view) => (
          <MonsterCard key={view.id} data={data} view={view} statScale={statScale} />
        ))}
      </div>

      <section className="panel">
        <div className="form-row">
          <span className="form-label">Tiền</span>
          <strong>{formatNumber(state.money)}</strong>
        </div>
        <div className="form-row">
          <span className="form-label">Túi đồ</span>
          <ul className="chips">
            {Object.entries(state.inventory.stacks).map(([itemId, count]) => (
              <li key={itemId} className="chip">
                {nameOf(data, 'items', itemId)} × {formatNumber(count)}
              </li>
            ))}
          </ul>
        </div>
        <div className="form-row">
          <span className="form-label">Lưu game</span>
          <span className="muted">
            {saveStatus.lastSavedAt
              ? `Đã lưu lúc ${saveStatus.lastSavedAt.toLocaleTimeString('vi-VN')}`
              : 'Chưa lưu'}
            {inBattle && ' · Đang trong trận: không tự lưu'}
          </span>
        </div>
        {saveStatus.message && (
          <p className={saveStatus.isError ? 'error' : 'success'} role="status">
            {saveStatus.message}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onExit}>
            Về màn tiêu đề
          </button>
          <button type="button" className="button" onClick={onExport}>
            Xuất save ra file
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onManualSave}
            disabled={inBattle}
            title={inBattle ? 'Không lưu được trong trận' : undefined}
          >
            Lưu
          </button>
        </div>
      </section>
    </main>
  )
}
