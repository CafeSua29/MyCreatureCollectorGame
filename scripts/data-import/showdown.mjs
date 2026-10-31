/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Dùng chung cho các script nhập từ Pokémon Showdown (zmove-import.mjs, crit-accuracy-import.mjs,
// learn-sources-import.mjs): tải file dữ liệu `exports.X = {...}` và đọc object bằng AST (acorn),
// không chạy code tải về.

import * as acorn from 'acorn'

const SHOWDOWN = 'https://play.pokemonshowdown.com/data'

/** Giá trị literal của một nút AST (object / mảng / số / chuỗi); hàm và biểu thức khác bỏ qua. */
function literal(node) {
  switch (node.type) {
    case 'ObjectExpression':
      return Object.fromEntries(
        node.properties.map((p) => [
          p.key.type === 'Identifier' ? p.key.name : p.key.value,
          literal(p.value)
        ])
      )
    case 'ArrayExpression':
      return node.elements.map(literal)
    case 'Literal':
      return node.value
    case 'UnaryExpression':
      return node.operator === '-' ? -literal(node.argument) : literal(node.argument)
    default:
      return undefined
  }
}

/** Tải một file dữ liệu của Showdown (ví dụ "moves.js") và đọc object bằng AST. */
export async function fetchShowdown(file) {
  const response = await fetch(`${SHOWDOWN}/${file}`)
  if (!response.ok) throw new Error(`Tải ${file} lỗi ${response.status}`)
  const ast = acorn.parse(await response.text(), { ecmaVersion: 2022 })
  return literal(ast.body[0].expression.right)
}

/** Id của Showdown: chữ thường, bỏ ký tự khác chữ / số ("Double-Edge" → "doubleedge"). */
export const showdownId = (id) => id.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Tên tiếng Anh → id camelCase của project (cùng cách đặt id lúc nhập). */
export function camelId(name) {
  const words = name
    .replace(/['’.:]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  return words
    .map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1)))
    .join('')
}
