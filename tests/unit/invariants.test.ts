// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

// The .ts and .tsx files at or under each repo-relative path, as repo-relative paths. A path can
// name a single file. One that doesn't exist yet contributes nothing.
function filesUnder(paths: string[]): string[] {
  return paths.flatMap(p => {
    const abs = join(root, p)
    if (!existsSync(abs)) return []
    const found = statSync(abs).isDirectory()
      ? readdirSync(abs, { recursive: true, encoding: 'utf8' }).map(f => join(p, f))
      : [p]
    return found.filter(f => /\.tsx?$/.test(f) && statSync(join(root, f)).isFile())
  })
}

const read = (f: string) => readFileSync(join(root, f), 'utf8')

it('never says "getting" in app/, components/ or lib/ (spec: Wording)', () => {
  expect(filesUnder(['app', 'components', 'lib']).filter(f => /getting/i.test(read(f)))).toEqual([])
})
it('has no NEXT_PUBLIC_ env vars anywhere in the app', () => {
  expect(filesUnder(['app', 'components', 'lib', 'proxy.ts']).filter(f => read(f).includes('NEXT_PUBLIC_'))).toEqual([])
})
it('lays out with md: or wider, never sm:', () => {
  expect(filesUnder(['app', 'components']).filter(f => /\bsm:/.test(read(f)))).toEqual([])
})
// Every page sits under app/loading.tsx. In the budgeting app, a #fragment link under a loading
// placeholder left that placeholder on screen when the page behind it failed to load.
it('links to no #fragment under app/loading.tsx', () => {
  expect(filesUnder(['app', 'components']).filter(f => /href=\{?\s*["'`][^"'`]*#/.test(read(f)))).toEqual([])
})
