# Crowd Spotter (photo tagging game)

Node + Express + built-in node:sqlite backend, vanilla JS front end.
Built for The Odin Project's "Where's Waldo" assignment. The scenes and characters are original
(generated SVGs), so there are no copyright concerns.

## Run

```bash
npm install
npm start          # http://localhost:3000
npm test           # API smoke test on a throwaway database
npm run scenes     # (optional) regenerate scenes + data/targets.json
```

Requires Node 22.13 or newer (no native modules to compile).

Environment: `PORT` (default 3000), `DB_PATH` (default `data/waldo.db`).

## How it works

- **Pixel positions in the DB:** `data/targets.json` holds each character's position in full-size image pixels;
  `db.js` seeds it into SQLite (`images`, `characters`).
- **Targeting box:** click the photo, a box and dropdown of the characters you haven't found yet appear.
  Clicking elsewhere or pressing Esc removes it.
- **Screen-size safe:** the client sends the click as a fraction of the displayed image (0..1). The server converts
  it back to full-size pixels and checks the distance to the character against the image's hit radius.
- **Server-side timer:** the clock starts when `POST /api/games` is called and stops when the last character is found.
  The client can't submit its own time, and the name step is only allowed for a finished game, once.
- **Anonymous players:** each game gets a random token (kept in `sessionStorage`) so a refresh resumes the same game and clock.
- **Extra credit:** two scenes to choose from, each with its own high scores.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/images` | List scenes |
| POST | `/api/games` `{imageId}` | Start a game and the server clock |
| POST | `/api/games/:id/guess` `{characterId, x, y}` | Check a guess (x, y normalized 0..1) |
| POST | `/api/games/:id/score` `{name}` | Save the time for a finished game |
| GET | `/api/scores?imageId=` | Top 10 for a scene |
| GET | `/api/games/:id` | Resume state |

## Deploy

Needs a host with a persistent disk for the SQLite file (Render, Railway, Fly.io). Set `DB_PATH` to a path on the
mounted volume. The start command is `npm start`. On hosts with ephemeral disks, swap SQLite for Postgres.
