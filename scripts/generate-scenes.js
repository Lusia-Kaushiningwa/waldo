// Generates original, busy "find the characters" scenes as SVG, plus the
// pixel positions of the hidden characters (data/targets.json).
// Run: node scripts/generate-scenes.js
const fs = require('fs');
const path = require('path');

const W = 1600;
const H = 1000;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const f = (n) => Math.round(n * 10) / 10;

// ---- figure drawers (origin = figure centre, base height ~44px) ----
function person(cx, cy, s, c) {
  const h = 44 * s;
  const top = cy - h / 2;
  return `<g>
    <rect x="${f(cx - 7 * s)}" y="${f(cy + 6 * s)}" width="${f(5 * s)}" height="${f(16 * s)}" fill="${c.legs}"/>
    <rect x="${f(cx + 2 * s)}" y="${f(cy + 6 * s)}" width="${f(5 * s)}" height="${f(16 * s)}" fill="${c.legs}"/>
    <rect x="${f(cx - 10 * s)}" y="${f(top + 14 * s)}" width="${f(20 * s)}" height="${f(20 * s)}" rx="${f(5 * s)}" fill="${c.shirt}"/>
    <circle cx="${f(cx)}" cy="${f(top + 8 * s)}" r="${f(8 * s)}" fill="${c.skin}"/>
    ${c.hat ? `<rect x="${f(cx - 9 * s)}" y="${f(top - 1 * s)}" width="${f(18 * s)}" height="${f(5 * s)}" rx="${f(2 * s)}" fill="${c.hat}"/>` : ''}
  </g>`;
}

function penguin(cx, cy, s, hat) {
  return `<g>
    <ellipse cx="${f(cx)}" cy="${f(cy + 2 * s)}" rx="${f(11 * s)}" ry="${f(17 * s)}" fill="#1d2433"/>
    <ellipse cx="${f(cx)}" cy="${f(cy + 5 * s)}" rx="${f(7 * s)}" ry="${f(12 * s)}" fill="#f5f5f0"/>
    <circle cx="${f(cx - 3.5 * s)}" cy="${f(cy - 9 * s)}" r="${f(1.7 * s)}" fill="#fff"/>
    <circle cx="${f(cx + 3.5 * s)}" cy="${f(cy - 9 * s)}" r="${f(1.7 * s)}" fill="#fff"/>
    <polygon points="${f(cx - 3 * s)},${f(cy - 6 * s)} ${f(cx + 3 * s)},${f(cy - 6 * s)} ${f(cx)},${f(cy - 2 * s)}" fill="#f29a2e"/>
    <rect x="${f(cx - 8 * s)}" y="${f(cy + 17 * s)}" width="${f(6 * s)}" height="${f(3 * s)}" fill="#f29a2e"/>
    <rect x="${f(cx + 2 * s)}" y="${f(cy + 17 * s)}" width="${f(6 * s)}" height="${f(3 * s)}" fill="#f29a2e"/>
    ${hat ? `<rect x="${f(cx - 7 * s)}" y="${f(cy - 25 * s)}" width="${f(14 * s)}" height="${f(9 * s)}" fill="${hat}"/><rect x="${f(cx - 10 * s)}" y="${f(cy - 17 * s)}" width="${f(20 * s)}" height="${f(3 * s)}" fill="${hat}"/>` : ''}
  </g>`;
}

function alien(cx, cy, s, skin, antennae) {
  return `<g>
    ${antennae ? `<line x1="${f(cx - 4 * s)}" y1="${f(cy - 14 * s)}" x2="${f(cx - 8 * s)}" y2="${f(cy - 24 * s)}" stroke="${skin}" stroke-width="${f(2 * s)}"/><circle cx="${f(cx - 8 * s)}" cy="${f(cy - 25 * s)}" r="${f(2.4 * s)}" fill="${skin}"/>
    <line x1="${f(cx + 4 * s)}" y1="${f(cy - 14 * s)}" x2="${f(cx + 8 * s)}" y2="${f(cy - 24 * s)}" stroke="${skin}" stroke-width="${f(2 * s)}"/><circle cx="${f(cx + 8 * s)}" cy="${f(cy - 25 * s)}" r="${f(2.4 * s)}" fill="${skin}"/>` : ''}
    <rect x="${f(cx - 6 * s)}" y="${f(cy + 2 * s)}" width="${f(12 * s)}" height="${f(16 * s)}" rx="${f(4 * s)}" fill="${skin}"/>
    <ellipse cx="${f(cx)}" cy="${f(cy - 6 * s)}" rx="${f(11 * s)}" ry="${f(10 * s)}" fill="${skin}"/>
    <ellipse cx="${f(cx - 4.5 * s)}" cy="${f(cy - 6 * s)}" rx="${f(2.6 * s)}" ry="${f(3.8 * s)}" fill="#0b0b12"/>
    <ellipse cx="${f(cx + 4.5 * s)}" cy="${f(cy - 6 * s)}" rx="${f(2.6 * s)}" ry="${f(3.8 * s)}" fill="#0b0b12"/>
  </g>`;
}

function pirate(cx, cy, s, patch, hatColor) {
  const base = person(cx, cy, s, { legs: '#3b3b4f', shirt: '#b8433a', skin: '#e8b98a', hat: null });
  const top = cy - 22 * s;
  return `${base}
    <polygon points="${f(cx - 11 * s)},${f(top + 3 * s)} ${f(cx + 11 * s)},${f(top + 3 * s)} ${f(cx)},${f(top - 8 * s)}" fill="${hatColor}"/>
    ${patch ? `<circle cx="${f(cx + 3 * s)}" cy="${f(top + 8 * s)}" r="${f(2.6 * s)}" fill="#111"/><line x1="${f(cx - 8 * s)}" y1="${f(top + 5 * s)}" x2="${f(cx + 8 * s)}" y2="${f(top + 8 * s)}" stroke="#111" stroke-width="${f(0.9 * s)}"/>` : ''}`;
}

const SKINS = ['#f2c9a0', '#e0a878', '#c68642', '#8d5524', '#f7d7b5'];
const SHIRTS = ['#d94f4f', '#3f7cc4', '#e8c547', '#52a16b', '#8e5bb5', '#e07a3b', '#4fb3b3', '#d86aa0', '#6b7280'];
const LEGS = ['#2f3a56', '#3b3b4f', '#5a4632', '#2b5c4a', '#444'];
const HATS = [null, null, '#c9453a', '#2f6fb5', '#e9c13a', '#3c9a64'];

const THEMES = [
  {
    id: 'beach-day',
    name: 'Beach Day',
    seed: 1337,
    sky: ['#9bdcf5', '#d9f3fa'],
    ground: '#f1dfa7',
    ground2: '#e5cd8a',
    clutter: ['#ffffff', '#ff8a65', '#4db6ac', '#ffd54f', '#f06292', '#7986cb'],
    extra: 'waves',
  },
  {
    id: 'night-market',
    name: 'Night Market',
    seed: 90210,
    sky: ['#1b1b3a', '#43386b'],
    ground: '#3a3350',
    ground2: '#2f2a44',
    clutter: ['#ffca28', '#ef5350', '#26c6da', '#ab47bc', '#9ccc65', '#ff7043'],
    extra: 'lanterns',
  },
];

const TARGETS = [
  { key: 'penguin', name: 'Pip the Penguin' },
  { key: 'alien', name: 'Zog the Alien' },
  { key: 'pirate', name: 'Captain Patch' },
];

function buildScene(theme) {
  const r = rng(theme.seed);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  out.push(`<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.sky[0]}"/><stop offset="1" stop-color="${theme.sky[1]}"/></linearGradient></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);
  out.push(`<rect y="${H * 0.28}" width="${W}" height="${H * 0.72}" fill="${theme.ground}"/>`);
  for (let i = 0; i < 14; i++) {
    out.push(`<ellipse cx="${f(r() * W)}" cy="${f(H * 0.3 + r() * H * 0.7)}" rx="${f(60 + r() * 140)}" ry="${f(10 + r() * 22)}" fill="${theme.ground2}" opacity="0.6"/>`);
  }
  if (theme.extra === 'waves') {
    for (let i = 0; i < 6; i++) {
      const y = 20 + i * 30;
      out.push(`<path d="M0 ${y} ${Array.from({ length: 16 }, (_, k) => `Q ${k * 100 + 50} ${y - 14} ${k * 100 + 100} ${y}`).join(' ')}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/>`);
    }
  } else {
    for (let i = 0; i < 40; i++) {
      out.push(`<circle cx="${f(r() * W)}" cy="${f(r() * H * 0.3)}" r="${f(1 + r() * 2)}" fill="#fff" opacity="${f(0.4 + r() * 0.5)}"/>`);
    }
    for (let i = 0; i < 22; i++) {
      const x = r() * W;
      const y = H * 0.12 + r() * H * 0.5;
      out.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="12" fill="${pick(r, theme.clutter)}" opacity="0.8"/>`);
    }
  }
  // stalls / umbrellas / clutter
  for (let i = 0; i < 26; i++) {
    const x = 30 + r() * (W - 60);
    const y = H * 0.3 + r() * H * 0.65;
    const c1 = pick(r, theme.clutter);
    const c2 = pick(r, theme.clutter);
    const w = 50 + r() * 70;
    out.push(`<g opacity="0.9"><rect x="${f(x - w / 2)}" y="${f(y)}" width="${f(w)}" height="${f(w * 0.5)}" fill="${c2}" opacity="0.55"/><polygon points="${f(x - w / 2 - 6)},${f(y)} ${f(x + w / 2 + 6)},${f(y)} ${f(x)},${f(y - w * 0.35)}" fill="${c1}"/></g>`);
  }

  // hidden targets: fixed spread, away from edges, jittered by seed
  const spots = [
    [0.12 + r() * 0.2, 0.45 + r() * 0.4],
    [0.4 + r() * 0.2, 0.35 + r() * 0.5],
    [0.7 + r() * 0.2, 0.5 + r() * 0.4],
  ].sort(() => r() - 0.5);
  const targetPos = TARGETS.map((t, i) => ({
    ...t,
    x: Math.round(spots[i][0] * W),
    y: Math.round(spots[i][1] * H),
  }));

  // crowd of look-alike decoys
  const decoys = [];
  const count = 330;
  for (let i = 0; i < count; i++) {
    const x = 25 + r() * (W - 50);
    const y = 60 + r() * (H - 90);
    // keep decoys from sitting right on top of targets
    if (targetPos.some((t) => Math.hypot(t.x - x, t.y - y) < 22)) continue;
    const s = 0.75 + r() * 0.5;
    const roll = r();
    let svg;
    if (roll < 0.12) svg = penguin(x, y, s * 0.9, r() < 0.3 ? null : null); // plain penguins (no hat)
    else if (roll < 0.22) svg = alien(x, y, s * 0.9, pick(r, ['#8e5bb5', '#e07a8a', '#4fb3d9', '#c9b037']), r() < 0.5);
    else if (roll < 0.3) svg = pirate(x, y, s, false, pick(r, ['#222', '#555']));
    else svg = person(x, y, s, { legs: pick(r, LEGS), shirt: pick(r, SHIRTS), skin: pick(r, SKINS), hat: pick(r, HATS) });
    decoys.push({ y, svg });
  }
  // draw back-to-front, insert targets in depth order too
  const items = decoys.map((d) => ({ y: d.y, svg: d.svg }));
  for (const t of targetPos) {
    let svg;
    if (t.key === 'penguin') svg = penguin(t.x, t.y, 0.9, '#c9453a');
    if (t.key === 'alien') svg = alien(t.x, t.y, 0.9, '#5ccf6a', true);
    if (t.key === 'pirate') svg = pirate(t.x, t.y, 1, true, '#111');
    items.push({ y: t.y, svg });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) out.push(it.svg);
  out.push('</svg>');
  return { svg: out.join('\n'), targets: targetPos };
}

const outDir = path.join(__dirname, '..', 'public', 'scenes');
fs.mkdirSync(outDir, { recursive: true });
const manifest = [];
for (const theme of THEMES) {
  const { svg, targets } = buildScene(theme);
  fs.writeFileSync(path.join(outDir, `${theme.id}.svg`), svg);
  manifest.push({
    id: theme.id,
    name: theme.name,
    file: `/scenes/${theme.id}.svg`,
    width: W,
    height: H,
    // hit radius in image pixels (generous but still needs a careful click)
    radius: 32,
    characters: targets.map((t) => ({ name: t.name, x: t.x, y: t.y })),
  });
}
fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'targets.json'), JSON.stringify(manifest, null, 2));
console.log(`Generated ${manifest.length} scenes.`);
