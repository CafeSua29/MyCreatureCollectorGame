import { useEffect, useState } from 'react'
import type { GameData } from '@core'
import type { SaveEntry } from '../../../../preload/api'
import { errorMessage } from '../saves/saveService'
import { summaryLeaderName } from '../../shared/lib/contentText'
import { GAME_TITLE } from '../../shared/lib/labels'

interface Props {
  data: GameData
  onNewGame: () => void
  /** Mở save mới nhất (của game chơi gần nhất). */
  onContinue: (entry: SaveEntry) => void
  onOpenLoad: () => void
  /** Lỗi từ lần load trước (ví dụ save hỏng). */
  message: string | null
}

export function TitleScreen({
  data,
  onNewGame,
  onContinue,
  onOpenLoad,
  message
}: Props): React.JSX.Element {
  const [latest, setLatest] = useState<SaveEntry | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.saves
      .list()
      .then((entries) => setLatest(entries.find((entry) => !entry.error) ?? null))
      .catch((caught) => {
        setLatest(null)
        setError(errorMessage(caught))
      })
  }, [])

  return (
    <main className="screen title-screen">
      <h1 className="game-title">{GAME_TITLE}</h1>
      <p className="muted">Bắt, nuôi, breed và fuse quái — mọi thứ scale vô hạn.</p>
      <div className="title-actions">
        {latest && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => onContinue(latest)}
          >
            Tiếp tục
          </button>
        )}
        <button
          type="button"
          className={latest ? 'button' : 'button button-primary'}
          onClick={onNewGame}
        >
          Game mới
        </button>
        <button type="button" className="button" onClick={onOpenLoad}>
          Tải game
        </button>
      </div>
      {latest && latest.summary && (
        <p className="muted">
          Gần nhất: {summaryLeaderName(data, latest.summary)} · Lv {latest.summary.highestLevel} ·{' '}
          {new Date(latest.savedAt).toLocaleString('vi-VN')}
        </p>
      )}
      {(message || error) && (
        <p className="error" role="alert">
          {message ?? error}
        </p>
      )}
    </main>
  )
}
