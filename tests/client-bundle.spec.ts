import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string }

describe('client bundle', () => {
  it('is stamped with the package identity and stays browser-pure after build', () => {
    const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(bundle).toContain(`id: "${pkg.name}"`)
    expect(bundle).not.toMatch(/require\("(?:node:|ws|puppeteer-core)/)
  })
})
