/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Dùng chung cho các script nhập từ Wikidata (animal-size-import.mjs, animal-active-time-import.mjs):
// gọi SPARQL có thử lại, dạng chữ hoa / thường của tên tiếng Anh để tra nhãn.

const SPARQL = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'creature-collector-data-import/1.0 (offline game data build)'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Chạy truy vấn SPARQL (thử lại 4 lần khi Wikidata lỗi / quá tải), trả về danh sách binding. */
export async function sparql(query) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${SPARQL}?query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT }
    })
    if (response.ok) return (await response.json()).results.bindings
    await sleep(5000 * (attempt + 1))
  }
  throw new Error('Wikidata không trả lời')
}

const sentence = (name) => name[0] + name.slice(1).toLowerCase()

/** Các dạng chữ của một tên để tra nhãn Wikidata (nguyên dạng, chữ thường, viết hoa chữ đầu). */
export const labelsOf = (name) => [...new Set([name, name.toLowerCase(), sentence(name)])]
