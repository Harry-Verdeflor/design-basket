const LIST = `ABeeZee,Abel,Abril Fatface,Acme,Alata,Albert Sans,Alegreya,Alegreya Sans,Alfa Slab One,Alice,Alata,Almarai,Amatic SC,Amiri,Anek Latin,Antic Slab,Anton,Architects Daughter,Archivo,Archivo Black,Archivo Narrow,Arimo,Arvo,Asap,Assistant,Atkinson Hyperlegible,Audiowide,Bad Script,Barlow,Barlow Condensed,Barlow Semi Condensed,Bebas Neue,Be Vietnam Pro,Bitter,Black Ops One,Bodoni Moda,Bree Serif,Bricolage Grotesque,Bungee,Cabin,Cabin Condensed,Caladea,Cantarell,Cardo,Carter One,Catamaran,Caveat,Chakra Petch,Changa,Chivo,Chivo Mono,Cinzel,Comfortaa,Commissioner,Concert One,Cookie,Cormorant,Cormorant Garamond,Courier Prime,Crete Round,Crimson Pro,Crimson Text,Cuprum,DM Mono,DM Sans,DM Serif Display,DM Serif Text,Dancing Script,Darker Grotesque,Dela Gothic One,Didact Gothic,Domine,Dosis,EB Garamond,Eczar,El Messiri,Electrolize,Encode Sans,Encode Sans Condensed,Epilogue,Exo,Exo 2,Fahkwang,Figtree,Fira Code,Fira Mono,Fira Sans,Fira Sans Condensed,Fjalla One,Flamenco,Fraunces,Frank Ruhl Libre,Fredoka,Fredericka the Great,Gabarito,Gelasio,Gentium Book Plus,Geologica,Georama,Gloock,Gothic A1,Gowun Dodum,Grandstander,Great Vibes,Gruppo,Gudea,Hanken Grotesk,Heebo,Hind,Hind Siliguri,Host Grotesk,Hubot Sans,IBM Plex Mono,IBM Plex Sans,IBM Plex Sans Condensed,IBM Plex Serif,Inconsolata,Inder,Indie Flower,Instrument Sans,Instrument Serif,Inter,Inter Tight,Istok Web,Jaldi,JetBrains Mono,Josefin Sans,Josefin Slab,Jost,Judson,Kalam,Kameron,Kanit,Karla,Karma,Katibeh,Kaushan Script,Kreon,Kumbh Sans,Lato,League Gothic,League Spartan,Lekton,Lexend,Lexend Deca,Libre Baskerville,Libre Caslon Text,Libre Franklin,Lilita One,Literata,Lobster,Lobster Two,Lora,Lusitana,Manjari,Manrope,Marcellus,Markazi Text,Marvel,Mate,Maven Pro,Merienda,Merriweather,Merriweather Sans,Michroma,Milonga,Mitr,Monda,Montserrat,Montserrat Alternates,Mukta,Mulish,Museo Moderno,Nanum Gothic,Nanum Myeongjo,Neuton,Newsreader,Noticia Text,Noto Sans,Noto Sans Mono,Noto Sans JP,Noto Sans KR,Noto Sans SC,Noto Serif,Noto Serif JP,Noto Serif Display,Nunito,Nunito Sans,Old Standard TT,Oleo Script,Open Sans,Orbitron,Oswald,Outfit,Overpass,Overpass Mono,Oxygen,PT Mono,PT Sans,PT Sans Caption,PT Sans Narrow,PT Serif,Pacifico,Palanquin,Passion One,Patua One,Paytone One,Permanent Marker,Petrona,Philosopher,Piazzolla,Pixelify Sans,Playfair Display,Playfair Display SC,Plus Jakarta Sans,Poiret One,Poppins,Prata,Press Start 2P,Prompt,Proza Libre,Public Sans,Pueblo,Quattrocento,Quattrocento Sans,Questrial,Quicksand,Radio Canada,Raleway,Rajdhani,Rammetto One,Recursive,Red Hat Display,Red Hat Mono,Red Hat Text,Reem Kufi,Rethink Sans,Righteous,Roboto,Roboto Condensed,Roboto Flex,Roboto Mono,Roboto Serif,Roboto Slab,Rochester,Rokkitt,Rosario,Rowdies,Rubik,Rubik Mono One,Ruda,Russo One,Sacramento,Sahitya,Saira,Saira Condensed,Sarabun,Sarala,Satisfy,Sen,Sora,Source Code Pro,Source Sans 3,Source Sans Pro,Source Serif 4,Source Serif Pro,Space Grotesk,Space Mono,Special Elite,Spectral,Spline Sans,Spline Sans Mono,Staatliches,Stick No Bills,Syne,Tajawal,Teko,Tenor Sans,Tinos,Titillium Web,Trirong,Trocchi,Ubuntu,Ubuntu Condensed,Ubuntu Mono,Unbounded,Unna,Urbanist,Vollkorn,Wix Madefor Display,Wix Madefor Text,Work Sans,Yanone Kaffeesatz,Yantramanav,Yeseva One,Young Serif,Zen Kaku Gothic New,Zen Maru Gothic,Zilla Slab`

const FAMILIES = [...new Set(LIST.split(','))]
const LOOKUP = new Map(FAMILIES.map((f) => [f.toLowerCase(), f]))

export const GOOGLE_FONTS: readonly string[] = FAMILIES

/** Canonical family name if `name` is a known Google Font (case-insensitive), else null. */
export function matchGoogleFont(name: string): string | null {
  return LOOKUP.get(name.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').toLowerCase()) ?? null
}

export function googleFontsUrl(families: string[]): string {
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`).join('&')
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

const loaded = new Set<string>()
/** Inject a <link> for a font so previews render in the real face. Safe to call repeatedly. */
export function ensureFontLoaded(family: string): void {
  if (typeof document === 'undefined' || loaded.has(family)) return
  loaded.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = googleFontsUrl([family])
  document.head.appendChild(link)
}
