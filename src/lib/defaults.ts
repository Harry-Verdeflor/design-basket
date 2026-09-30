export interface DefaultBasket {
  slug: string
  label: string
  hint: string
  color: string
  motionDefault: string
}

export const DEFAULT_BASKETS: DefaultBasket[] = [
  { slug: 'direction', label: 'Overall Direction', hint: 'The mood: minimalist, editorial, playful…', color: '#F9C74F', motionDefault: 'Choose a restrained, coherent direction and state it.' },
  { slug: 'brand', label: 'Brand & Identity', hint: 'Logos, wordmarks, favicons, brand voice', color: '#F25F5C', motionDefault: 'Use a simple wordmark and the colors from the Color section; do not invent a logo.' },
  { slug: 'typography', label: 'Typography', hint: 'Fonts, pairings, type scale, heading styles', color: '#2A9BD8', motionDefault: 'Use a readable sans-serif for body text and a clear type scale.' },
  { slug: 'color', label: 'Color', hint: 'Palettes, hex codes, light/dark mode', color: '#F9844A', motionDefault: 'Pick a restrained palette consistent with Overall Direction; ensure WCAG AA contrast.' },
  { slug: 'layout', label: 'Layout & Spacing', hint: 'Grids, margins, whitespace, breakpoints', color: '#43AA8B', motionDefault: 'Use a 4/8px spacing scale, a 12-column grid and mobile-first breakpoints.' },
  { slug: 'shapes', label: 'Shapes & Surfaces', hint: 'Radius, borders, shadows, cards, glass', color: '#9B7BE8', motionDefault: 'Use consistent corner radii and subtle shadows.' },
  { slug: 'icons', label: 'Icons & Graphics', hint: 'Icon style, illustrations, patterns', color: '#F17FB5', motionDefault: 'Use a single consistent icon set (e.g. Lucide) at one stroke weight.' },
  { slug: 'components', label: 'Components', hint: 'Buttons, inputs, cards, modals, tables', color: '#3EC5E8', motionDefault: 'Build standard accessible components with clear hover, focus and disabled states.' },
  { slug: 'navigation', label: 'Navigation', hint: 'Navbar, sidebar, tabs, footer', color: '#90BE6D', motionDefault: 'Use a simple top navigation that collapses on mobile.' },
  { slug: 'media', label: 'Images & Media', hint: 'Photo style, crops, hero images, video', color: '#F8A13A', motionDefault: 'Use a consistent crop and aspect ratio; always provide alt text.' },
  { slug: 'motion', label: 'Motion', hint: 'Transitions, easing, hover, micro-interactions', color: '#4DB6A9', motionDefault: 'use subtle, fast transitions (150–250ms) and respect prefers-reduced-motion.' },
  { slug: 'copy', label: 'UX Writing', hint: 'Headlines, button text, errors, empty states', color: '#8FA8C8', motionDefault: 'Write short, plain, friendly copy; verbs on buttons; helpful error messages.' },
]

/** Tab colors used before the folder redesign, keyed by slug, so old projects can be recolored. */
export const LEGACY_COLORS: Record<string, string> = {
  brand: '#B5533C', typography: '#7A6A9B', color: '#C58B2B', layout: '#5C8A6B', shapes: '#4E8593', icons: '#A2607F',
  components: '#8C7253', navigation: '#6B7FA6', media: '#9A7B3A', motion: '#6E9A7E', copy: '#B0705A', direction: '#5E5E6E',
}

export function defaultFor(slug: string): DefaultBasket | undefined {
  return DEFAULT_BASKETS.find((b) => b.slug === slug)
}
