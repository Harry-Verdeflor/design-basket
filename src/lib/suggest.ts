import type { ColorRole, FontRole, Item } from '../types'

export type Mood = 'minimal' | 'editorial' | 'playful' | 'brutalist' | 'luxury' | 'tech' | 'organic'

export const MOODS: { id: Mood; label: string; blurb: string }[] = [
  { id: 'minimal', label: 'Minimal', blurb: 'Lots of whitespace, one accent color, no decoration' },
  { id: 'editorial', label: 'Editorial', blurb: 'Magazine layout, big serif headlines, strong grid' },
  { id: 'playful', label: 'Playful', blurb: 'Bright colors, rounded shapes, bouncy motion' },
  { id: 'brutalist', label: 'Brutalist', blurb: 'Raw borders, system fonts, hard shadows, no polish' },
  { id: 'luxury', label: 'Luxury', blurb: 'Dark or cream backgrounds, thin serif, slow fades' },
  { id: 'tech', label: 'Tech / Dev tool', blurb: 'Dark UI, mono accents, dense data, crisp 1px lines' },
  { id: 'organic', label: 'Warm & organic', blurb: 'Earth tones, soft corners, hand-drawn touches' },
]

const KEYWORDS: Record<Mood, string[]> = {
  minimal: ['minimal', 'minimalist', 'clean', 'simple', 'whitespace', 'swiss', 'quiet', 'calm', 'scandinavian'],
  editorial: ['editorial', 'magazine', 'newspaper', 'serif', 'journal', 'publication', 'typographic', 'blog'],
  playful: ['playful', 'fun', 'bright', 'colorful', 'colourful', 'friendly', 'cartoon', 'bouncy', 'kids', 'y2k', 'quirky'],
  brutalist: ['brutalist', 'brutal', 'raw', 'neubrutal', 'neo-brutal', 'harsh', 'anti-design', 'zine'],
  luxury: ['luxury', 'premium', 'elegant', 'high-end', 'fashion', 'boutique', 'refined', 'gold'],
  tech: ['tech', 'saas', 'developer', 'dev tool', 'dashboard', 'terminal', 'dark mode', 'data', 'api', 'fintech', 'finance'],
  organic: ['organic', 'warm', 'natural', 'earthy', 'handmade', 'cozy', 'wellness', 'botanical', 'food', 'craft'],
}

/** Pick the mood the user's own words point to most, or null if nothing matches. */
export function detectMood(text: string): Mood | null {
  const t = ` ${text.toLowerCase()} `
  let best: Mood | null = null
  let bestScore = 0
  for (const m of MOODS) {
    // the style's own name ("editorial") outweighs loose hints ("quiet")
    const score = KEYWORDS[m.id].reduce((n, k, i) => n + (t.includes(k) ? (i === 0 ? 3 : 1) : 0), 0)
    if (score > bestScore) {
      best = m.id
      bestScore = score
    }
  }
  return best
}

export interface Suggestion {
  /** Stable key, also used to hide suggestions already added. */
  key: string
  kind: 'note' | 'color' | 'font'
  note: string
  hex?: string
  colorRole?: ColorRole
  fontFamily?: string
  fontRole?: FontRole
}

const n = (note: string): Suggestion => ({ key: `n:${note.toLowerCase()}`, kind: 'note', note })
const c = (hex: string, colorRole: ColorRole, note = ''): Suggestion => ({ key: `c:${hex}:${colorRole}`, kind: 'color', hex, colorRole, note })
const f = (fontFamily: string, fontRole: FontRole, note = ''): Suggestion => ({ key: `f:${fontFamily}:${fontRole}`, kind: 'font', fontFamily, fontRole, note })

/** Suggestions that fit any project, per basket slug. */
const GENERIC: Record<string, Suggestion[]> = {
  brand: [
    n('Logo works in one color at 16px (favicon size)'),
    n('Wordmark only, no separate symbol'),
    n('Brand voice: plain words, short sentences, no jargon'),
    n('Clear space around the logo equals the height of its first letter'),
  ],
  typography: [
    n('Two families max: one for headings, one for body'),
    n('Body text 16–18px, line height 1.5–1.6'),
    n('Type scale ratio 1.25 (major third)'),
    n('Line length 60–75 characters for long text'),
    n('Numbers use tabular figures in tables and prices'),
  ],
  color: [
    n('One accent color; everything else neutral'),
    n('All text meets WCAG AA contrast (4.5:1)'),
    n('Dark mode uses the same hues, lightened, not inverted'),
    n('Status colors only for status (success, warning, error)'),
  ],
  layout: [
    n('8px spacing scale: 4, 8, 12, 16, 24, 32, 48, 64'),
    n('Max content width 1200px, centered'),
    n('Mobile first; breakpoints at 640, 768, 1024, 1280'),
    n('12-column grid on desktop, 4 columns on mobile'),
    n('Section padding 96px desktop, 48px mobile'),
  ],
  shapes: [
    n('One radius for cards (12px), smaller for inputs (8px)'),
    n('1px borders instead of shadows to separate surfaces'),
    n('Shadows only on floating things: menus, modals, toasts'),
    n('Buttons and inputs share the same height (40px)'),
  ],
  icons: [
    n('One icon set (Lucide), 1.5px stroke, 20px default'),
    n('Icons sit next to a text label; no icon-only buttons except close'),
    n('Illustrations in a flat style using the palette colors'),
  ],
  components: [
    n('Primary button: filled accent; secondary: outline'),
    n('Every control shows hover, focus, active and disabled states'),
    n('Inputs have a visible label above, not placeholder-only'),
    n('Cards: image on top, title, one line of text, one action'),
    n('Tables: sticky header, zebra rows off, right-aligned numbers'),
    n('Empty states: one sentence plus one button'),
  ],
  navigation: [
    n('Top navbar: logo left, 4–6 links center, CTA right'),
    n('Navbar collapses to a menu button under 768px'),
    n('Current page marked with an underline, not only color'),
    n('Footer: 3–4 link columns and a small legal line'),
    n('Sticky navbar that shrinks on scroll'),
  ],
  media: [
    n('Hero image full width, 16:9 on desktop, 4:5 on mobile'),
    n('Real photos of people, natural light, no stock handshakes'),
    n('All images share one crop ratio within a section'),
    n('Lazy-load images below the fold'),
  ],
  motion: [
    n('Transitions 150–250ms, ease-out'),
    n('Hover: color change only, no movement'),
    n('Respect prefers-reduced-motion: disable non-essential motion'),
    n('Page content fades in once; no scroll-triggered animations'),
  ],
  copy: [
    n('Buttons start with a verb: "Start trial", not "Submit"'),
    n('Headlines under 8 words'),
    n('Errors say what happened and how to fix it'),
    n('Sentence case everywhere, no Title Case'),
    n('Address the reader as "you"'),
  ],
  direction: MOODS.map((m) => n(`${m.label}: ${m.blurb}`)),
}

/** Mood-specific suggestions shown before the generic ones. */
const BY_MOOD: Record<Mood, Partial<Record<string, Suggestion[]>>> = {
  minimal: {
    color: [c('#111111', 'text'), c('#FFFFFF', 'background'), c('#F4F4F2', 'surface'), c('#2F5BFF', 'primary', 'the only accent'), c('#8A8A86', 'neutral')],
    typography: [f('Inter', 'body'), f('Inter Tight', 'heading'), f('JetBrains Mono', 'mono')],
    shapes: [n('Radius 6px everywhere; no shadows at all')],
    layout: [n('Generous whitespace: at least 2× the content height between sections')],
    motion: [n('Almost no motion: opacity fades only')],
    copy: [n('Say it in half the words, then cut again')],
  },
  editorial: {
    color: [c('#1A1A1A', 'text'), c('#FBF8F2', 'background'), c('#C8102E', 'accent', 'rules, links and pull quotes'), c('#6B6B6B', 'neutral')],
    typography: [f('Fraunces', 'display', 'large headlines, tight leading'), f('Source Serif 4', 'body'), f('IBM Plex Sans', 'heading', 'labels and captions')],
    layout: [n('Asymmetric grid: text column plus a wide image column'), n('Thin horizontal rules between sections')],
    shapes: [n('Square corners; hairline 1px dividers')],
    copy: [n('Kicker above each headline in small caps')],
    media: [n('Large photos with captions in small italic text')],
  },
  playful: {
    color: [c('#FF5A5F', 'primary'), c('#FFC93C', 'accent'), c('#3DDC97', 'secondary'), c('#FFF6E5', 'background'), c('#1E1B2E', 'text')],
    typography: [f('Fredoka', 'display'), f('Nunito', 'body')],
    shapes: [n('Big radius (20px+) and pill buttons'), n('Hard offset shadow: 4px 4px 0 black')],
    motion: [n('Springy hover: scale 1.04 with a small overshoot'), n('Confetti or a small bounce on success')],
    icons: [n('Chunky filled icons with rounded ends')],
    copy: [n('Friendly and a little cheeky; emoji allowed in empty states')],
  },
  brutalist: {
    color: [c('#000000', 'text'), c('#FFFFFF', 'background'), c('#FFFF00', 'accent'), c('#0000FF', 'primary', 'plain blue links')],
    typography: [f('Space Grotesk', 'display'), f('Space Mono', 'mono'), f('IBM Plex Mono', 'body')],
    shapes: [n('2px black borders, 0 radius'), n('Hard shadows, no blur: 6px 6px 0 #000')],
    layout: [n('Visible grid lines; content can touch edges')],
    motion: [n('No easing: instant state changes')],
    components: [n('Buttons look like raw boxes with uppercase labels')],
  },
  luxury: {
    color: [c('#0E0E0E', 'background'), c('#F3EDE3', 'text'), c('#B89B5E', 'accent', 'gold, used sparingly'), c('#1C1A17', 'surface')],
    typography: [f('Cormorant Garamond', 'display', 'light weight, wide tracking'), f('Jost', 'body')],
    layout: [n('Wide margins; one idea per screen')],
    motion: [n('Slow fades 400–600ms; no bounce')],
    copy: [n('Few words, no exclamation marks, no discounts language')],
    media: [n('Full-bleed product photos on dark backgrounds')],
  },
  tech: {
    color: [c('#0B0D10', 'background'), c('#14171C', 'surface'), c('#E6E8EB', 'text'), c('#6E56CF', 'primary'), c('#3DD68C', 'success'), c('#F5A524', 'warning'), c('#F2555A', 'error')],
    typography: [f('Geologica', 'heading'), f('Inter', 'body'), f('JetBrains Mono', 'mono', 'code, IDs and numbers')],
    shapes: [n('1px borders at 8% white; radius 8px'), n('Subtle inner glow on focused inputs')],
    components: [n('Dense tables with keyboard shortcuts shown in <kbd> chips'), n('Command palette on Cmd/Ctrl+K')],
    navigation: [n('Left sidebar with collapsible sections; top bar for search')],
    motion: [n('Fast 120ms transitions; skeleton loaders for data')],
  },
  organic: {
    color: [c('#F4EDE1', 'background'), c('#3B3024', 'text'), c('#B5653A', 'primary', 'terracotta'), c('#7C8B5A', 'secondary', 'sage'), c('#E7D9C4', 'surface')],
    typography: [f('Young Serif', 'display'), f('Karla', 'body')],
    shapes: [n('Soft 16px radius and paper-like textures'), n('Blob or pebble shapes behind images')],
    icons: [n('Hand-drawn line icons with uneven strokes')],
    media: [n('Warm, grainy photos with natural materials')],
    copy: [n('Warm and personal, like a note from the maker')],
  },
}

/**
 * Suggestions for one basket: mood-specific first, then generic,
 * minus anything the basket already has.
 */
export function suggestFor(slug: string, mood: Mood | null, existing: Item[], limit = 8): Suggestion[] {
  const pool = [...((mood && BY_MOOD[mood][slug]) || []), ...(GENERIC[slug] ?? [])]
  const have = new Set(existing.map(keyOfItem))
  const seen = new Set<string>()
  return pool.filter((s) => !have.has(s.key) && !seen.has(s.key) && seen.add(s.key)).slice(0, limit)
}

export function keyOfItem(i: Item): string {
  if (i.kind === 'color') return `c:${i.hex}:${i.colorRole ?? ''}`
  if (i.kind === 'font') return `f:${i.fontFamily}:${i.fontRole ?? ''}`
  return `n:${i.note.trim().toLowerCase()}`
}

export function hasSuggestions(slug: string): boolean {
  return slug in GENERIC
}
