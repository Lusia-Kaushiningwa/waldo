// End-to-end API check against a throwaway database.
// Run: npm test
const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'waldo-')), 'test.db');
const app = require('../server');
const scenes = require('../data/targets.json');

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const call = async (p, method = 'GET', body) => {
    const r = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  try {
    const scene = scenes[0];
    const imgs = await call('/api/images');
    assert.equal(imgs.body.length, scenes.length, 'lists all images');

    const g = await call('/api/games', 'POST', { imageId: scene.id });
    assert.equal(g.status, 201);
    assert.equal(g.body.characters.length, 3);
    assert.ok(!JSON.stringify(g.body).includes('"x"'), 'no coordinates leaked at game start');
    const id = g.body.gameId;

    // can't claim a score before finishing
    let r = await call(`/api/games/${id}/score`, 'POST', { name: 'cheater' });
    assert.equal(r.status, 400, 'score before finish rejected');

    // wrong spot
    const [c1, c2, c3] = g.body.characters;
    r = await call(`/api/games/${id}/guess`, 'POST', { characterId: c1.id, x: 0.01, y: 0.01 });
    assert.equal(r.body.correct, false);
    assert.equal(r.body.marker, null, 'no position leaked on a miss');

    // right spot, wrong character
    const norm = (c) => ({ x: c.x / scene.width, y: c.y / scene.height });
    r = await call(`/api/games/${id}/guess`, 'POST', { characterId: c2.id, ...norm(scene.characters[0]) });
    assert.equal(r.body.correct, false, 'right place but wrong character is a miss');

    // right spot, slightly off (within radius) works at any screen size because coords are normalized
    const off = scene.radius * 0.6;
    const hit = (i, dx = 0) => ({ x: (scene.characters[i].x + dx) / scene.width, y: scene.characters[i].y / scene.height });
    r = await call(`/api/games/${id}/guess`, 'POST', { characterId: c1.id, ...hit(0, off) });
    assert.equal(r.body.correct, true);
    assert.ok(r.body.marker);
    assert.equal(r.body.finished, false);

    // just outside the radius fails
    r = await call(`/api/games/${id}/guess`, 'POST', { characterId: c2.id, ...hit(1, scene.radius + 8) });
    assert.equal(r.body.correct, false);

    // invalid input
    r = await call(`/api/games/${id}/guess`, 'POST', { characterId: c2.id, x: 5, y: 0.2 });
    assert.equal(r.status, 400);

    await call(`/api/games/${id}/guess`, 'POST', { characterId: c2.id, ...hit(1) });
    await new Promise((res) => setTimeout(res, 150));
    r = await call(`/api/games/${id}/guess`, 'POST', { characterId: c3.id, ...hit(2) });
    assert.equal(r.body.finished, true);
    assert.ok(r.body.elapsedMs >= 150, 'server-side elapsed time recorded');

    // game is locked after finishing
    r = await call(`/api/games/${id}/guess`, 'POST', { characterId: c3.id, ...hit(2) });
    assert.equal(r.status, 409);

    // submit score; client can't supply its own time
    r = await call(`/api/games/${id}/score`, 'POST', { name: '<b>Ada</b>', timeMs: 1 });
    assert.equal(r.status, 201);
    assert.equal(r.body.name, 'bAda/b');
    assert.ok(r.body.timeMs >= 150);
    assert.equal(r.body.rank, 1);

    // only once
    r = await call(`/api/games/${id}/score`, 'POST', { name: 'again' });
    assert.equal(r.status, 409);

    // second player ranks below a faster time? (they will be slower)
    const g2 = await call('/api/games', 'POST', { imageId: scene.id });
    for (let i = 0; i < 3; i++) {
      r = await call(`/api/games/${g2.body.gameId}/guess`, 'POST', { characterId: g2.body.characters[i].id, ...hit(i) });
    }
    r = await call(`/api/games/${g2.body.gameId}/score`, 'POST', { name: '' });
    assert.equal(r.body.name, 'Anonymous');
    const board = await call(`/api/scores?imageId=${scene.id}`);
    assert.equal(board.body.length, 2);
    assert.ok(board.body[0].time_ms <= board.body[1].time_ms, 'sorted fastest first');

    // resume
    const g3 = await call('/api/games', 'POST', { imageId: scenes[1].id });
    const resumed = await call(`/api/games/${g3.body.gameId}`);
    assert.equal(resumed.body.foundIds.length, 0);

    console.log('All checks passed.');
    process.exitCode = 0;
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
