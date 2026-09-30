# Design gate & decisions

Stack was fixed by the brief (Vite/React/TS, Tailwind, Dexie, JSZip, dnd-kit). The gate below records the
requirements the stack must serve. Scale: **MVP, local-first** (no money/auth, but user data must never be lost silently).

## Why / Who
- Problem: references for a design are scattered; AI coding agents get no precise, prioritised instructions.
- Goal 1: fast collection of references into category baskets. Goal 2: export a pack Claude Code can follow exactly.
- Actor: one local user (no roles, no auth). External systems: none. Boundary = the browser tab + IndexedDB.

## Scope
- In: projects, 12 default + custom baskets, 5 item kinds, priorities/roles, drag/paste/pick, smart parsing,
  Claude pack export, backup export/import, dark mode, storage meter.
- Out: sync, accounts, URL fetching/unfurling, image editing. Future: cloud sync, more token types.

## Key rules (business rules)
- BR1 Priority is exactly one of rule|inspiration|avoid; default inspiration.
- BR2 Tokens come only from items with a role set; never invent values. Rules beat inspirations on conflict;
  avoid items never become tokens.
- BR3 Empty baskets are omitted from DESIGN.md "sections" and listed under "Open questions" with a default.
- BR4 Import never overwrites: always creates a new project with fresh ids.
- BR5 Images are compressed on import (<=1600px, WebP 0.85, JPEG fallback).
- BR6 Every destructive action is undoable (toast) or confirmed (clear basket / delete project).

## Entities & states
Project 1-n Basket 1-n Item; Item n-1 ImageBlob. Items have no lifecycle states beyond exists/deleted;
delete is a soft-hold: the row is removed and kept in memory for the undo window (10s) only.
Basket visibility: visible|hidden (hidden baskets keep items and are still exported).

## Architecture
Pure logic (no I/O) in `src/lib/*` — parse, color, brief/tokens generation, slugs, pack file list — unit tested.
I/O in `src/db.ts` (Dexie), `src/lib/images.ts` (canvas), `src/lib/zip.ts` (JSZip). UI in `src/components/*`.
Business logic (priority defaults, parsing, export rules) lives in `lib`, not in components.
Concurrency: single user, multiple tabs possible -> Dexie `liveQuery` keeps tabs consistent; multi-row writes use transactions.

## Failure handling
- Storage quota/persist denied: surface warning >80%; writes wrapped in try/catch with a visible error toast.
- Bad image / unsupported file: skipped with a toast naming the file.
- Corrupt .basket.zip: validated (manifest version + shape) before any write; import is one transaction.
- Clipboard API unavailable: textarea+execCommand fallback.

## Verification
Vitest for lib (colors, parser, brief generator, tokens, pack structure, backup round-trip with fake-indexeddb).
Manual/browser check for drag/paste/picker. `build`, `lint`, `test` must pass.

## ADRs / small decisions
- Tailwind v4 via `@tailwindcss/vite`; fonts Fraunces + IBM Plex Sans from Google Fonts (link in index.html).
- Linter: oxlint (Vite template default).
- Google Fonts list: bundled ~300 families in `src/lib/fonts.ts`.
- Export references use copies of the stored WebP/JPEG blob; extension follows the blob mime (brief says .webp; JPEG fallback gets .jpg).
- Target audience: stored on Project as optional `audience` (brief section 7 asks for it).
- Backup format `.basket.zip`: `manifest.json` (version 1, project, baskets, items) + `images/<id>.<ext>`.
- Reordering uses fractional-free integer `order`, renumbered on each move.
- Basket has both `id` (uuid, globally unique in IndexedDB) and `slug` (stable, e.g. `typography`, used for folder names
  and default-basket behaviour). The brief's "stable slug id" can't be a primary key across projects.
- Basket gets `hidden: boolean` (rename/reorder/hide requirement).

## Folder stack + Claude mode (2026-10-01)
- Default view is a folder stack: one big folder at a time, the next two peek out behind it, and "Done, next" moves on.
  The old grid stays as "Overview". Basket gains optional `status: todo|done|skipped` (progress only; it never locks editing).
- New projects start with Overall Direction, because the chosen style drives the suggestions in every other folder.
- Dexie v3 recolors default baskets that still use the old muted colors; baskets you recolored yourself keep their color.
- Look: flat stickers with 3px outlines on a peach desk (from the reference image). The folder shuffle (260ms) and the
  drop-target lift are the only motion; both turn off under prefers-reduced-motion.
- Claude mode calls api.anthropic.com straight from the browser with the user's own key (`dangerouslyAllowBrowser`).
  No backend exists, so nothing else ever sees the key. The key lives in localStorage on that device; Settings says so and has "Remove key".
- Default model `claude-sonnet-5-5` (user's choice), Opus 5.5 selectable. Effort `medium`. Structured JSON output.
  `fallbacks: "default"` (server-side-fallback-2026-07-01) handles safety refusals; `stop_reason: refusal` still shows a message.
- Up to 6 folder images go with each request (toggle in Settings). Claude's output is validated client-side:
  hex normalized, fonts matched to Google Fonts, duplicates and already-added items dropped.
- The SDK loads on the first Claude request, so it stays out of the main bundle.
