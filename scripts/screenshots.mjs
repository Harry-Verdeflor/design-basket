// Regenerates the README screenshots in docs/screenshots and the sample export in docs/example-pack.
// 1. npm run dev   2. npm run screenshots   (or: npm run screenshots -- http://localhost:5199)
// Uses your installed Chrome or Edge in headless mode with a throwaway profile.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import puppeteer from 'puppeteer-core'

const url = process.argv[2] ?? process.env.SCREENSHOT_URL ?? 'http://localhost:5173'
const out = 'docs/screenshots'
const candidates = [
  process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)
const executablePath = candidates.find((p) => existsSync(p))
if (!executablePath) throw new Error('No Chrome/Edge found. Set BROWSER_PATH to your browser executable.')

mkdirSync(out, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'basket-shots-'))
const browser = await puppeteer.launch({ executablePath, headless: true, userDataDir: profile })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.waitForSelector('#proj')

  // Seed the demo project and open it.
  await page.evaluate(async () => {
    const { createDemoProject } = await import('/src/lib/demo.ts')
    const id = await createDemoProject()
    localStorage.setItem('db-project', id)
    localStorage.setItem('db-view', 'stack')
  })
  const reload = async () => {
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('[role=tablist], .tray')
    await page.evaluate(() => document.fonts.ready)
  }
  await reload()

  // Write the demo's export (brief, tokens, reference images) as a browsable example pack.
  const pack = await page.evaluate(async () => {
    const { db } = await import('/src/db.ts')
    const brief = await import('/src/lib/brief.ts')
    const id = localStorage.getItem('db-project')
    const project = await db.projects.get(id)
    const baskets = await db.baskets.where('projectId').equals(id).toArray()
    const items = await db.items.where('projectId').equals(id).toArray()
    const images = await db.images.bulkGet(items.map((i) => i.imageBlobId).filter(Boolean))
    const mimes = Object.fromEntries(images.map((img) => [img.id, img.mime]))
    const input = { project, baskets, items, mimes, exportedAt: new Date('2026-01-01T00:00:00Z') }
    const files = {}
    for (const p of brief.planImages(input)) {
      const img = images.find((x) => x.id === p.blobId)
      const bytes = new Uint8Array(await img.blob.arrayBuffer())
      files[p.path] = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    }
    const tokens = brief.generateTokens(input)
    return {
      'DESIGN.md': brief.generateBrief(input),
      'design-tokens.json': `${JSON.stringify(tokens, null, 2)}\n`,
      'tokens.css': brief.generateTokensCss(tokens),
      'PASTE_INTO_CLAUDE_CODE.txt': brief.generatePasteText(project),
      files,
    }
  })
  const { files, ...texts } = pack
  rmSync('docs/example-pack', { recursive: true, force: true })
  mkdirSync('docs/example-pack', { recursive: true })
  for (const [name, text] of Object.entries(texts)) writeFileSync(`docs/example-pack/${name}`, text)
  for (const [path, b64] of Object.entries(files)) {
    mkdirSync(dirname(`docs/example-pack/${path}`), { recursive: true })
    writeFileSync(`docs/example-pack/${path}`, Buffer.from(b64, 'base64'))
  }

  const openFolder = (label) =>
    page.evaluate((l) => [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.startsWith(l)).click(), label)
  const clickText = (text) => page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t).click(), text)
  const settle = async (y = 0) => {
    await page.evaluate((top) => {
      document.activeElement?.blur()
      window.scrollTo(0, top)
    }, y)
    await sleep(700)
  }
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` })

  await openFolder('Color')
  await settle()
  await shot('folders')

  await openFolder('Components')
  await sleep(400)
  await page.click('button[aria-label="Suggestions for Components"]')
  await settle(160)
  await shot('suggestions')

  await clickText('Overview')
  await settle()
  await shot('overview')

  await clickText('Folders')
  await openFolder('Brand')
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await settle()
  await shot('dark')
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])

  const client = await page.createCDPSession()
  await client.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
  await clickText('Export for Claude Code')
  await page.waitForSelector('[role=dialog]')
  await settle()
  await shot('export')
  await page.keyboard.press('Escape')

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await reload()
  await openFolder('Typography')
  await settle()
  await shot('mobile')

  console.log(`Saved screenshots to ${out}/ and the example pack to docs/example-pack/`)
} finally {
  await browser.close()
  rmSync(profile, { recursive: true, force: true })
}
