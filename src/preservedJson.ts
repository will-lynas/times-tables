// JSON.parse alone silently rounds numbers and collapses duplicate members.
// Refuse those sources instead of rewriting richer unknown metadata incorrectly.
export function parsePreserved(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw)
  const stack: (Set<string> | null)[] = []
  const tokens = /"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g
  for (const match of raw.matchAll(tokens)) {
    const token = match[0]
    if (token === '{') stack.push(new Set())
    else if (token === '[') stack.push(null)
    else if (token === '}' || token === ']') stack.pop()
    else if (token.startsWith('"') && raw.slice(match.index + token.length).trimStart().startsWith(':')) {
      const keys = stack.at(-1)
      const key: string = JSON.parse(token)
      if (!keys || keys.has(key)) throw new Error('Duplicate JSON member')
      keys.add(key)
    } else if (/^-?\d/.test(token)) {
      const number = Number(token)
      if (!Number.isFinite(number) || Object.is(number, -0) || decimal(token) !== decimal(String(number))) throw new Error('Lossy JSON number')
    }
  }
  return parsed
}
function decimal(source: string) {
  const [mantissa, power = '0'] = source.toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const digits = (whole + fraction).replace(/^-?0+/, whole.startsWith('-') ? '-' : '').replace(/^-?$/, '0')
  if (/^-?0+$/.test(digits)) return '0'
  const zeros = digits.match(/0+$/)?.[0].length ?? 0
  return `${zeros ? digits.slice(0, -zeros) : digits}e${Number(power) - fraction.length + zeros}`
}
