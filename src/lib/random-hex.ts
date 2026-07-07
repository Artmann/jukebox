export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)

  crypto.getRandomValues(bytes)

  let result = ''

  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0')
  }

  return result
}
