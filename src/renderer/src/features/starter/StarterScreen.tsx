import { useMemo, useState } from 'react'
import {
  ActionError,
  buildMonsterView,
  createNewGame,
  equipmentSlotCount,
  rollStarters,
  rollUnlockedStarter,
  type GameData,
  type GameState,
  type Gender,
  type Monster
} from '@core'
import { MonsterCard } from '../../shared/components/MonsterCard'
import { nameOf } from '../../shared/lib/contentText'
import { GENDER_LABELS } from '../../shared/lib/labels'
import { statBarScale } from '../../shared/lib/statBar'
import { UnlockedStarterPicker } from './UnlockedStarterPicker'

interface Props {
  data: GameData
  seed: number
  /** Loài khởi đầu đã mở khóa xuyên save (profile.json), còn làm khởi đầu được. */
  unlockedStarterIds: readonly string[]
  onCreated: (state: GameState) => void
  onBack: () => void
}

/**
 * Chọn quái khởi đầu. Các ứng viên được random sẵn từ seed (rollStarters), nên chỉ số trên
 * thẻ đúng là con sẽ nhận; createNewGame random lại từ cùng seed khi xác nhận. Loài đã mở khóa
 * cũng random tất định từ seed (rollUnlockedStarter).
 */
export function StarterScreen({
  data,
  seed,
  unlockedStarterIds,
  onCreated,
  onBack
}: Props): React.JSX.Element {
  const candidates = useMemo(() => rollStarters(data, seed).candidates, [data, seed])
  // Loài đã mở mà đã là ứng viên của ô thì không lặp lại (createNewGame ưu tiên con của ô).
  const extraIds = useMemo(
    () => unlockedStarterIds.filter((id) => !candidates.some((m) => m.speciesId === id)),
    [unlockedStarterIds, candidates]
  )
  // Loài đã mở đang chọn (null = đang chọn một ứng viên của ô).
  const [unlockedId, setUnlockedId] = useState<string | null>(null)
  const unlockedMonster = useMemo(
    () => (unlockedId ? rollUnlockedStarter(data, seed, { speciesId: unlockedId }).monster : null),
    [data, seed, unlockedId]
  )
  const shown: Monster[] = useMemo(
    () => (unlockedMonster ? [...candidates, unlockedMonster] : candidates),
    [candidates, unlockedMonster]
  )
  const views = useMemo(() => {
    // Game mới bắt đầu ở tầng 1, ngự thú sư cảnh giới 0: số ô trang bị lúc đó; chưa có đội, chưa ở đâu;
    // tư chất chấm theo tầng 1.
    const equipmentSlots = equipmentSlotCount(data, {
      highestFloor: 1,
      tamer: { realm: 0 },
      ascension: { bestFloor: 1, bestRealm: 0 }
    })
    return shown.map((monster, index) =>
      buildMonsterView(data, monster, {
        location: 'party',
        index,
        equipmentSlots,
        scene: { party: [], place: null, aptitudeFloor: 1, time: 0 }
      })
    )
  }, [data, shown])
  // Thanh chỉ số dùng chung một thang để so sánh các ứng viên với nhau.
  const statScale = statBarScale(views)

  const [selected, setSelected] = useState(0)
  const chosen = shown[selected] ?? candidates[0]
  const selectedSpeciesName = nameOf(data, 'species', chosen.speciesId)
  const [gender, setGender] = useState<Gender>(candidates[0].gender)
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)

  const choose = (index: number): void => {
    setSelected(index)
    setGender(shown[index].gender)
    setError(null)
  }

  const chooseUnlocked = (speciesId: string): void => {
    const monster = rollUnlockedStarter(data, seed, { speciesId }).monster
    setUnlockedId(speciesId)
    // Thẻ loài đã mở luôn đứng sau các ứng viên của ô.
    setSelected(candidates.length)
    setGender(monster.gender)
    setError(null)
  }

  const confirm = (): void => {
    try {
      onCreated(
        createNewGame(data, {
          seed,
          starterSpeciesId: chosen.speciesId,
          gender,
          nickname,
          unlockedStarterIds
        })
      )
    } catch (caught) {
      // Tạm hiện câu debug của lỗi; dịch theo mã lỗi làm ở bước UI (mục "Đa ngôn ngữ").
      if (caught instanceof ActionError) setError(caught.message)
      else throw caught
    }
  }

  return (
    <main className="screen">
      <h1 className="screen-title">Chọn người bạn đồng hành đầu tiên</h1>

      <div className="card-grid" role="radiogroup" aria-label="Quái khởi đầu">
        {views.map((view, i) => (
          <MonsterCard
            key={`${i}-${view.speciesId}`}
            data={data}
            view={view}
            statScale={statScale}
            selected={i === selected}
            onSelect={() => choose(i)}
          />
        ))}
      </div>

      {extraIds.length > 0 && (
        <UnlockedStarterPicker
          data={data}
          speciesIds={extraIds}
          selectedId={selected >= candidates.length ? unlockedId : null}
          onSelect={chooseUnlocked}
        />
      )}

      <form
        className="panel starter-form"
        onSubmit={(event) => {
          event.preventDefault()
          confirm()
        }}
      >
        <div className="form-row">
          <span className="form-label">Đã chọn</span>
          <strong>{selectedSpeciesName}</strong>
        </div>

        {/* Loài không giới tính: ứng viên có gender 'none', không cho chọn (mục "Loài không giới tính"). */}
        {chosen.gender !== 'none' && (
          <fieldset className="form-row">
            <legend className="form-label">Giới tính</legend>
            {(['female', 'male'] as const).map((value) => (
              <label key={value} className="radio">
                <input
                  type="radio"
                  name="gender"
                  value={value}
                  checked={gender === value}
                  onChange={() => setGender(value)}
                />
                {GENDER_LABELS[value]}
              </label>
            ))}
          </fieldset>
        )}

        <label className="form-row">
          <span className="form-label">Biệt danh (tùy chọn)</span>
          <input
            className="text-input"
            type="text"
            value={nickname}
            maxLength={data.config.maxNicknameLength}
            placeholder={selectedSpeciesName}
            onChange={(event) => {
              setNickname(event.target.value)
              setError(null)
            }}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="button" onClick={onBack}>
            Quay lại
          </button>
          <button type="submit" className="button button-primary">
            Xác nhận
          </button>
        </div>
      </form>
    </main>
  )
}
