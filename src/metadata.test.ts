import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const html = readFileSync(new URL('index.html', root), 'utf8')
const site = 'https://times-tables.lynas.dev/'
const description = 'Keyboard-first multiplication practice with preset grids or custom factors, ordered or shuffled rounds, and scores saved in your browser.'
function meta(key: string) {
  return html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]+)"`))?.[1]
}

describe('public link previews', () => {
  it('describes current practice options with one canonical site identity', () => {
    expect(meta('description')).toBe(description)
    expect(html).toContain('<title>Times tables</title>')
    expect(html).toContain(`<link rel="canonical" href="${site}"`)
    expect(meta('og:type')).toBe('website')
    expect(meta('og:site_name')).toBe('Times tables')
    expect(meta('og:title')).toBe('Times tables')
    expect(meta('og:description')).toBe(description)
    expect(meta('og:url')).toBe(site)
    expect(meta('twitter:card')).toBe('summary_large_image')
    expect(meta('twitter:title')).toBe(meta('og:title'))
    expect(meta('twitter:description')).toBe(description)
  })

  it('serves a correctly described raster preview from the public directory', () => {
    const image = `${site}social-preview.png`
    expect(meta('og:image')).toBe(image)
    expect(meta('twitter:image')).toBe(image)
    expect(meta('og:image:type')).toBe('image/png')
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
    expect(meta('og:image:alt')).toBe('An ordered multiplication grid with sample answers in dark mode.')
    expect(meta('twitter:image:alt')).toBe(meta('og:image:alt'))
    const png = readFileSync(fileURLToPath(new URL('public/social-preview.png', root)))
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
  })
})
