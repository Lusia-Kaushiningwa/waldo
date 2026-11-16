const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '5kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- prepared statements ----------
const q = {
  images: db.prepare('SELECT id, name, file, width, height FROM images ORDER BY name'),
  image: db.prepare('SELECT * FROM images WHERE id = ?'),
  chars: db.prepare('SELECT id, name, x, y FROM characters WHERE image_id = ? ORDER BY id'),
  insGame: db.prepare('INSERT INTO games (id, image_id, started_at) VALUES (?, ?, ?)'),
  game: db.prepare('SELECT * FROM games WHERE id = ?'),
  found: db.prepare('SELECT character_id FROM found WHERE game_id = ?'),
  insFound: db.prepare('INSERT OR IGNORE INTO found (game_id, character_id) VALUES (?, ?)'),
  finish: db.prepare('UPDATE games SET finished_at = ? WHERE id = ? AND finished_at IS NULL'),
  markSubmitted: db.prepare('UPDATE games SET submitted = 1 WHERE id = ? AND submitted = 0'),
  insScore: db.prepare('INSERT INTO scores (image_id, name, time_ms, created_at) VALUES (?, ?, ?, ?)'),
  top: db.prepare('SELECT name, time_ms FROM scores WHERE image_id = ? ORDER BY time_ms ASC, id ASC LIMIT ?'),
  rank: db.prepare('SELECT COUNT(*) AS n FROM scores WHERE image_id = ? AND time_ms < ?'),
};

const publicChars = (imageId) => q.chars.all(imageId).map(({ id, name }) => ({ id, name }));

function loadGame(req, res) {
  const game = q.game.get(req.params.id);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return null;
  }
  return game;
}

// ---------- API ----------

// List available images (extra credit: choose a picture)
app.get('/api/images', (_req, res) => {
  res.json(q.images.all());
});

// Start a game. The clock starts NOW, on the server.
app.post('/api/games', (req, res) => {
  const image = q.image.get(String(req.body?.imageId || ''));
  if (!image) return res.status(400).json({ error: 'Unknown image' });

  const id = crypto.randomBytes(16).toString('hex'); // anonymous player token
  const startedAt = Date.now();
  q.insGame.run(id, image.id, startedAt);

  res.status(201).json({
    gameId: id,
    image: { id: image.id, name: image.name, file: image.file, width: image.width, height: image.height },
    characters: publicChars(image.id),
  });
});

// Check a guess. x and y are NORMALIZED (0..1) fractions of the displayed image,
// so every screen size sends equivalent coordinates.
app.post('/api/games/:id/guess', (req, res) => {
  const game = loadGame(req, res);
  if (!game) return;
  if (game.finished_at) return res.status(409).json({ error: 'Game already finished' });

  const { characterId, x, y } = req.body || {};
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isInteger(characterId) || !Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
    return res.status(400).json({ error: 'Invalid guess' });
  }

  const image = q.image.get(game.image_id);
  const character = q.chars.all(game.image_id).find((c) => c.id === characterId);
  if (!character) return res.status(400).json({ error: 'Unknown character' });

  // convert the normalized click back to full-size image pixels, then measure
  const px = nx * image.width;
  const py = ny * image.height;
  const distance = Math.hypot(px - character.x, py - character.y);
  const correct = distance <= image.radius;

  const alreadyFound = new Set(q.found.all(game.id).map((r) => r.character_id));
  const total = q.chars.all(game.image_id).length;
  let finished = false;
  let elapsedMs = null;

  if (correct) {
    q.insFound.run(game.id, character.id);
    alreadyFound.add(character.id);
    if (alreadyFound.size === total) {
      const now = Date.now();
      q.finish.run(now, game.id);
      finished = true;
      elapsedMs = now - game.started_at;
    }
  }

  res.json({
    correct,
    character: { id: character.id, name: character.name },
    // only reveal the position when the guess was right
    marker: correct ? { x: character.x / image.width, y: character.y / image.height } : null,
    foundIds: [...alreadyFound],
    finished,
    elapsedMs,
  });
});

// Submit a name for a finished game. Time is computed server-side.
app.post('/api/games/:id/score', (req, res) => {
  const game = loadGame(req, res);
  if (!game) return;
  if (!game.finished_at) return res.status(400).json({ error: 'Game not finished' });
  if (game.submitted) return res.status(409).json({ error: 'Score already submitted' });

  let name = String(req.body?.name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!name) name = 'Anonymous';

  const timeMs = game.finished_at - game.started_at;
  if (!q.markSubmitted.run(game.id).changes) return res.status(409).json({ error: 'Score already submitted' });
  q.insScore.run(game.image_id, name, timeMs, Date.now());

  const rank = q.rank.get(game.image_id, timeMs).n + 1;
  res.status(201).json({ name, timeMs, rank, scores: q.top.all(game.image_id, 10) });
});

// High scores
app.get('/api/scores', (req, res) => {
  const imageId = String(req.query.imageId || '');
  if (!q.image.get(imageId)) return res.status(400).json({ error: 'Unknown image' });
  res.json(q.top.all(imageId, 10));
});

// Resume info for a game in progress (e.g. page refresh keeps the server clock)
app.get('/api/games/:id', (req, res) => {
  const game = loadGame(req, res);
  if (!game) return;
  const image = q.image.get(game.image_id);
  const foundIds = q.found.all(game.id).map((r) => r.character_id);
  const markers = q
    .chars.all(game.image_id)
    .filter((c) => foundIds.includes(c.id))
    .map((c) => ({ id: c.id, name: c.name, x: c.x / image.width, y: c.y / image.height }));
  res.json({
    gameId: game.id,
    image: { id: image.id, name: image.name, file: image.file, width: image.width, height: image.height },
    characters: publicChars(image.id),
    foundIds,
    markers,
    elapsedMs: (game.finished_at || Date.now()) - game.started_at,
    finished: !!game.finished_at,
    submitted: !!game.submitted,
  });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Where's Waldo-style game on http://localhost:${PORT}`));
}
module.exports = app;
