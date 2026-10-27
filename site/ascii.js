// The homepage's background: a slowly swirling noise field drawn in ASCII characters, tinted by
// drifting washes of color, brighter around the pointer, with a ripple wherever you click. It keeps
// clear of elements marked data-clear, so the heading stays readable. The name in the heading
// unscrambles itself on load. With reduced motion, the field holds still and the name just shows.

const RAMP = ' .:-=+*#%@'; // sparse to dense: denser characters read as brighter
const GLYPHS = '!<>-_\\/[]{}=+*^?#%@&';
const THEMES = {
  // opacity steps: sparse characters are drawn fainter, dense ones stronger
  // glow: the pointer's light and the ripple's ring, in a color the field doesn't use (a highlighter)
  dark: { ink: '#a9b4c8', alpha: [0.18, 0.32, 0.52, 0.8], tints: ['#84d272', '#ff9a76', '#7db4ff'], glow: '#ffd23f' },
  light: { ink: '#2b3652', alpha: [0.13, 0.23, 0.36, 0.55], tints: ['#2f7d32', '#c2410c', '#1d64c2'], glow: '#2f62d8' },
};
const REACH = 200; // how far the pointer lights the field, in px
const RIPPLE_SPEED = 300; // px a second
const RIPPLE_LIFE = 2.2; // seconds
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

// The field at a point, about 0..1. A slow noise bends the coordinates of the main one, so the
// pattern swirls and flows instead of sliding across the screen.
function field(px, py, t) {
  const x = px * 0.0032;
  const y = py * 0.0032;
  const wx = noise(x * 0.6 + t * 0.025, y * 0.6);
  const wy = noise(x * 0.6 + 7.3, y * 0.6 - t * 0.025);
  const n = 0.7 * noise(x + wx + t * 0.015, y + wy) + 0.3 * noise(x * 2.4 - t * 0.04, y * 2.4 + wx);
  return n * 0.95 + 0.42;
}

// ---------- drawing ----------

let W = 0;
let H = 0;
let cw = 0; // character cell, in px
let ch = 0;
let cols = 0;
let rows = 0;
let rowsOf = []; // one row of character codes per opacity step
let theme = dark.matches ? THEMES.dark : THEMES.light;
const pointer = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0 };
const ripples = [];
const clearings = [...document.querySelectorAll('[data-clear]')];

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const size = W < 600 ? 12 : 14;
  ctx.font = `${size}px ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace`;
  ctx.textBaseline = 'top';
  ctx.fontKerning = 'none';
  cw = ctx.measureText('M').width;
  ch = Math.round(size * 1.3);
  cols = Math.ceil(W / cw);
  rows = Math.ceil(H / ch);
  rowsOf = theme.alpha.map(() => new Uint16Array(cols));
}

// the text itself, not its whole block, so a short heading doesn't clear the full width
function textBox(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

function draw(t) {
  // the glow eases after the pointer, and fades in and out as the pointer comes and goes
  pointer.x += (pointer.tx - pointer.x) * 0.14;
  pointer.y += (pointer.ty - pointer.y) * 0.14;
  pointer.on += (pointer.target - pointer.on) * 0.08;
  while (ripples.length && t - ripples[0].t > RIPPLE_LIFE) ripples.shift();
  const boxes = clearings.map(textBox);
  const steps = rowsOf.length;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = theme.ink;
  for (let r = 0; r < rows; r++) {
    const py = r * ch + ch / 2;
    for (const row of rowsOf) row.fill(32);
    let used = 0;
    for (let c = 0; c < cols; c++) {
      const px = c * cw + cw / 2;
      const dx = px - pointer.x;
      const dy = py - pointer.y;
      const d2 = dx * dx + dy * dy;
      let v;
      if (d2 < REACH * REACH) {
        // a lens: around the pointer the field bulges outward, and brightens
        const k = (1 - Math.sqrt(d2) / REACH) * pointer.on;
        v = field(px - dx * 0.45 * k, py - dy * 0.45 * k, t) + k * k * 0.9;
      } else {
        v = field(px, py, t);
      }
      for (const rp of ripples) {
        const age = Math.max(0, t - rp.t);
        const off = Math.hypot(px - rp.x, py - rp.y) - age * RIPPLE_SPEED;
        // a crest with a trough behind it, so the ring shows in dense patches as well as sparse ones
        if (off > -90 && off < 90) v += (off / 30) * Math.exp(-(off * off) / 1800) * 1.4 * (1 - age / RIPPLE_LIFE);
      }
      for (const b of boxes) {
        const ox = Math.max(b.left - PAD - px, 0, px - b.right - PAD);
        const oy = Math.max(b.top - PAD - py, 0, py - b.bottom - PAD);
        if (ox < SOFT && oy < SOFT) v *= Math.min(1, Math.hypot(ox, oy) / SOFT);
      }
      const k = Math.round(Math.min(v, 1) * (RAMP.length - 1));
      if (k <= 0) continue;
      const step = Math.min(steps - 1, Math.floor(v * steps));
      rowsOf[step][c] = RAMP.charCodeAt(k);
      used |= 1 << step;
    }
    // one string per opacity step: monospace keeps each character in its cell
    for (let s = 0; s < steps; s++) {
      if (!(used & (1 << s))) continue;
      ctx.globalAlpha = theme.alpha[s];
      ctx.fillText(String.fromCharCode.apply(null, rowsOf[s]), 0, r * ch);
    }
  }

  // color only lands on the characters drawn: washes of the tints drift about, and the glow color
  // lights the pointer's patch and each ripple's crest
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-atop';
  const size = Math.max(W, H) * 0.5;
  theme.tints.forEach((tint, i) => {
    const x = W * (0.5 + 0.45 * Math.sin(t * (0.05 + i * 0.013) + i * 2.1));
    const y = H * (0.5 + 0.45 * Math.cos(t * (0.04 + i * 0.017) + i * 1.3));
    wash(x, y, 0, size, tint, 0.8);
  });
  if (pointer.on > 0.01) wash(pointer.x, pointer.y, 0, REACH, theme.glow, 0.95 * pointer.on);
  for (const rp of ripples) {
    const age = Math.max(0, t - rp.t);
    wash(rp.x, rp.y, age * RIPPLE_SPEED + 30, 45, theme.glow, 0.95 * (1 - age / RIPPLE_LIFE));
  }
  ctx.globalCompositeOperation = 'source-over';
}

// a soft disc of color (at = 0), or a soft ring at radius `at`, fading out over `spread` px
function wash(x, y, at, spread, color, alpha) {
  const n = parseInt(color.slice(1), 16);
  const rgb = `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
  const outer = at + spread;
  const g = ctx.createRadialGradient(x, y, 0, x, y, outer);
  if (at > spread) g.addColorStop((at - spread) / outer, `rgba(${rgb}, 0)`);
  g.addColorStop(at / outer, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - outer, y - outer, 2 * outer, 2 * outer);
}

let last = 0;
function loop(now) {
  if (still.matches) return draw(0);
  requestAnimationFrame(loop);
  if (now - last < 12) return; // at most about 60 frames a second, also on faster screens
  last = now;
  draw(now / 1000);
}

addEventListener('pointermove', (e) => {
  if (pointer.on < 0.02) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  pointer.target = e.pointerType === 'touch' ? 0 : 1;
});
addEventListener('pointerdown', (e) => {
  ripples.push({ x: e.clientX, y: e.clientY, t: performance.now() / 1000 });
  if (ripples.length > 6) ripples.shift();
});
document.addEventListener('pointerout', (e) => {
  if (!e.relatedTarget) pointer.target = 0;
});
addEventListener('resize', () => {
  resize();
  if (still.matches) draw(0);
});
addEventListener('scroll', () => still.matches && draw(0), { passive: true });
dark.addEventListener('change', () => {
  theme = dark.matches ? THEMES.dark : THEMES.light;
  if (still.matches) draw(0);
});
still.addEventListener('change', () => requestAnimationFrame(loop));

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
