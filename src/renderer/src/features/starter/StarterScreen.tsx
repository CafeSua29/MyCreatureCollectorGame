import { useMemo, useState } from 'react'
import {
  ActionError,
  buildMonsterView,
  createNewGame,
  equipmentSlotCount,
  rollStarters,
  type GameData,
  type GameState,
  type Gender
} from '@core'
import { MonsterCard } from '../../shared/components/MonsterCard'
import { nameOf } from '../../shared/lib/contentText'
import { GENDER_LABELS } from '../../shared/lib/labels'
import { statBarScale } from '../../shared/lib/statBar'

interface Props {
  data: GameData
  seed: number
  onCreated: (state: GameState) => void
  onBack: () => void
}

/**
 * Chọn quái khởi đầu. Các ứng viên được random sẵn từ seed (rollStarters), nên chỉ số trên
 * thẻ đúng là con sẽ nhận; createNewGame random lại từ cùng seed khi xác nhận.
 */
export function StarterScreen({ data, seed, onCreated, onBack }: Props): React.JSX.Element {
  const candidates = useMemo(() => rollStarters(data, seed).candidates, [data, seed])
  const views = useMemo(() => {
    // Game mới bắt đầu ở tầng 1, ngự thú sư cảnh giới 0: số ô trang bị lúc đó; chưa có đội, chưa ở đâu;
    // tư chất chấm theo tầng 1.
    const equipmentSlots = equipmentSlotCount(data, { highestFloor: 1, tamer: { realm: 0 } })
    return candidates.map((monster, index) =>
      buildMonsterView(data, monster, {
        location: 'party',
        index,
        equipmentSlots,
        scene: { party: [], place: null, aptitudeFloor: 1, time: 0 }
      })
    )
  }, [data, candidates])
  // Thanh chỉ số dùng chung một thang để so sánh các ứng viên với nhau.
  const statScale = statBarScale(views)

  const [selected, setSelected] = useState(0)
  const selectedSpeciesName = nameOf(data, 'species', candidates[selected].speciesId)
  const [gender, setGender] = useState<Gender>(candidates[0].gender)
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)

  const choose = (index: number): void => {
    setSelected(index)
    setGender(candidates[index].gender)
    setError(null)
  }

  const confirm = (): void => {
    try {
      onCreated(
        createNewGame(data, {
          seed,
          starterSpeciesId: candidates[selected].speciesId,
          gender,
          nickname
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
            key={view.speciesId}
            data={data}
            view={view}
            statScale={statScale}
            selected={i === selected}
            onSelect={() => choose(i)}
          />
        ))}
      </div>

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
        {candidates[selected].gender !== 'none' && (
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
