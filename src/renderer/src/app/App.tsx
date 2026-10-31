import { useCallback, useState } from 'react'
import type { GameData, GameState } from '@core'
import type { SaveEntry } from '../../../preload/api'
import { gameDataResult, newSeed } from '../shared/game/gameData'
import {
  autosave,
  errorMessage,
  exportSave,
  importSave,
  loadSave,
  manualSave,
  newGameId,
  type LoadResult,
  type Session
} from '../features/saves/saveService'
import { LoadScreen } from '../features/saves/LoadScreen'
import { PartyPreviewScreen, type SaveStatus } from '../features/party/PartyPreviewScreen'
import { StarterScreen } from '../features/starter/StarterScreen'
import { TitleScreen } from '../features/title/TitleScreen'

type Screen =
  | { name: 'title'; message: string | null }
  | { name: 'starter'; seed: number }
  | { name: 'load'; issues: string[] | null }
  | { name: 'game' }

const NO_STATUS: SaveStatus = { lastSavedAt: null, message: null, isError: false }

function App(): React.JSX.Element {
  // Main process đã chặn dữ liệu lỗi lúc khởi động; đây chỉ là lưới an toàn.
  if (!gameDataResult.ok) {
    return (
      <main className="screen">
        <h1 className="screen-title">Lỗi dữ liệu game</h1>
        <ul className="error">
          {gameDataResult.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </main>
    )
  }
  return <Game data={gameDataResult.data} />
}

function Game({ data }: { data: GameData }): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'title', message: null })
  const [session, setSession] = useState<Session | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(NO_STATUS)

  /**
   * Đưa state mới vào phiên chơi và tự lưu (ngoài trận). Mọi thay đổi state của game sau này
   * (action từ gameReducer) đều đi qua đây.
   */
  const commit = useCallback(
    (next: Session) => {
      setSession(next)
      autosave(data, next).then(
        (saved) => {
          if (saved) setSaveStatus((s) => ({ ...s, lastSavedAt: new Date() }))
        },
        (caught) =>
          setSaveStatus((s) => ({
            ...s,
            message: `Tự lưu thất bại: ${errorMessage(caught)}`,
            isError: true
          }))
      )
    },
    [data]
  )

  const openSession = (result: LoadResult): void => {
    if (!result.ok) {
      setScreen({ name: 'load', issues: result.issues })
      return
    }
    setSaveStatus(NO_STATUS)
    // Không tự lưu ngay khi load (state chỉ khác ở seed); lần lưu kế tiếp sẽ ghi.
    setSession({ gameId: result.gameId, state: result.state })
    setScreen({ name: 'game' })
  }

  const load = (id: string): void => {
    loadSave(data, id).then(openSession, (caught) =>
      setScreen({ name: 'load', issues: [errorMessage(caught)] })
    )
  }

  switch (screen.name) {
    case 'title':
      return (
        <TitleScreen
          data={data}
          message={screen.message}
          onNewGame={() => setScreen({ name: 'starter', seed: newSeed() })}
          onContinue={(entry: SaveEntry) => load(entry.id)}
          onOpenLoad={() => setScreen({ name: 'load', issues: null })}
        />
      )
    case 'starter':
      return (
        <StarterScreen
          data={data}
          seed={screen.seed}
          onCreated={(state: GameState) => {
            setSaveStatus(NO_STATUS)
            commit({ gameId: newGameId(), state })
            setScreen({ name: 'game' })
          }}
          onBack={() => setScreen({ name: 'title', message: null })}
        />
      )
    case 'load':
      return (
        <LoadScreen
          data={data}
          issues={screen.issues}
          onLoad={load}
          onImport={() =>
            importSave(data).then(
              (result) => result && openSession(result),
              (caught) => setScreen({ name: 'load', issues: [errorMessage(caught)] })
            )
          }
          onBack={() => setScreen({ name: 'title', message: null })}
        />
      )
    case 'game':
      if (!session) return <p className="screen">Không có game nào đang chơi.</p>
      return (
        <PartyPreviewScreen
          data={data}
          state={session.state}
          saveStatus={saveStatus}
          onManualSave={() =>
            manualSave(data, session).then(
              () =>
                setSaveStatus({ lastSavedAt: new Date(), message: 'Đã lưu tay.', isError: false }),
              (caught) =>
                setSaveStatus((s) => ({
                  ...s,
                  message: `Lưu thất bại: ${errorMessage(caught)}`,
                  isError: true
                }))
            )
          }
          onExport={() =>
            exportSave(data, session).then(
              (file) =>
                file &&
                setSaveStatus((s) => ({
                  ...s,
                  message: `Đã xuất save ra ${file}`,
                  isError: false
                })),
              (caught) =>
                setSaveStatus((s) => ({
                  ...s,
                  message: `Xuất save thất bại: ${errorMessage(caught)}`,
                  isError: true
                }))
            )
          }
          onExit={() => {
            setSession(null)
            setScreen({ name: 'title', message: null })
          }}
        />
      )
  }
}

export default App
