import { useCallback, useEffect, useRef, useState } from 'react'
import {
  emptyProfile,
  recordStarterUnlocks,
  usableUnlockedStarters,
  type GameData,
  type GameState,
  type PlayerProfile
} from '@core'
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
import { loadProfile, saveProfile } from '../features/saves/profileService'
import { nameOf } from '../shared/lib/contentText'
import { starterUnlockedMessage } from '../shared/lib/labels'
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
  // Hồ sơ xuyên save (loài khởi đầu đã mở). Ref để commit luôn đọc bản mới nhất.
  const [profile, setProfile] = useState<PlayerProfile>(emptyProfile)
  const profileRef = useRef(profile)

  useEffect(() => {
    loadProfile().then(
      (loaded) => {
        profileRef.current = loaded
        setProfile(loaded)
      },
      // Không đọc được hồ sơ: chơi tiếp với hồ sơ rỗng (chỉ mất phần mở khóa meta).
      () => undefined
    )
  }, [])

  /** Ghi nhận loài khởi đầu mới mở từ state game, lưu profile.json và báo cho người chơi. */
  const recordUnlocks = useCallback(
    (state: GameState) => {
      const result = recordStarterUnlocks(data, state, profileRef.current)
      if (result.unlocked.length === 0) return
      profileRef.current = result.profile
      setProfile(result.profile)
      const names = result.unlocked.map((id) => nameOf(data, 'species', id))
      setSaveStatus((s) => ({ ...s, message: starterUnlockedMessage(names), isError: false }))
      saveProfile(result.profile).catch((caught) =>
        setSaveStatus((s) => ({
          ...s,
          message: `Lưu hồ sơ thất bại: ${errorMessage(caught)}`,
          isError: true
        }))
      )
    },
    [data]
  )

  /**
   * Đưa state mới vào phiên chơi và tự lưu (ngoài trận). Mọi thay đổi state của game sau này
   * (action từ gameReducer) đều đi qua đây.
   */
  const commit = useCallback(
    (next: Session) => {
      setSession(next)
      recordUnlocks(next.state)
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
    [data, recordUnlocks]
  )

  const openSession = (result: LoadResult): void => {
    if (!result.ok) {
      setScreen({ name: 'load', issues: result.issues })
      return
    }
    setSaveStatus(NO_STATUS)
    // Không tự lưu ngay khi load (state chỉ khác ở seed); lần lưu kế tiếp sẽ ghi.
    setSession({ gameId: result.gameId, state: result.state })
    // Save cũ / save chép từ máy khác cũng mở khóa theo tiến độ của nó.
    recordUnlocks(result.state)
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
          unlockedStarterIds={usableUnlockedStarters(data, profile)}
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
