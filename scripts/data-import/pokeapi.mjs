/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Dùng chung cho các script nhập từ PokeAPI (pokemon-size-import.mjs, pokemon-dex-text-import.mjs):
// tải bảng CSV và khớp id loài của game với dòng `pokemon` của PokeAPI.

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'

/** Đọc CSV (ô có thể trong ngoặc kép, chứa dấu phẩy / xuống dòng / "" thoát) thành danh sách object. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '')
  return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])))
}

/** Tải một bảng CSV của PokeAPI (tên file không có đuôi, ví dụ "pokemon"). */
export async function fetchPokeApiCsv(name) {
  const response = await fetch(`${CSV_BASE}/${name}.csv`)
  if (!response.ok) throw new Error(`Không tải được ${name}.csv (${response.status})`)
  return parseCsv(await response.text())
}

/**
 * Hàm khớp id loài của game (camelCase) với dòng của bảng `pokemon`: camelCase → kebab-case (thử cả
 * có / không tách chữ số), không có thì dạng mặc định của loài (`<id>-…`, is_default), bỏ dần phần
 * đuôi. Không khớp = null.
 */
export function pokemonMatcher(pokemonRows) {
  const rows = new Map(pokemonRows.map((row) => [row.identifier, row]))
  const variants = (id) => {
    const a = id.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase()
    const b = id.replace(/(?<!^)(?=[A-Z0-9])/g, '-').toLowerCase()
    const c = b.replace(/(\d)-(?=\d)/g, '$1')
    return [...new Set([a, b, c])]
  }
  const find = (key) => {
    if (rows.has(key)) return rows.get(key)
    for (const [identifier, row] of rows) {
      if (identifier.startsWith(`${key}-`) && row.is_default === '1') return row
    }
    return null
  }
  return (id) => {
    for (let key of variants(id)) {
      for (;;) {
        const row = find(key)
        if (row) return row
        if (!key.includes('-')) break
        key = key.slice(0, key.lastIndexOf('-'))
      }
    }
    return null
  }
}

/** Loài Pokémon của game: loài thường không có origin / source. */
export const isPokemonSpecies = (species) =>
  species.kind === 'normal' && !species.origin && !species.source
