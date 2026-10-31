import { STAT_NAMES, type Decimal, type GameData, type MonsterView } from '@core'
import { monsterNameOf, nameOf } from '../lib/contentText'
import { formatNumber } from '../lib/format'
import { statBarPercent } from '../lib/statBar'
import { GENDER_LABELS, STAT_LABELS, TRAIT_KIND_LABELS } from '../lib/labels'

interface Props {
  data: GameData
  view: MonsterView
  /** Giá trị dùng làm 100% cho thanh chỉ số (để so sánh nhiều thẻ với nhau). */
  statScale: Decimal
  selected?: boolean
  onSelect?: () => void
}

/** Thẻ thông tin một quái: tên, hệ, race, chỉ số (thanh + số), gen, trait, skill. */
export function MonsterCard({
  data,
  view,
  statScale,
  selected,
  onSelect
}: Props): React.JSX.Element {
  const content = (
    <>
      <header className="card-header">
        <h2 className="card-title">{monsterNameOf(data, view)}</h2>
        {view.nickname && (
          <div className="card-subtitle">{nameOf(data, 'species', view.speciesId)}</div>
        )}
        <div className="badges">
          {view.elementIds.map((elementId) => (
            <span key={elementId} className={`badge element-${elementId}`}>
              {nameOf(data, 'elements', elementId)}
            </span>
          ))}
          <span className="badge">{nameOf(data, 'races', view.raceId)}</span>
          <span className="badge">Lv {formatNumber(view.level)}</span>
          <span className="badge">{GENDER_LABELS[view.gender]}</span>
        </div>
      </header>

      <table className="stats">
        <tbody>
          {STAT_NAMES.map((stat) => (
            <tr key={stat}>
              <th>{STAT_LABELS[stat]}</th>
              <td className="stat-bar-cell">
                <div className="stat-bar">
                  <div
                    className={`stat-bar-fill stat-${stat}`}
                    style={{ width: `${statBarPercent(view.stats[stat], statScale)}%` }}
                  />
                </div>
              </td>
              <td className="stat-value">{formatNumber(view.stats[stat])}</td>
              <td className="stat-gene" title="Gen">
                gen {formatNumber(view.genes[stat])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="card-section">
        <h3>Trait</h3>
        {view.traits.length === 0 ? (
          <p className="muted">Không có</p>
        ) : (
          <ul className="chips">
            {view.traits.map((trait) => (
              <li
                key={trait.id}
                className={`chip trait-${trait.kind}`}
                title={TRAIT_KIND_LABELS[trait.kind]}
              >
                {nameOf(data, 'traits', trait.id)}
                {trait.level > 1 && ` cấp ${trait.level}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section">
        <h3>Skill</h3>
        <ul className="chips">
          {view.skills.map((skill) => (
            <li key={skill.id} className={`chip element-${skill.elementId}`}>
              {nameOf(data, 'skills', skill.id)}
              {skill.power > 0 && <span className="muted"> · {skill.power}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  )

  if (!onSelect) return <article className="card">{content}</article>
  // Thẻ chọn được: role radio (chọn 1 trong nhiều), bấm chuột hoặc Enter / Space.
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      className={`card card-selectable${selected ? ' card-selected' : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      {content}
    </div>
  )
}
