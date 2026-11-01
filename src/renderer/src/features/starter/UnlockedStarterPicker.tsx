import { useMemo, useState } from 'react'
import type { GameData } from '@core'
import { nameOf } from '../../shared/lib/contentText'

/** Số loài hiện tối đa một lúc (mở khóa theo chuỗi đã sở hữu có thể lên hàng trăm loài). */
const MAX_SHOWN = 60

interface Props {
  data: GameData
  speciesIds: readonly string[]
  selectedId: string | null
  onSelect: (speciesId: string) => void
}

/** Danh sách loài khởi đầu đã mở khóa xuyên save, lọc theo tên. Chọn thì hiện thẻ ở lưới phía trên. */
export function UnlockedStarterPicker({
  data,
  speciesIds,
  selectedId,
  onSelect
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const entries = useMemo(
    () => speciesIds.map((id) => ({ id, name: nameOf(data, 'species', id) })),
    [data, speciesIds]
  )
  const needle = query.trim().toLocaleLowerCase()
  const matches = entries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle))

  return (
    <section className="panel unlocked-starters" aria-label="Quái khởi đầu đã mở khóa">
      <label className="form-row">
        <span className="form-label">Đã mở khóa ({entries.length})</span>
        <input
          className="text-input"
          type="search"
          value={query}
          placeholder="Tìm theo tên"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul className="chips">
        {matches.slice(0, MAX_SHOWN).map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={
                entry.id === selectedId ? 'chip chip-button chip-selected' : 'chip chip-button'
              }
              aria-pressed={entry.id === selectedId}
              onClick={() => onSelect(entry.id)}
            >
              {entry.name}
            </button>
          </li>
        ))}
      </ul>
      {matches.length > MAX_SHOWN && (
        <p className="card-subtitle">Còn {matches.length - MAX_SHOWN} loài, gõ tên để lọc.</p>
      )}
    </section>
  )
}
