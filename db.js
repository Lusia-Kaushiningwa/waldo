// Uses Node's built-in SQLite (Node 22.13+), so there is nothing native to compile.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'waldo.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    file   TEXT NOT NULL,
    width  INTEGER NOT NULL,
    height INTEGER NOT NULL,
    radius REAL NOT NULL            -- hit radius in image pixels
  );

  CREATE TABLE IF NOT EXISTS characters (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    x        REAL NOT NULL,         -- pixel position in the full-size image
    y        REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id          TEXT PRIMARY KEY,   -- random token held by the anonymous player
    image_id    TEXT NOT NULL REFERENCES images(id),
    started_at  INTEGER NOT NULL,   -- ms epoch, set by the server
    finished_at INTEGER,
    submitted   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS found (
    game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    PRIMARY KEY (game_id, character_id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id   TEXT NOT NULL REFERENCES images(id),
    name       TEXT NOT NULL,
    time_ms    INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_image_time ON scores(image_id, time_ms);
`);

// Seed (or re-sync) images + character positions from data/targets.json
function seed() {
  const file = path.join(__dirname, 'data', 'targets.json');
  if (!fs.existsSync(file)) {
    throw new Error('data/targets.json missing. Run: npm run scenes');
  }
  const scenes = JSON.parse(fs.readFileSync(file, 'utf8'));
  const upsertImage = db.prepare(`
    INSERT INTO images (id, name, file, width, height, radius)
    VALUES (@id, @name, @file, @width, @height, @radius)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, file=excluded.file, width=excluded.width,
      height=excluded.height, radius=excluded.radius`);
  const delChars = db.prepare('DELETE FROM characters WHERE image_id = ?');
  const insChar = db.prepare('INSERT INTO characters (image_id, name, x, y) VALUES (?, ?, ?, ?)');

  db.exec('BEGIN');
  try {
    for (const s of scenes) {
      // only re-write characters if they changed, so in-progress game ids stay valid
      const existing = db
        .prepare('SELECT name, x, y FROM characters WHERE image_id = ? ORDER BY id')
        .all(s.id);
      const same =
        existing.length === s.characters.length &&
        existing.every((c, i) => c.name === s.characters[i].name && c.x === s.characters[i].x && c.y === s.characters[i].y);
      upsertImage.run({ id: s.id, name: s.name, file: s.file, width: s.width, height: s.height, radius: s.radius });
      if (!same) {
        db.prepare('DELETE FROM found WHERE character_id IN (SELECT id FROM characters WHERE image_id = ?)').run(s.id);
        delChars.run(s.id);
        for (const c of s.characters) insChar.run(s.id, c.name, c.x, c.y);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

seed();

module.exports = db;
