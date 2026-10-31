/* eslint-disable @typescript-eslint/explicit-function-return-type -- file .mjs chạy thẳng bằng node, không có cú pháp kiểu */
// Đọc một file trong zip tải về (không cần thư viện ngoài). Đọc theo central directory vì nhiều zip
// (ví dụ ELEData.zip của AVONET) ghi kích thước ở data descriptor, local header để 0.

import { inflateRawSync } from 'node:zlib'

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_FILE_HEADER = 0x02014b50
const DEFLATE = 8

/** Trả nội dung (Buffer) của `fileName` trong zip `buffer`; hỗ trợ không nén và deflate. */
export function unzipEntry(buffer, fileName) {
  let end = buffer.length - 22
  while (end >= 0 && buffer.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) end--
  if (end < 0) throw new Error('File tải về không phải zip')
  const entryCount = buffer.readUInt16LE(end + 10)
  let at = buffer.readUInt32LE(end + 16)
  for (let i = 0; i < entryCount && buffer.readUInt32LE(at) === CENTRAL_FILE_HEADER; i++) {
    const method = buffer.readUInt16LE(at + 10)
    const size = buffer.readUInt32LE(at + 20)
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const localOffset = buffer.readUInt32LE(at + 42)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength)
    at += 46 + nameLength + extraLength + commentLength
    if (name !== fileName) continue
    const start =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28)
    const data = buffer.subarray(start, start + size)
    return method === DEFLATE ? inflateRawSync(data) : data
  }
  throw new Error(`Không thấy ${fileName} trong zip`)
}

/** Tải zip từ `url` rồi trả nội dung `fileName` trong đó. */
export async function fetchZipEntry(url, fileName) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Không tải được ${url} (${response.status})`)
  return unzipEntry(Buffer.from(await response.arrayBuffer()), fileName)
}
