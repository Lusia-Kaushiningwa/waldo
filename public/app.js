(() => {
  const $ = (id) => document.getElementById(id);
  const els = {
    picker: $('picker'), sceneList: $('scene-list'), game: $('game'), back: $('back'),
    roster: $('roster'), timer: $('timer'), stage: $('stage'), photo: $('photo'),
    markers: $('markers'), target: $('target'), menu: $('menu'), toast: $('toast'),
    win: $('win'), form: $('score-form'), finalTime: $('final-time'), name: $('name'),
    nameRow: $('name-row'), submit: $('submit-score'), boardWrap: $('board-wrap'),
    rankLine: $('rank-line'), board: $('board'), again: $('again'), toScenes: $('to-scenes'),
  };

  const state = {
    gameId: null, imageId: null, characters: [], found: new Set(),
    clock: null, clockBase: 0, clockStart: 0, busy: false, click: null, finished: false,
  };

  const fmt = (ms) => {
    const t = Math.max(0, ms);
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const d = Math.floor((t % 1000) / 100);
    return `${m}:${String(s).padStart(2, '0')}.${d}`;
  };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, kind) {
    els.toast.textContent = msg;
    els.toast.className = `toast ${kind || ''}`;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), 2200);
  }

  // ---------- picker ----------
  async function showPicker() {
    stopClock();
    closeTarget();
    sessionStorage.removeItem('gameId');
    els.game.hidden = true;
    els.picker.hidden = false;
    els.sceneList.textContent = 'Loading scenes…';
    try {
      const images = await api('/api/images');
      const boards = await Promise.all(images.map((i) => api(`/api/scores?imageId=${i.id}`)));
      els.sceneList.replaceChildren(
        ...images.map((img, i) => {
          const card = document.createElement('article');
          card.className = 'scene-card';
          const thumb = document.createElement('img');
          thumb.src = img.file; thumb.alt = ''; thumb.loading = 'lazy';
          const body = document.createElement('div');
          body.className = 'body';
          const h = document.createElement('h3');
          h.textContent = img.name;
          const ol = document.createElement('ol');
          if (!boards[i].length) {
            ol.style.listStyle = 'none'; ol.style.paddingLeft = '0';
            ol.textContent = 'No scores yet. Be the first!';
          } else {
            boards[i].slice(0, 3).forEach((s) => {
              const li = document.createElement('li');
              const t = document.createElement('span');
              t.textContent = fmt(s.time_ms);
              li.append(t, ` — ${s.name}`);
              ol.append(li);
            });
          }
          const btn = document.createElement('button');
          btn.className = 'btn'; btn.type = 'button'; btn.textContent = 'Play';
          btn.addEventListener('click', () => startGame(img.id));
          body.append(h, ol, btn);
          card.append(thumb, body);
          return card;
        })
      );
    } catch {
      els.sceneList.textContent = 'Could not load scenes. Is the server running?';
    }
  }

  // ---------- game lifecycle ----------
  async function startGame(imageId) {
    const data = await api('/api/games', { method: 'POST', body: { imageId } });
    sessionStorage.setItem('gameId', data.gameId);
    enterGame({ ...data, foundIds: [], markers: [], elapsedMs: 0, finished: false });
  }

  function enterGame(data) {
    state.gameId = data.gameId;
    state.imageId = data.image.id;
    state.characters = data.characters;
    state.found = new Set(data.foundIds);
    state.finished = data.finished;
    state.busy = false;

    els.markers.replaceChildren();
    els.photo.alt = `${data.image.name}: a crowded scene. Find ${data.characters.map((c) => c.name).join(', ')}.`;
    els.photo.src = data.image.file;
    els.picker.hidden = true;
    els.game.hidden = false;
    closeTarget();
    renderRoster();
    data.markers.forEach(addMarker);
    window.scrollTo(0, 0);

    // The real clock lives on the server; this one is only for display.
    startClock(data.elapsedMs);
    if (data.finished) stopClock(data.elapsedMs);
  }

  function renderRoster() {
    els.roster.replaceChildren(
      ...state.characters.map((c) => {
        const li = document.createElement('li');
        li.textContent = c.name;
        if (state.found.has(c.id)) li.classList.add('found');
        return li;
      })
    );
  }

  function startClock(baseMs) {
    stopClock();
    state.clockBase = baseMs;
    state.clockStart = performance.now();
    const tick = () => (els.timer.textContent = fmt(state.clockBase + performance.now() - state.clockStart));
    tick();
    state.clock = setInterval(tick, 100);
  }
  function stopClock(finalMs) {
    clearInterval(state.clock);
    state.clock = null;
    if (finalMs != null) els.timer.textContent = fmt(finalMs);
  }

  // ---------- targeting box ----------
  function closeTarget() {
    els.target.hidden = true;
    state.click = null;
  }

  els.stage.addEventListener('click', (e) => {
    if (state.busy || state.finished) return;
    if (e.target.closest('#target')) return; // clicks inside the box/menu are handled by the menu

    const rect = els.photo.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // normalize: 0..1 of the displayed image, so any screen size maps to the same spot
    state.click = { x: px / rect.width, y: py / rect.height };

    const remaining = state.characters.filter((c) => !state.found.has(c.id));
    els.menu.replaceChildren(
      ...remaining.map((c) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = c.name;
        b.addEventListener('click', () => guess(c));
        li.append(b);
        return li;
      })
    );

    els.target.style.left = `${px}px`;
    els.target.style.top = `${py}px`;
    els.target.classList.toggle('flip-x', px > rect.width - 240);
    els.target.classList.toggle('flip-y', py > rect.height - 140 && rect.height > 300);
    els.target.hidden = false;
    els.menu.querySelector('button')?.focus({ preventScroll: true });
  });

  // click away (outside the stage) or Esc closes the box
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#stage')) closeTarget();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTarget();
  });

  async function guess(character) {
    if (!state.click || state.busy) return;
    const { x, y } = state.click;
    state.busy = true;
    closeTarget();
    try {
      const r = await api(`/api/games/${state.gameId}/guess`, {
        method: 'POST',
        body: { characterId: character.id, x, y },
      });
      if (r.correct) {
        state.found = new Set(r.foundIds);
        addMarker({ id: character.id, name: character.name, ...r.marker });
        renderRoster();
        toast(`You found ${character.name}!`, 'good');
        if (r.finished) finish(r.elapsedMs);
      } else {
        toast(`That's not ${character.name}. Try again!`, 'bad');
      }
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      state.busy = false;
    }
  }

  function addMarker(m) {
    const d = document.createElement('div');
    d.className = 'marker';
    d.style.left = `${m.x * 100}%`;
    d.style.top = `${m.y * 100}%`;
    const label = document.createElement('span');
    label.textContent = m.name;
    d.append(label);
    els.markers.append(d);
  }

  // ---------- finish / score ----------
  function finish(elapsedMs) {
    state.finished = true;
    stopClock(elapsedMs);
    els.finalTime.textContent = fmt(elapsedMs);
    els.nameRow.hidden = false;
    els.submit.hidden = false;
    els.boardWrap.hidden = true;
    els.again.hidden = true;
    els.toScenes.hidden = true;
    els.name.value = localStorage.getItem('playerName') || '';
    setTimeout(() => {
      els.win.showModal();
      els.name.focus();
    }, 700);
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.submit.disabled = true;
    try {
      const name = els.name.value.trim();
      localStorage.setItem('playerName', name);
      const r = await api(`/api/games/${state.gameId}/score`, { method: 'POST', body: { name } });
      sessionStorage.removeItem('gameId');
      els.nameRow.hidden = true;
      els.submit.hidden = true;
      els.rankLine.textContent = `You placed #${r.rank} on this scene.`;
      els.board.replaceChildren(
        ...r.scores.map((s) => {
          const li = document.createElement('li');
          const n = document.createElement('span');
          n.textContent = s.name;
          const t = document.createElement('span');
          t.className = 't'; t.textContent = fmt(s.time_ms);
          li.append(n, t);
          if (s.name === r.name && s.time_ms === r.timeMs) li.classList.add('me');
          return li;
        })
      );
      els.boardWrap.hidden = false;
      els.again.hidden = false;
      els.toScenes.hidden = false;
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      els.submit.disabled = false;
    }
  });

  els.again.addEventListener('click', () => { els.win.close(); startGame(state.imageId); });
  els.toScenes.addEventListener('click', () => { els.win.close(); showPicker(); });
  els.back.addEventListener('click', showPicker);

  // ---------- boot (resume an in-progress game after refresh) ----------
  (async function boot() {
    const saved = sessionStorage.getItem('gameId');
    if (saved) {
      try {
        const data = await api(`/api/games/${saved}`);
        if (!data.finished) return enterGame(data);
      } catch { /* fall through */ }
      sessionStorage.removeItem('gameId');
    }
    showPicker();
  })();
})();
