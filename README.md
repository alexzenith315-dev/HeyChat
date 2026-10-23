# HeyChat

A small friends-only social feed. Members sign up with an invite code, post short updates (280 characters), react with emoji, comment, and delete their own content. The owner (first account) can generate single-use invite codes.

Live version: https://crew-feed-hvet.folkapps.com

## Features

- Sign up with a display name, password, and invite code. The first account becomes the owner.
- Log in with name and password.
- Shared feed, newest first, with "Load older posts" paging.
- Emoji reactions (🔥 😂 ❤️ 💯). Tap again to remove yours.
- Comments under each post.
- Authors can delete their own posts and comments. The owner can delete anything.
- Owner-only Invites page to create one-time codes.

## Tech stack

- Vite, React 18, react-router-dom 7
- Tailwind CSS, framer-motion
- Data: a shared SQLite database accessed through `src/lib/folkdb.js`

## Setup

Requirements: Node.js 18 or newer and npm.

```bash
npm install
npm run dev       # local dev server
npm run build     # production build into dist/
npm run preview   # serve the built dist/ locally
```

## Environment variables

None are required for the hosted version. See `.env.example`, which documents this and contains no secrets.

## Important: the backend

The data layer in `src/lib/folkdb.js` posts SQL to `__folkdata/query` on the same origin as the app. That endpoint is provided by the folk hosting platform. Running the build anywhere else will show the UI, but sign-up, login, and the feed will fail with a database error unless you supply a compatible endpoint.

Security note: as deployed, the database endpoint is public, login is not verified server-side (the session is a user id stored in localStorage), and deletion rules are enforced only in the UI. Anyone who can call the endpoint can read, change, or delete data. Before using this for anything sensitive, move authentication and permission checks to a server.

## Project layout

```
src/
  App.jsx              routing, session restore, auth gate
  main.jsx             entry point
  index.css            Tailwind base and tokens
  components/
    Auth.jsx           log in / sign up
    Feed.jsx           composer, feed, paging
    Post.jsx           a post with reactions, comments, delete
    Invites.jsx        owner-only invite codes
  lib/
    folkdb.js          database client (query / batch)
    db.js              schema, auth, feed, reactions, comments, invites
    time.js            relative timestamps
AGENTS.md              notes for agents working on this repo
```

## Notes

Design details are in AGENTS.md. Do not rename database tables or columns without updating the readers.
