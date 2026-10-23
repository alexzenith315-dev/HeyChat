# HeyChat: agent notes

Live app: https://crew-feed-hvet.folkapps.com (Vite + React + Tailwind, built as a static bundle).

## Data

The app uses a shared SQLite database hosted by folk. Data one visitor writes is visible to all visitors. Read and write it only through `src/lib/folkdb.js` (`import { query, batch } from './lib/folkdb'`). Always use `?` placeholders with args. Never interpolate user input into SQL.

Tables: users, invites, posts, reactions, comments (schema in `src/lib/db.js`). Do not rename or restructure a table or column without updating every reader. Other tools may read these same tables.

`localStorage` is for per-device preferences only (theme, draft inputs). Anything shared between visitors belongs in the database.

## Design contract

Tokens: canvas `#f6f5f4` (page), `#ffffff` cards, `#e6e6e6` hairlines. Ink `#000000`, secondary `#31302e`, muted `#615d59`, faint `#a39e98`. One structural blue `#0075de` for the Post button, focus ring and active reaction state. Sticker accents: `#ff64c8` (logo), `#62aef0` (avatars), `#1aae39` (open invite), `#dd5b00` (char counter warning). No gradients. Type: Bricolage Grotesque Variable for the wordmark and display headings (`font-display`), DM Sans for body and UI (`font-sans`), IBM Plex Mono for invite codes (`font-mono`). Layout: single centered column, max-width `xl` (36rem), floating pill nav at the bottom on every width.

Simplicity: the composer, the feed, reaction chips with counts, the comment count, and "Load older posts" are visible up front. Comments open inline under a post. The delete control shows only on your own posts and comments (owner sees all). The Invites page is owner-only.

Motion: shared spring `{ type: 'spring', stiffness: 420, damping: 34 }` for panels and pills; `{ stiffness: 500, damping: 26 }` for reaction taps. Reduced motion collapses animations to opacity via `useReducedMotion`.
