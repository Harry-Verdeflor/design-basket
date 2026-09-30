import { addFromText, addImages, createProject, db, setBasketStatus, updateItem, updateProject } from '../db'
import type { Basket, Item } from '../types'

type Draw = (x: CanvasRenderingContext2D, w: number, h: number) => void

async function picture(draw: Draw, w: number, h: number, name: string): Promise<File> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!, w, h)
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
  return new File([blob], name, { type: 'image/png' })
}

const INK = '#3B3024'
const CREAM = '#F4EDE1'
const CLAY = '#B5653A'
const SAND = '#E7D9C4'

const logo: Draw = (x, w, h) => {
  x.fillStyle = INK
  x.fillRect(0, 0, w, h)
  x.fillStyle = CREAM
  x.font = '600 150px Georgia'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText('harbor', w / 2, h / 2 - 10)
  x.strokeStyle = CLAY
  x.lineWidth = 10
  x.beginPath()
  x.moveTo(w / 2 - 200, h / 2 + 95)
  x.quadraticCurveTo(w / 2, h / 2 + 140, w / 2 + 200, h / 2 + 95)
  x.stroke()
}

const components: Draw = (x, w, h) => {
  x.fillStyle = CREAM
  x.fillRect(0, 0, w, h)
  const pill = (X: number, W: number, fill: string, text: string, color: string) => {
    x.fillStyle = fill
    x.strokeStyle = INK
    x.lineWidth = 4
    x.beginPath()
    x.roundRect(X, 120, W, 86, 18)
    x.fill()
    x.stroke()
    x.fillStyle = color
    x.font = '600 36px Arial'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(text, X + W / 2, 163)
  }
  pill(80, 360, CLAY, 'Order ahead', '#fff')
  pill(480, 300, CREAM, 'See menu', INK)
  x.fillStyle = SAND
  x.beginPath()
  x.roundRect(80, 280, 700, 200, 22)
  x.fill()
  x.fillStyle = INK
  x.font = '600 40px Georgia'
  x.textAlign = 'left'
  x.fillText('Oat flat white', 120, 350)
  x.font = '30px Arial'
  x.fillStyle = '#6a5d4e'
  x.fillText('Double shot, house oat milk', 120, 405)
  x.fillStyle = CLAY
  x.font = '600 38px Arial'
  x.textAlign = 'right'
  x.fillText('$4.50', 740, 350)
}

const cup: Draw = (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#F2C7A0')
  g.addColorStop(1, CLAY)
  x.fillStyle = g
  x.fillRect(0, 0, w, h)
  x.fillStyle = CREAM
  x.beginPath()
  x.ellipse(w / 2, h * 0.62, 190, 70, 0, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = INK
  x.beginPath()
  x.roundRect(w / 2 - 120, h * 0.3, 240, 210, [0, 0, 60, 60])
  x.fill()
  x.fillStyle = SAND
  x.beginPath()
  x.ellipse(w / 2, h * 0.3, 120, 30, 0, 0, Math.PI * 2)
  x.fill()
  x.strokeStyle = INK
  x.lineWidth = 22
  x.beginPath()
  x.arc(w / 2 + 130, h * 0.42, 48, -1.2, 1.2)
  x.stroke()
}

const wireframe: Draw = (x, w) => {
  x.fillStyle = '#fff'
  x.fillRect(0, 0, w, 680)
  x.strokeStyle = INK
  x.lineWidth = 4
  x.strokeRect(40, 40, w - 80, 90)
  x.fillStyle = SAND
  x.fillRect(40, 160, w - 80, 260)
  x.strokeRect(40, 160, w - 80, 260)
  const col = (w - 80) / 3
  for (let i = 0; i < 3; i++) {
    x.fillStyle = CREAM
    x.fillRect(40 + i * col + (i ? 10 : 0), 450, col - 20, 180)
    x.strokeRect(40 + i * col + (i ? 10 : 0), 450, col - 20, 180)
  }
}

/** A filled-in sample project ("Harbor Café website") so new users can see how a finished brief looks. */
export async function createDemoProject(): Promise<string> {
  const p = await createProject('Harbor Café website (demo)')
  await updateProject(p.id, {
    description: 'A one-page website for a neighborhood coffee shop: menu, opening hours, and pickup pre-orders.',
    audience: 'Locals ordering from their phone on the way in',
    platform: 'both',
  })
  const baskets = await db.baskets.where('projectId').equals(p.id).toArray()
  const B = (slug: string) => baskets.find((b) => b.slug === slug) as Basket
  const note = async (slug: string, text: string, patch: Partial<Item> = {}) => {
    for (const i of await addFromText(B(slug), text)) await updateItem(i.id, patch)
  }
  const image = async (slug: string, file: File, patch: Partial<Item>) => {
    const r = await addImages(B(slug), [file])
    if (r.added[0]) await updateItem(r.added[0].id, patch)
  }

  await note('direction', 'Warm & organic: earth tones, soft corners, hand-drawn touches', { priority: 'rule' })
  await note('direction', 'Feels like a chalkboard menu in a small shop, not a chain')
  await note('direction', 'Glossy gradients or stock photos of latte art', { priority: 'avoid' })

  await image('brand', await picture(logo, 1000, 560, 'logo.png'), { priority: 'rule', note: 'Lowercase serif wordmark with the wave underline' })
  await note('brand', 'Voice: friendly and short, like the barista talking')

  await note('typography', 'Young Serif', { fontRole: 'display', priority: 'rule' })
  await note('typography', 'Karla', { fontRole: 'body' })
  await note('typography', 'Menu prices use tabular figures')

  const palette: [string, Item['colorRole'], Item['priority']][] = [
    [CREAM, 'background', 'inspiration'],
    [INK, 'text', 'inspiration'],
    [CLAY, 'primary', 'rule'],
    ['#7C8B5A', 'secondary', 'inspiration'],
    [SAND, 'surface', 'inspiration'],
  ]
  for (const [hex, colorRole, priority] of palette) await note('color', hex, { colorRole, priority })

  await image('layout', await picture(wireframe, 900, 680, 'layout.png'), { note: 'Single page: header, hero, three menu cards' })
  await note('layout', 'Max width 1100px; 24px gutters on phone')
  await image('components', await picture(components, 860, 560, 'components.png'), { priority: 'rule', note: 'Pill buttons with 2px dark outline; menu cards on the surface color' })
  await image('media', await picture(cup, 900, 640, 'cup.png'), { note: 'Warm, grainy product shots on terracotta' })
  await note('motion', 'Hover: color change only, no movement')
  await note('copy', 'Buttons start with a verb: "Order ahead", "See menu"', { priority: 'rule' })

  for (const s of ['direction', 'brand', 'typography', 'color']) await setBasketStatus(B(s).id, 'done')
  return p.id
}
