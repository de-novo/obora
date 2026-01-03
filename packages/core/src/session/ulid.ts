const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ENCODING_LEN = ENCODING.length
const TIME_LEN = 10
const RANDOM_LEN = 16

function encodeTime(now: number, len: number): string {
  let str = ''
  for (let i = len; i > 0; i--) {
    const mod = now % ENCODING_LEN
    str = ENCODING[mod] + str
    now = Math.floor(now / ENCODING_LEN)
  }
  return str
}

function encodeRandom(len: number): string {
  let str = ''
  const randomBytes = crypto.getRandomValues(new Uint8Array(len))
  for (let i = 0; i < len; i++) {
    str += ENCODING[randomBytes[i]! % ENCODING_LEN]
  }
  return str
}

export function ulid(seedTime?: number): string {
  const time = seedTime ?? Date.now()
  return encodeTime(time, TIME_LEN) + encodeRandom(RANDOM_LEN)
}

export function decodeTime(id: string): number {
  const timeStr = id.substring(0, TIME_LEN)
  let time = 0
  for (let i = 0; i < timeStr.length; i++) {
    const char = timeStr[i]!
    const charIndex = ENCODING.indexOf(char)
    if (charIndex === -1) throw new Error(`Invalid ULID character: ${char}`)
    time = time * ENCODING_LEN + charIndex
  }
  return time
}

export function isValidUlid(id: string): boolean {
  if (id.length !== TIME_LEN + RANDOM_LEN) return false
  for (const char of id) {
    if (!ENCODING.includes(char)) return false
  }
  return true
}
