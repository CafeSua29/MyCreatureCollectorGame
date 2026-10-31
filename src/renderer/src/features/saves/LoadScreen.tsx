import { useCallback, useEffect, useState } from 'react'
import type { GameData } from '@core'
import type { SaveEntry } from '../../../../preload/api'
import { summaryLeaderLabel, summaryLocationLabel } from '../../shared/lib/contentText'
import { formatNumber } from '../../shared/lib/format'
import { errorMessage } from './saveService'

interface Props {
  data: GameData
  onLoad: (id: string) => void
  onImport: () => void
  onBack: () => void
  /** Lỗi khi load / nhập (danh sách lỗi từ core.parseSave). */
  issues: string[] | null
}

interface GameGroup {
  gameId: string
  entries: SaveEntry[]
}

/** Gom save theo game, giữ thứ tự mới nhất trước (danh sách từ main đã sắp xếp). */
function groupByGame(entries: SaveEntry[]): GameGroup[] {
  const groups: GameGroup[] = []
  for (const entry of entries) {
    const group = groups.find((g) => g.gameId === entry.gameId)
    if (group) group.entries.push(entry)
    else groups.push({ gameId: entry.gameId, entries: [entry] })
  }
  return groups
}

const formatTime = (iso: string): string => (iso ? new Date(iso).toLocaleString('vi-VN') : '?')

/** Danh sách game và các bản save; tải, xóa, nhập save từ file. */
export function LoadScreen({ data, onLoad, onImport, onBack, issues }: Props): React.JSX.Element {
  const [entries, setEntries] = useState<SaveEntry[] | null>(null)
  const [saveDir, setSaveDir] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    Promise.all([window.api.saves.list(), window.api.saves.getDir()])
      .then(([list, dir]) => {
        setEntries(list)
        setSaveDir(dir)
      })
      .catch((caught) => setError(errorMessage(caught)))
  }, [])

  useEffect(refresh, [refresh])

  const remove = (entry: SaveEntry): void => {
    const label = entry.kind === 'auto' ? 'bản tự lưu' : 'bản lưu tay'
    if (!window.confirm(`Xóa ${label} lúc ${formatTime(entry.savedAt)}?`)) return
    window.api.saves.delete(entry.id).then(refresh, (caught) => setError(errorMessage(caught)))
  }

  const removeGame = (group: GameGroup): void => {
    const summary = group.entries.find((e) => e.summary)?.summary
    const name = summary ? summaryLeaderLabel(data, summary) : group.gameId
    if (
      !window.confirm(
        `Xóa toàn bộ game "${name}" (${group.entries.length} save)? Không hoàn tác được.`
      )
    ) {
      return
    }
    window.api.saves
      .deleteGame(group.gameId)
      .then(refresh, (caught) => setError(errorMessage(caught)))
  }

  const groups = groupByGame(entries ?? [])

  return (
    <main className="screen">
      <h1 className="screen-title">Tải game</h1>
      <div className="form-actions">
        <button type="button" className="button" onClick={onBack}>
          Quay lại
        </button>
        <button type="button" className="button button-primary" onClick={onImport}>
          Nhập save từ file
        </button>
      </div>

      {(issues || error) && (
        <section className="panel" role="alert">
          <strong className="error">Không mở được save:</strong>
          <ul className="error">
            {(issues ?? [error as string]).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}

      {entries === null && !error && <p className="muted">Đang đọc danh sách save...</p>}
      {entries !== null && groups.length === 0 && <p className="muted">Chưa có save nào.</p>}

      {groups.map((group) => {
        const summary = group.entries.find((e) => e.summary)?.summary
        return (
          <section key={group.gameId} className="panel">
            <div className="save-group-header">
              <div>
                <h2 className="card-title">
                  {summary ? summaryLeaderLabel(data, summary) : group.gameId}
                </h2>
                {summary && (
                  <div className="muted">
                    Lv cao nhất {formatNumber(summary.highestLevel)} · {summary.totalMonsters} quái
                    · {formatNumber(summary.money)} tiền · {summaryLocationLabel(data, summary)}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="button button-danger"
                onClick={() => removeGame(group)}
              >
                Xóa game
              </button>
            </div>
            <ul className="save-list">
              {group.entries.map((entry) => (
                <li key={entry.id} className="save-row">
                  <span className={`badge ${entry.kind === 'auto' ? '' : 'badge-manual'}`}>
                    {entry.kind === 'auto' ? 'Tự lưu' : 'Lưu tay'}
                  </span>
                  <span className="save-time">{formatTime(entry.savedAt)}</span>
                  {entry.error ? (
                    <span className="error">{entry.error}</span>
                  ) : (
                    <span className="muted">
                      {entry.summary &&
                        `Lv ${formatNumber(entry.summary.highestLevel)} · ${formatNumber(entry.summary.money)} tiền`}
                    </span>
                  )}
                  <span className="save-actions">
                    <button
                      type="button"
                      className="button"
                      disabled={Boolean(entry.error)}
                      onClick={() => onLoad(entry.id)}
                    >
                      Tải
                    </button>
                    <button type="button" className="button" onClick={() => remove(entry)}>
                      Xóa
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {saveDir && <p className="muted save-dir">Thư mục save: {saveDir}</p>}
    </main>
  )
}
