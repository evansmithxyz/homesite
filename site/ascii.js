// The homepage's background: a koi pond drawn in ASCII characters. Koi wander under a softly moving
// surface and pass beneath lily pads. Moving the pointer drags a wake through the water and startles
// the koi it sweeps past; a click drops a few pellets of food, and the koi come to eat them. Shapes
// are traced in characters: where an outline crosses a cell it picks one of ' - . _ ( ) / \ by the
// outline's slope and where it crosses, so the koi, the pads and the ripples read as drawn lines.
// It all keeps clear of elements marked data-clear, so the heading stays readable. Elements marked
// data-reflect are mirrored in the water under them, and ones marked data-lure draw koi to their
// edge while hovered or focused. The name in the heading unscrambles itself on load. With reduced
// motion, the pond holds still and the name just shows.

const FONT = "ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace";
const WATER = ' .-~'; // the surface, from calm to catching the light
const GLYPHS = '!<>-_\\/[]{}=+*^?#%@&'; // what the name shows while it unscrambles

// Every character is drawn in a style: a color at an opacity
const THEMES = {
  dark: {
    water: '#86a4cc',
    waterAlpha: [0.13, 0.22, 0.34], // for each WATER character after the space
    tints: ['#4fb3a9', '#7db4ff', '#84d272'], // washes of color drifting over the water
    ring: ['#c3d7ff', 0.8],
    mirror: '#e7eaf0', // a reflection, in the heading's color
    mirrorAlpha: [0.4, 0.27, 0.15], // from the waterline down
    leaf: ['#84d272', 0.85], // a lily pad's outline
    lotus: ['#ff9ec4', 0.95],
    food: ['#e6b07a', 0.95],
    koi: ['#ff6a3d', '#f4efe6', '#6b7488', '#ffc247', '#8fb0dd'], // red, white, black, gold, blue
  },
  light: {
    water: '#35598a',
    waterAlpha: [0.1, 0.17, 0.27],
    tints: ['#0f766e', '#1d64c2', '#2f7d32'],
    ring: ['#1d64c2', 0.6],
    mirror: '#1b2230',
    mirrorAlpha: [0.32, 0.21, 0.12],
    leaf: ['#2f7d32', 0.8],
    lotus: ['#d6457f', 0.9],
    food: ['#8a5a2b', 0.9],
    koi: ['#e04a1f', '#9c9384', '#1f2633', '#d9a011', '#4f76ad'],
  },
};
// the styles, by number: the water's first (drawn before the washes of color), then the rest
const RING = 3;
const MIRROR = 4; // + 0, 1 or 2, from the waterline down
const LEAF = 7;
const LOTUS = 8;
const FOOD = 9;
const KOI = 10; // + color * DEPTHS.length + depth
const [RED, WHITE, BLACK, GOLD, BLUE] = [0, 1, 2, 3, 4];
const DEPTHS = [0.95, 0.66, 0.42, 0.24]; // a koi's opacity, from at the surface to deep down

// Where a koi's colors fall: u runs along it (0 at the nose, 1 at the tail), v across it (-1..1)
const VARIETIES = {
  // white, with patches of red
  kohaku: {
    fins: WHITE,
    at: (u, v, f) => (u > 0.05 && u < 0.88 && noise(u * 4.2 + f.seed, v * 0.6) > -0.05 ? RED : WHITE),
  },
  // a kohaku with small spots of black
  sanke: {
    fins: WHITE,
    at: (u, v, f) => (u > 0.2 && noise(u * 9 + f.seed, v * 1.4 + 9) > 0.4 ? BLACK : VARIETIES.kohaku.at(u, v, f)),
  },
  // black, with red and white
  showa: {
    fins: BLACK,
    at: (u, v, f) => {
      if (noise(u * 4 + f.seed, v * 0.7) > 0.12) return RED;
      return noise(u * 5 - f.seed, v * 0.9 + 3) > 0.2 ? WHITE : BLACK;
    },
  },
  // white, with a red crown on its head
  tancho: { fins: WHITE, at: (u, v) => (Math.hypot(u - 0.13, v * 0.14) < 0.08 ? RED : WHITE) },
  // gold all over
  ogon: { fins: GOLD, at: () => GOLD },
  // a blue-gray back over red sides
  asagi: { fins: RED, at: (u, v) => (Math.abs(v) > 0.6 || u > 0.9 ? RED : BLUE) },
};
const SCHOOL = ['kohaku', 'ogon', 'tancho', 'showa', 'sanke', 'asagi', 'kohaku', 'ogon', 'sanke'];

// lily pads, by where they float (as a fraction of the screen), their size, and whether one flowers
const LILIES = [
  [0.06, 0.6, 1, false],
  [0.13, 0.69, 0.62, false],
  [0.92, 0.24, 0.95, true],
  [0.85, 0.15, 0.55, false],
  [0.8, 0.9, 1.1, true],
  [0.32, 0.96, 0.7, false],
];

const SEGS = 10; // a koi's spine, nose to tail
const MAX_BEND = 0.24; // radians between neighboring segments, so a koi curves instead of folding
const PAD = 18; // clear space around data-clear elements, then this much fade back in:
const SOFT = 40;

const canvas = document.getElementById('ascii');
const ctx = canvas.getContext('2d');
const still = matchMedia('(prefers-reduced-motion: reduce)');
const dark = matchMedia('(prefers-color-scheme: dark)');

// ---------- 2D simplex noise, after Stefan Gustavson's public-domain version ----------

const perm = new Uint8Array(512);
{
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const GX = [1, -1, 1, -1, 1, -1, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1, -1];
const F2 = (Math.sqrt(3) - 1) / 2;
const G2 = (3 - Math.sqrt(3)) / 6;

function noise(x, y) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - i + t;
  const y0 = y - j + t;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = 1 - i1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n = 0;
  let a = 0.5 - x0 * x0 - y0 * y0;
  if (a > 0) {
    const g = perm[ii + perm[jj]] & 7;
    a *= a;
    n += a * a * (GX[g] * x0 + GY[g] * y0);
  }
  a = 0.5 - x1 * x1 - y1 * y1;
  if (a > 0) {
    const g = perm[ii + i1 + perm[jj + j1]] & 7;
    a *= a;
    n += a * a * (GX[g] * x1 + GY[g] * y1);
  }
  a = 0.5 - x2 * x2 - y2 * y2;
  if (a > 0) {
    const g = perm[ii + 1 + perm[jj + 1]] & 7;
    a *= a;
    n += a * a * (GX[g] * x2 + GY[g] * y2);
  }
  return 70 * n; // roughly -1..1
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const wrap = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI; // an angle, into -π..π

// ---------- lines in characters ----------

// the stroke that runs closest to the direction (dx, dy): - / | or \, allowing for the cell's shape
function strokeChar(dx, dy) {
  let a = Math.atan2(-dy, dx);
  if (a < 0) a += Math.PI;
  if (a < 0.5 || a > Math.PI - 0.5) return 45; // -
  if (a < 1.25) return 47; // /
  return a < Math.PI - 1.25 ? 124 : 92; // | \
}

// The character for an outline crossing a cell, from the outline's outward normal (nx, ny) and how
// far the cell's center lies outside it: a level stretch by how high in the cell it crosses, a steep
// one by which way it bulges, and a slope by which way it leans
function edgeChar(nx, ny, d) {
  const code = strokeChar(-ny, nx);
  if (code === 45) {
    const y = 0.5 - (d * ny) / ch; // where it crosses, from the top of the cell
    return y < 0.3 ? 39 : y < 0.6 ? 45 : y < 0.78 ? 46 : 95; // ' - . _
  }
  if (code === 124) return nx < 0 ? 40 : 41; // ( )
  return code;
}

// Whether a line at distance d from a cell's center, with normal (nx, ny), is drawn in the cell: a
// steep line in the one cell of each row where it crosses the row's middle, a level one in the one
// cell of each column, so lines come out one character thick
function crosses(nx, ny, d) {
  const across = Math.abs(nx) * cw;
  const down = Math.abs(ny) * ch;
  return Math.abs(d) <= (across > down ? across : down) / 2;
}

// ---------- the pond ----------

let W = 0;
let H = 0;
let cw = 0; // character cell, in px
let ch = 0;
let lift = 0; // how far down its cell a character is drawn, to center it
let cols = 0;
let rows = 0;
let chars = new Uint16Array(0); // per cell: its character,
let looks = new Uint8Array(0); // its style,
let clear = new Float32Array(0); // and how much of the pond shows there (0 right by a data-clear element)
let rowOf = []; // per style, one row of character codes, for drawing a row in one go
let theme = THEMES.dark;
let styles = []; // per style, [color, opacity]
const koi = [];
const lilies = [];
const ripples = [];
const food = [];
const pointer = { x: 0, y: 0, t: 0, on: false, speed: 0, travel: 0 };
const clearings = [...document.querySelectorAll('[data-clear]')];
let boxes = [];
let lure = null; // a data-lure element being hovered or focused: { el, box, koi it draws }

function setTheme() {
  theme = dark.matches ? THEMES.dark : THEMES.light;
  styles = [
    ...theme.waterAlpha.map((a) => [theme.water, a]),
    theme.ring,
    ...theme.mirrorAlpha.map((a) => [theme.mirror, a]),
    theme.leaf,
    theme.lotus,
    theme.food,
  ];
  for (const color of theme.koi) for (const a of DEPTHS) styles.push([color, a]);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const size = W < 600 ? 12 : 14;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fontKerning = 'none';
  cw = ctx.measureText('M').width;
  ch = Math.round(size * 1.3);
  lift = Math.round((ch - size) / 2);
  cols = Math.ceil(W / cw);
  rows = Math.ceil(H / ch);
  chars = new Uint16Array(cols * rows);
  looks = new Uint8Array(cols * rows);
  clear = new Float32Array(cols * rows);
  rowOf = styles.map(() => new Uint16Array(cols));

  const r = Math.min(Math.max(Math.min(W, H) * 0.055, 24), 58);
  lilies.length = 0;
  for (const [fx, fy, scale, flower] of LILIES) {
    const [x, y] = [fx * W, fy * H];
    lilies.push({ ax: x, ay: y, x, y, r: r * scale, angle: Math.random() * 7, flower, seed: Math.random() * 100 });
  }
  if (!koi.length) {
    boxes = clearings.map(textBox);
    const count = Math.min(Math.max(Math.round((W * H) / 200000), 3), 9);
    for (let i = 0; i < count; i++) koi.push(makeKoi(SCHOOL[i % SCHOOL.length]));
  }
}

// the text itself, not its whole block, so a short heading doesn't clear the full width
function textBox(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

// ---------- koi ----------

// half a koi's width at a point along it (0 nose, 1 tail), as a fraction of its length: a round
// head, the widest part just behind it, then a long taper to the tail
function halfWidth(s) {
  if (s < 0.25) return 0.15 * Math.sqrt(1 - ((0.25 - s) / 0.28) ** 2);
  return 0.15 * (1 - 0.8 * ((s - 0.25) / 0.75) ** 1.3);
}

function makeKoi(kind) {
  const len = Math.min(Math.max(Math.min(W, H) * 0.24, 100), 230) * (0.8 + Math.random() * 0.3);
  const f = {
    kind,
    len,
    seg: len / SEGS,
    x: 0,
    y: 0,
    angle: Math.random() * 2 * Math.PI,
    cruise: 20 + Math.random() * 16, // px a second
    speed: 0,
    phase: Math.random() * 7, // of the tail's beat
    seed: Math.random() * 100,
    depth: Math.random() * 0.6,
    fright: 0,
    full: 0, // until when it's still swallowing its last bite
    trail: new Float32Array((SEGS + 1) * 2), // the spine, following the head
    pts: new Float32Array((SEGS + 1) * 2), // and as drawn, swaying
    inv: new Float32Array(SEGS), // 1 / each drawn segment's length
    fins: new Float32Array(8), // each pectoral fin's center and direction (cos, sin)
    tail: [0, 0, 0], // where the tail fin starts, and which way it points
  };
  f.speed = f.cruise;
  // somewhere in the open, away from the heading and the others
  for (let tries = 0; tries < 30; tries++) {
    f.x = W * (0.08 + Math.random() * 0.84);
    f.y = H * (0.1 + Math.random() * 0.8);
    const open = boxes.every((b) => f.x < b.left - 80 || f.x > b.right + 80 || f.y < b.top - 80 || f.y > b.bottom + 80);
    if (open && koi.every((g) => Math.hypot(g.x - f.x, g.y - f.y) > len)) break;
  }
  // laid out along a gentle curve behind the head
  const bend = (Math.random() - 0.5) * 0.24;
  let a = f.angle + Math.PI;
  let x = f.x;
  let y = f.y;
  for (let i = 0; i <= SEGS; i++) {
    f.trail[2 * i] = x;
    f.trail[2 * i + 1] = y;
    x += Math.cos(a) * f.seg;
    y += Math.sin(a) * f.seg;
    a += bend;
  }
  pose(f);
  return f;
}

// the nearest point to (x, y) on the outline of box b grown by m px on every side
function shore(b, x, y, m) {
  const [l, r, t, u] = [b.left - m, b.right + m, b.top - m, b.bottom + m];
  if (x < l || x > r || y < t || y > u) return [Math.min(Math.max(x, l), r), Math.min(Math.max(y, t), u)];
  const near = Math.min(x - l, r - x, y - t, u - y);
  return near === x - l ? [l, y] : near === r - x ? [r, y] : near === y - t ? [x, t] : [x, u];
}

// draws the nearest few koi to an element's edge, while the pointer is on it or it has focus
function setLure(el) {
  const box = el.getBoundingClientRect();
  const away = (f) => {
    const [x, y] = shore(box, f.x, f.y, 0);
    return Math.hypot(x - f.x, y - f.y);
  };
  const nearest = [...koi].sort((a, b) => away(a) - away(b));
  lure = { el, box, koi: new Set(nearest.slice(0, Math.min(5, Math.ceil(koi.length * 0.6)))) };
}

// One koi's steering for a step: a slow wander, kept to the pond and out from under the heading,
// room for the others, a dash for food it can see, over to a lure that draws it, and away from a
// pointer that sweeps past
function swim(f, t, dt) {
  const hx = f.x;
  const hy = f.y;
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const wander = noise(t * 0.12, f.seed) * 1.1;
  let fx = c - s * wander;
  let fy = s + c * wander;

  const m = 100;
  if (hx < m) fx += ((m - hx) / m) * 1.6;
  if (hx > W - m) fx -= ((hx - W + m) / m) * 1.6;
  if (hy < m) fy += ((m - hy) / m) * 1.6;
  if (hy > H - m) fy -= ((hy - H + m) / m) * 1.6;

  for (const g of koi) {
    if (g === f) continue;
    for (let i = 0; i <= SEGS; i += 5) {
      const dx = hx - g.trail[2 * i];
      const dy = hy - g.trail[2 * i + 1];
      const d = Math.hypot(dx, dy);
      const room = (f.len + g.len) * 0.3;
      if (d > 0 && d < room) {
        fx += (dx / d) * (1 - d / room) * 1.2;
        fy += (dy / d) * (1 - d / room) * 1.2;
      }
    }
  }

  let meal = null;
  let mealD = 520;
  for (const p of food) {
    const d = Math.hypot(p.x - hx, p.y - hy);
    if (d < mealD) {
      meal = p;
      mealD = d;
    }
  }
  if (meal) {
    fx += ((meal.x - hx) / mealD) * 3;
    fy += ((meal.y - hy) / mealD) * 3;
    if (mealD < f.len * 0.12 && t > f.full) {
      food.splice(food.indexOf(meal), 1);
      ripple(meal.x, meal.y, 0.4, t);
      f.full = t + 0.7;
    }
  }

  // drawn to a lure, it comes to the water just off the lure's edge, then idles there nosing up to it,
  // as koi gather where someone stands at a pond
  let drawn = false;
  let idle = false;
  if (lure && !meal && lure.koi.has(f)) {
    const [x, y] = shore(lure.box, hx, hy, 30);
    const d = Math.hypot(x - hx, y - hy);
    idle = d < 45;
    drawn = !idle;
    if (drawn) {
      fx += ((x - hx) / d) * 2.2;
      fy += ((y - hy) / d) * 2.2;
    } else {
      const [ex, ey] = shore(lure.box, hx, hy, 0);
      const de = Math.hypot(ex - hx, ey - hy) || 1;
      fx += ((ex - hx) / de) * 1.2;
      fy += ((ey - hy) / de) * 1.2;
    }
  }

  for (const b of boxes) {
    const dx = hx - Math.min(Math.max(hx, b.left), b.right);
    const dy = hy - Math.min(Math.max(hy, b.top), b.bottom);
    const d = Math.hypot(dx, dy);
    if (d < 90) {
      const push = (1 - d / 90) * (meal ? 0.8 : 2.5);
      fx += d ? (dx / d) * push : 0;
      fy += d ? (dy / d) * push : hy < (b.top + b.bottom) / 2 ? -push : push;
    }
  }

  if (pointer.on && pointer.speed > 350) {
    const dx = hx - pointer.x;
    const dy = hy - pointer.y;
    const d = Math.hypot(dx, dy);
    if (d < 150) {
      f.fright = 1;
      fx += (dx / (d || 1)) * 4;
      fy += (dy / (d || 1)) * 4;
    }
  }
  f.fright = Math.max(0, f.fright - dt * 0.7);

  const hurry = meal || f.fright > 0.2;
  const turn = (hurry ? 3.2 : drawn ? 2 : 1.3) * dt;
  const da = wrap(Math.atan2(fy, fx) - f.angle);
  f.angle += Math.max(-turn, Math.min(turn, da));
  const target = f.cruise * (idle ? 0.35 : 1) * (1 + (meal ? 1.4 : drawn ? 0.5 : 0) + f.fright * 2.5);
  f.speed += (target - f.speed) * Math.min(1, dt * 1.5);
  f.x += Math.cos(f.angle) * f.speed * dt;
  f.y += Math.sin(f.angle) * f.speed * dt;
  f.phase += dt * (1.6 + f.speed * 0.07);
  // now and then a koi sinks deeper, fading; it comes up to feed
  const deep = meal ? 0 : clamp01(noise(t * 0.04, f.seed + 40) * 1.5 + 0.15);
  f.depth += (deep - f.depth) * Math.min(1, dt * 0.6);

  // the body follows the head, keeping each bend gentle
  const tr = f.trail;
  tr[0] = f.x;
  tr[1] = f.y;
  let px = f.x;
  let py = f.y;
  let pa = f.angle + Math.PI;
  for (let i = 1; i <= SEGS; i++) {
    let a = Math.atan2(tr[2 * i + 1] - py, tr[2 * i] - px);
    const bend = wrap(a - pa);
    if (bend > MAX_BEND) a = pa + MAX_BEND;
    else if (bend < -MAX_BEND) a = pa - MAX_BEND;
    px += Math.cos(a) * f.seg;
    py += Math.sin(a) * f.seg;
    tr[2 * i] = px;
    tr[2 * i + 1] = py;
    pa = a;
  }
  pose(f);
}

// The spine as drawn: the trail, swaying side to side in a wave that grows toward the tail, and the
// fins that hang off it
function pose(f) {
  const tr = f.trail;
  const p = f.pts;
  const beat = f.len * 0.045 * (0.6 + Math.min(1, f.speed / 80) * 0.8);
  for (let i = 0; i <= SEGS; i++) {
    const s = i / SEGS;
    const j = Math.min(i, SEGS - 1);
    const ex = (tr[2 * j + 2] - tr[2 * j]) / f.seg;
    const ey = (tr[2 * j + 3] - tr[2 * j + 1]) / f.seg;
    const sway = beat * (0.2 + s * s) * Math.sin(f.phase - s * 3.2);
    p[2 * i] = tr[2 * i] + ey * sway;
    p[2 * i + 1] = tr[2 * i + 1] - ex * sway;
  }
  for (let i = 0; i < SEGS; i++) f.inv[i] = 1 / (Math.hypot(p[2 * i + 2] - p[2 * i], p[2 * i + 3] - p[2 * i + 1]) || 1);

  const n = 2 * SEGS;
  f.tail[0] = p[n];
  f.tail[1] = p[n + 1];
  f.tail[2] = Math.atan2(p[n + 1] - p[n - 1], p[n] - p[n - 2]) + Math.sin(f.phase - 4.4) * 0.35;

  // the pectoral fins, just behind the head, sweeping back and out
  const ahead = Math.atan2(p[3] - p[7], p[2] - p[6]);
  const w = f.len * halfWidth(0.2);
  for (let side = 0; side < 2; side++) {
    const sign = side ? 1 : -1;
    const a = ahead + Math.PI - sign * (0.95 + Math.sin(f.phase * 0.6 + side) * 0.18);
    const bx = p[4] - Math.sin(ahead) * w * 0.8 * sign;
    const by = p[5] + Math.cos(ahead) * w * 0.8 * sign;
    f.fins[side * 4] = bx + Math.cos(a) * f.len * 0.07;
    f.fins[side * 4 + 1] = by + Math.sin(a) * f.len * 0.07;
    f.fins[side * 4 + 2] = Math.cos(a);
    f.fins[side * 4 + 3] = Math.sin(a);
  }
}

// set by koiDist, about the point it measured last
let hitU = 0; // where it is along the koi
let hitV = 0; // and across it
let fin = 0; // its distance to the nearest fin,
let finX = 0; // and which way that fin's rays run there
let finY = 0;

// how far a point is from the koi's body: a chain of round segments, each as wide as the koi is there
function koiDist(f, x, y) {
  const p = f.pts;
  let body = Infinity;
  for (let i = 0; i < SEGS; i++) {
    const ax = p[2 * i];
    const ay = p[2 * i + 1];
    const ex = p[2 * i + 2] - ax;
    const ey = p[2 * i + 3] - ay;
    const wx = x - ax;
    const wy = y - ay;
    const inv = f.inv[i];
    const h = clamp01((wx * ex + wy * ey) * inv * inv);
    const dx = wx - ex * h;
    const dy = wy - ey * h;
    const s = (i + h) / SEGS;
    const r = f.len * halfWidth(s);
    const d = Math.sqrt(dx * dx + dy * dy) - r;
    if (d < body) {
      body = d;
      hitU = s;
      hitV = ((ex * dy - ey * dx) * inv) / r;
    }
  }

  // the tail fin: a fan, forked, longer at its edges
  const tx = x - f.tail[0];
  const ty = y - f.tail[1];
  const rho = Math.hypot(tx, ty);
  const spread = Math.abs(wrap(Math.atan2(ty, tx) - f.tail[2]));
  fin = Math.max(rho - f.len * 0.22 * (0.75 + 0.4 * (spread / 0.42)), (spread - 0.42) * rho);
  finX = tx;
  finY = ty;
  // the pectoral fins: long ovals
  for (let k = 0; k < 8; k += 4) {
    const dx = x - f.fins[k];
    const dy = y - f.fins[k + 1];
    const a = (dx * f.fins[k + 2] + dy * f.fins[k + 3]) / (f.len * 0.08);
    const b = (dy * f.fins[k + 2] - dx * f.fins[k + 3]) / (f.len * 0.04);
    const d = (Math.hypot(a, b) - 1) * f.len * 0.04;
    if (d < fin) {
      fin = d;
      finX = f.fins[k + 2];
      finY = f.fins[k + 3];
    }
  }
  near = Math.min(body, fin);
  return body;
}

// The body is outlined, and filled densest down its back; the fins, sheer and ribbed, are strokes
// along their rays
function koiLook(f, i, at) {
  const vis = (1 - 0.7 * f.depth) * clear[i];
  const depth = vis > 0.8 ? 0 : vis > 0.55 ? 1 : vis > 0.33 ? 2 : vis > 0.15 ? 3 : -1;
  if (depth < 0) return -1;
  const kind = VARIETIES[f.kind];
  if (at === OUTSIDE) {
    if (fin > 0) return -1;
    stroke = strokeChar(finX, finY);
    return KOI + kind.fins * DEPTHS.length + Math.min(depth + 1, DEPTHS.length - 1);
  }
  if (at === INSIDE) stroke = Math.abs(hitV) < 0.55 ? 64 : 35; // @ #
  return KOI + kind.at(hitU, hitV, f) * DEPTHS.length + depth;
}

// ---------- lily pads ----------

// how far a point is from a pad: a round leaf, with a narrow notch cut in to its middle
function lilyDist(p, x, y) {
  const dx = x - p.x;
  const dy = y - p.y;
  const rho = Math.hypot(dx, dy);
  near = Math.max(rho - p.r, (0.16 - Math.abs(wrap(Math.atan2(dy, dx) - p.angle))) * rho);
  return near;
}

// the leaf is outlined, and hides the water under it
function lilyLook(i, at) {
  if (at === OUTSIDE || clear[i] < 0.3) return -1;
  if (at === INSIDE) stroke = 32;
  return LEAF;
}

// a lotus flower: petals around a heart
function flowerDist(p, x, y) {
  const dx = x - p.fx;
  const dy = y - p.fy;
  near = Math.hypot(dx, dy) - p.r * 0.42 * (0.65 + 0.35 * Math.abs(Math.cos(2.5 * (Math.atan2(dy, dx) - p.angle))));
  return near;
}

function flowerLook(i, at) {
  if (at === OUTSIDE || clear[i] < 0.3) return -1;
  if (at === INSIDE) stroke = 64; // @
  return LOTUS;
}

// ---------- the water ----------

// The surface at a point, about -1..1: a slow noise bends the coordinates of a second one, so the
// water swirls and flows instead of sliding. It's stretched sideways, so it catches the light in
// long streaks.
function surface(px, py, t) {
  const x = px * 0.004;
  const y = py * 0.01;
  const wx = noise(x * 0.5 + t * 0.02, y * 0.5);
  const wy = noise(x * 0.5 + 7.3, y * 0.5 - t * 0.02);
  return noise(x + wx + t * 0.03, y + wy * 0.6);
}

// a splash spreads three rings, the small ones (the pointer's wake, a koi gulping food) one
function ripple(x, y, strength, t) {
  if (still.matches) return;
  const big = strength > 0.7;
  ripples.push({ x, y, t, strength, rings: big ? 3 : 1, speed: big ? 110 : 60, life: big ? 3 : 1.5 });
  if (ripples.length > 16) ripples.shift();
}

// whether a point is near a ripple's rings, given how far it is from where the ripple started
const touches = (rp, d, t) => Math.abs(d - (t - rp.t) * rp.speed + rp.rings * 11) < rp.rings * 11 + ch;

// how far the swell of the ripples passing a point bends the light through it, in bendX and bendY
let bendX = 0;
let bendY = 0;
function bend(px, py, t) {
  bendX = 0;
  bendY = 0;
  for (const rp of ripples) {
    const dx = px - rp.x;
    const dy = py - rp.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!touches(rp, d, t)) continue;
    const off = d - (t - rp.t) * rp.speed;
    const swell = rp.strength * (1 - (t - rp.t) / rp.life) * Math.exp(-(off * off) / 600) * 14;
    bendX += (dx / d) * swell;
    bendY += (dy / d) * swell;
  }
}

// How much of the pond shows at a point: none right by a data-clear element, fading back in around
// it. `skip` is an element whose own clear space doesn't count.
function clearAt(px, py, skip) {
  let k = 1;
  for (let j = 0; j < boxes.length; j++) {
    if (clearings[j] === skip) continue;
    const b = boxes[j];
    const ox = Math.max(b.left - PAD - px, 0, px - b.right - PAD);
    const oy = Math.max(b.top - PAD - py, 0, py - b.bottom - PAD);
    if (ox < SOFT && oy < SOFT) k *= Math.min(1, Math.hypot(ox, oy) / SOFT);
  }
  return k;
}

// ---------- reflections ----------
// An element marked data-reflect shows in the water under its last line of text: its letters as
// they stand (scrambled too, while the name unscrambles), mirrored at their baseline, each row
// wavering sideways with the surface and bent by the ripples passing through.

const SQUASH = 0.8; // how tall a reflection is, against its letters
const SPILL = 8; // px a letter may overhang its element's box
const mirrors = [...document.querySelectorAll('[data-reflect]')].map((el) => ({ el, key: '', mask: null }));
const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

// Traces the element's last line of letters into a mask of where their ink is (1) and isn't (0),
// from SPILL px left of its box to SPILL right, and from the top of its letters to their baseline.
// It's traced again only when the letters or the box change.
function trace(m, box) {
  const style = getComputedStyle(m.el);
  const key = `${m.el.textContent} ${box.width} ${box.height} ${style.fontSize}`;
  if (key === m.key) return;
  m.key = key;
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ink.font = font;
  // the font's height above the baseline (or, where a browser can't say, its size)
  const ascent = Math.ceil(ink.measureText('M').fontBoundingBoxAscent ?? parseFloat(style.fontSize));
  // each letter where it sits now: its text, and its left and baseline, from the box's top left
  const letters = [];
  const range = document.createRange();
  const walk = document.createTreeWalker(m.el, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    for (let i = 0; i < node.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      letters.push([node.data[i], r.left - box.left, r.top - box.top + ascent]);
    }
  }
  m.mask = null;
  if (!letters.length) return;
  m.base = Math.max(...letters.map((l) => l[2])); // the last line's baseline: the waterline
  m.w = Math.ceil(box.width) + 2 * SPILL;
  m.h = ascent;
  ink.canvas.width = m.w; // (which resets the font)
  ink.canvas.height = m.h;
  ink.font = font;
  for (const [text, x, y] of letters) if (m.base - y < 2) ink.fillText(text, x + SPILL, m.h);
  const data = ink.getImageData(0, 0, m.w, m.h).data;
  m.mask = new Uint8Array(m.w * m.h);
  for (let i = 0; i < m.mask.length; i++) m.mask[i] = data[i * 4 + 3] > 100 ? 1 : 0;
}

// draws a reflection into the cells under the waterline, fainter the deeper it goes
function reflect(m, box, t) {
  trace(m, box);
  if (!m.mask) return;
  const left = box.left - SPILL;
  const line = box.top + m.base;
  const depth = m.h * SQUASH;
  const r0 = Math.max(0, Math.round(line / ch));
  const r1 = Math.min(rows - 1, Math.floor((line + depth) / ch));
  const c0 = Math.max(0, Math.floor(left / cw));
  const c1 = Math.min(cols - 1, Math.floor((left + m.w) / cw));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const px = (c + 0.5) * cw;
      const py = (r + 0.5) * ch;
      const k = clearAt(px, py, m.el); // the heading's own clear space is where its reflection goes
      if (k < 0.3) continue;
      bend(px, py, t);
      // each row sways as one, as the surface tilts under it
      const sway = Math.sin(r * 1.7 - t * 2) * 2 + noise(r * 0.4, t * 0.4) * 4 + bendX;
      // sampled at six points in the cell, in two columns of three
      let lefts = 0;
      let rights = 0;
      for (let s = 0; s < 6; s++) {
        const below = (ch * (2 * Math.floor(s / 2) + 1)) / 6 + r * ch - line;
        const mx = Math.round(c * cw + cw * (s % 2 ? 0.75 : 0.25) + sway - left);
        const my = Math.round(m.h - (below + bendY * 0.5) / SQUASH);
        if (below < 0 || mx < 0 || mx >= m.w || my < 0 || my >= m.h || !m.mask[my * m.w + mx]) continue;
        if (s % 2) rights++;
        else lefts++;
      }
      if (lefts + rights === 0) continue;
      // a letter's upright stroke shows as one, the rest as streaks on the water
      const upright = Math.max(lefts, rights) >= 2 && Math.min(lefts, rights) === 0;
      const code = upright ? 124 : lefts + rights > 3 ? 61 : lefts + rights > 1 ? 45 : 126; // | = - ~
      const fade = (py - line) / depth;
      chars[r * cols + c] = code;
      looks[r * cols + c] = MIRROR + Math.min(2, (fade < 0.35 ? 0 : fade < 0.7 ? 1 : 2) + (k < 0.7 ? 1 : 0));
    }
  }
}

// ---------- drawing ----------

function step(t, dt) {
  for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].t > ripples[i].life) ripples.splice(i, 1);
  for (let i = food.length - 1; i >= 0; i--) {
    const p = food[i];
    // pellets drift a little on the surface, and sink after a while
    p.x += noise(t * 0.2, p.seed) * 6 * dt;
    p.y += noise(p.seed, t * 0.2) * 6 * dt;
    if (t - p.t > 40) food.splice(i, 1);
  }
  pointer.speed *= Math.exp(-dt * 8);
  if (lure) lure.box = lure.el.getBoundingClientRect();
  for (const p of lilies) {
    p.x = p.ax + noise(t * 0.05, p.seed) * 6;
    p.y = p.ay + noise(p.seed, t * 0.05) * 6;
    p.angle += noise(t * 0.03, p.seed + 5) * 0.05 * dt;
  }
  for (const f of koi) swim(f, t, dt);
}

// where a cell lies, for a look
const INSIDE = 0;
const EDGE = 1; // the outline crosses it
const OUTSIDE = 2;
let near = 0; // set by each distance function: how far the point is from anything its shape draws
let stroke = 0; // set by a look: the character to draw, if not the outline's

// Draws a shape into the cells it might touch, from (x0, y0) to (x1, y1) in px. dist(x, y) is the
// distance from a point to the shape's outline (negative inside). look(i, at) is asked about each
// cell nearby, right after its center was measured: it gives the cell's style, or -1 to leave it be,
// and sets `stroke` to the character to draw there; left unset, an EDGE cell shows the outline.
function stamp(x0, y0, x1, y1, dist, look) {
  const c0 = Math.max(0, Math.floor(x0 / cw));
  const c1 = Math.min(cols - 1, Math.floor(x1 / cw));
  const r0 = Math.max(0, Math.floor(y0 / ch));
  const r1 = Math.min(rows - 1, Math.floor(y1 / ch));
  const reach = Math.hypot(cw, ch) / 2;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = (c + 0.5) * cw;
      const y = (r + 0.5) * ch;
      let d = dist(x, y);
      if (near > reach) continue;
      let at = d < 0 ? INSIDE : OUTSIDE;
      let nx = 0;
      let ny = 0;
      if (Math.abs(d) < reach) {
        // the outline's normal, from how the distance to it changes across the center
        nx = dist(x + 1, y) - dist(x - 1, y);
        ny = dist(x, y + 1) - dist(x, y - 1);
        const n = Math.hypot(nx, ny) || 1;
        nx /= n;
        ny /= n;
        d = dist(x, y); // again, so the look reads about the center
        if (crosses(nx, ny, d)) at = EDGE;
      }
      const i = r * cols + c;
      stroke = 0;
      const style = look(i, at);
      if (style < 0) continue;
      const code = stroke || (at === EDGE ? edgeChar(nx, ny, d) : 0);
      if (!code) continue;
      chars[i] = code;
      looks[i] = style;
    }
  }
}

function draw(t) {
  boxes = clearings.map(textBox);

  // the water, with any ripples spreading over it
  for (let r = 0; r < rows; r++) {
    const py = (r + 0.5) * ch;
    for (let c = 0; c < cols; c++) {
      const px = (c + 0.5) * cw;
      const i = r * cols + c;
      const k = clearAt(px, py, null);
      clear[i] = k;
      chars[i] = 32;
      if (k <= 0) continue;

      // a ripple's rings, traced
      let ring = 0;
      let fade = 0;
      for (const rp of ripples) {
        const dx = px - rp.x;
        const dy = py - rp.y;
        const d = Math.hypot(dx, dy) || 1;
        if (!touches(rp, d, t)) continue;
        const radius = (t - rp.t) * rp.speed;
        const strength = rp.strength * (1 - (t - rp.t) / rp.life) * k;
        for (let n = 0; n < rp.rings; n++) {
          const s = d - radius + n * 22;
          if (radius - n * 22 > 4 && strength * (1 - n * 0.3) > fade && crosses(dx / d, dy / d, s)) {
            fade = strength * (1 - n * 0.3);
            ring = edgeChar(dx / d, dy / d, s);
          }
        }
      }
      if (fade > 0.12) {
        chars[i] = ring;
        looks[i] = fade > 0.5 ? RING : fade > 0.25 ? 2 : 1; // a fading ring sinks into the water's styles
        continue;
      }
      // between them, the swell bends the light through the surface
      bend(px, py, t);
      const w = Math.round(clamp01((surface(px + bendX, py + bendY, t) - 0.15) * 1.5 * k) * (WATER.length - 1));
      if (w > 0) {
        chars[i] = WATER.charCodeAt(w);
        looks[i] = w - 1;
      }
    }
  }

  for (const m of mirrors) reflect(m, textBox(m.el), t);

  // the koi, the deepest first, so those nearer the surface pass over them
  for (const f of [...koi].sort((a, b) => b.depth - a.depth)) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i <= SEGS; i++) {
      x0 = Math.min(x0, f.pts[2 * i]);
      x1 = Math.max(x1, f.pts[2 * i]);
      y0 = Math.min(y0, f.pts[2 * i + 1]);
      y1 = Math.max(y1, f.pts[2 * i + 1]);
    }
    const m = f.len * 0.3 + ch; // room for the fins
    stamp(x0 - m, y0 - m, x1 + m, y1 + m, (x, y) => koiDist(f, x, y), (i, at) => koiLook(f, i, at));
  }

  // the lily pads float over them, some flowering
  for (const p of lilies) {
    const m = p.r + ch;
    stamp(p.x - m, p.y - m, p.x + m, p.y + m, (x, y) => lilyDist(p, x, y), lilyLook);
    if (!p.flower) continue;
    p.fx = p.x - Math.cos(p.angle) * p.r * 0.3;
    p.fy = p.y - Math.sin(p.angle) * p.r * 0.3;
    const fm = p.r * 0.42 + ch;
    stamp(p.fx - fm, p.fy - fm, p.fx + fm, p.fy + fm, (x, y) => flowerDist(p, x, y), flowerLook);
  }

  for (const p of food) {
    const c = Math.floor(p.x / cw);
    const r = Math.floor(p.y / ch);
    if (c < 0 || c >= cols || r < 0 || r >= rows || clear[r * cols + c] < 0.3) continue;
    chars[r * cols + c] = 111; // o
    looks[r * cols + c] = FOOD;
  }

  ctx.clearRect(0, 0, W, H);
  paint(0, LEAF);
  // washes of color drift over the water alone, before the koi and pads are drawn on top
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-atop';
  const size = Math.max(W, H) * 0.5;
  theme.tints.forEach((tint, i) => {
    const x = W * (0.5 + 0.45 * Math.sin(t * (0.05 + i * 0.013) + i * 2.1));
    const y = H * (0.5 + 0.45 * Math.cos(t * (0.04 + i * 0.017) + i * 1.3));
    wash(x, y, size, tint, 0.7);
  });
  ctx.globalCompositeOperation = 'source-over';
  paint(LEAF, styles.length);
}

// Draws the cells in styles from..to-1: one string per style and row, as monospace keeps each
// character in its cell
function paint(from, to) {
  for (let r = 0; r < rows; r++) {
    let used = 0;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const s = looks[i];
      if (chars[i] === 32 || s < from || s >= to) continue;
      if (!(used & (1 << (s - from)))) {
        rowOf[s].fill(32);
        used |= 1 << (s - from);
      }
      rowOf[s][c] = chars[i];
    }
    for (let s = from; s < to; s++) {
      if (!(used & (1 << (s - from)))) continue;
      ctx.fillStyle = styles[s][0];
      ctx.globalAlpha = styles[s][1];
      ctx.fillText(String.fromCharCode.apply(null, rowOf[s]), 0, r * ch + lift);
    }
  }
}

// a soft disc of color, fading out over `spread` px
function wash(x, y, spread, color, alpha) {
  const n = parseInt(color.slice(1), 16);
  const rgb = `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
  const g = ctx.createRadialGradient(x, y, 0, x, y, spread);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - spread, y - spread, 2 * spread, 2 * spread);
}

let last = 0;
function loop(now) {
  if (still.matches) return draw(0);
  requestAnimationFrame(loop);
  if (now - last < 12) return; // at most about 60 frames a second, also on faster screens
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  step(now / 1000, dt);
  draw(now / 1000);
}

addEventListener('pointermove', (e) => {
  const t = performance.now() / 1000;
  const moved = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
  if (pointer.on) {
    pointer.speed = Math.max(pointer.speed, moved / Math.max(t - pointer.t, 0.016));
    // the pointer drags a wake: small rings as it goes
    pointer.travel += moved;
    if (pointer.travel > 45) {
      pointer.travel = 0;
      ripple(e.clientX, e.clientY, 0.45, t);
    }
  }
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.t = t;
  pointer.on = true;
});
addEventListener('pointerdown', (e) => {
  const t = performance.now() / 1000;
  ripple(e.clientX, e.clientY, 1, t);
  // a few pellets of food, scattered where they land
  for (let i = 0; i < 4 && !still.matches; i++) {
    const a = Math.random() * 2 * Math.PI;
    const d = 6 + Math.random() * 22;
    food.push({ x: e.clientX + Math.cos(a) * d, y: e.clientY + Math.sin(a) * d * 0.7, t, seed: Math.random() * 100 });
  }
  if (food.length > 40) food.splice(0, food.length - 40);
});
document.addEventListener('pointerout', (e) => {
  if (!e.relatedTarget) pointer.on = false;
});
for (const el of document.querySelectorAll('[data-lure]')) {
  const off = () => {
    if (lure?.el === el) lure = null;
  };
  el.addEventListener('pointerenter', () => setLure(el));
  el.addEventListener('focus', () => setLure(el));
  el.addEventListener('pointerleave', off);
  el.addEventListener('blur', off);
}
addEventListener('resize', () => {
  resize();
  if (still.matches) draw(0);
});
addEventListener('scroll', () => still.matches && draw(0), { passive: true });
dark.addEventListener('change', () => {
  setTheme();
  if (still.matches) draw(0);
});
still.addEventListener('change', () => requestAnimationFrame(loop));

setTheme();
resize();
requestAnimationFrame(loop);

// ---------- the name unscrambles ----------

function unscramble(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const letters = [...text].map((chr) => {
    const span = document.createElement('span');
    span.textContent = chr === ' ' ? ' ' : chr;
    span.setAttribute('aria-hidden', 'true');
    el.append(span);
    return span;
  });
  // each letter keeps its own width, so the stand-in glyphs don't shift the line
  for (const span of letters) {
    span.style.width = `${span.getBoundingClientRect().width}px`;
    span.style.display = 'inline-block';
    span.style.textAlign = 'center';
  }
  const start = performance.now();
  const tick = () => {
    const elapsed = performance.now() - start;
    let done = true;
    letters.forEach((span, i) => {
      if (text[i] === ' ' || elapsed > 200 + i * 75) {
        span.textContent = text[i] === ' ' ? ' ' : text[i];
      } else {
        done = false;
        span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
    });
    if (!done) setTimeout(tick, 45);
  };
  tick();
}

if (!still.matches) document.querySelectorAll('[data-scramble]').forEach(unscramble);
