// Studyloom ASCII mode: the whole background drawn in text characters, one picture per scene, coloured from
// one hue that follows the scene and the music.
//
// How it works. The window is a grid of character cells. Each frame the scene's layers paint a brightness
// (0..1) into every cell; a ramp turns brightness into a character and four tiers turn it into one of four
// shades of the current hue. Small things (stars, sparks, rain, windows) are plotted over that as glyphs with
// their own tier. Changing scene cross-fades the two brightness fields, so one picture dissolves into the next.
//
// Colour. Every scene has a home colour (hue, saturation, lightness). The music moves it: a bright mode
// (lydian, ionian) lifts it, a dark one (aeolian, dorian) lowers it; beats and bass warm the hue, synth and
// the airy sections cool it; a full section saturates it and a sparse one drains it; on top of that it wanders
// a few degrees over minutes. The shown colour eases toward the target (quickly right after a scene change).
//
//   const a = Ascii.create(canvas, { fs, dim })   fs: fixed font size in px; dim: false for no dark patch in the middle
//   a.resize(W, H, dpr)
//   a.setScene(id)                      the scene changed (cross-fades)
//   a.draw(dt, info)                    info = { sig: {beat, notes, energy}, level, mood, mode, mix, playing }
//   a.palette()                         → { tiers: [t0, t1, t2, t3], bg, accent } as CSS colours
//   Ascii.THEMES[id]                    the home colour and picture of each scene
'use strict';
const Ascii = (() => {
  const RAMP = ' .,:;+*#%@';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rr = (a, b) => a + (b - a) * Math.random();
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // smooth value noise, 2D, 0..1
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y) => 0.55 * noise(x, y) + 0.3 * noise(x * 2.1 + 7.3, y * 2.1 - 3.1) + 0.15 * noise(x * 4.3 - 1.7, y * 4.3 + 9.2);

  // ── the scenes: home colour and the layers that make the picture ──
  // hue in degrees, sat in %, lit 0..1 (how light the whole picture sits)
  const THEMES = {
    study:      { hue: 36,  sat: 42, lit: 0.5,  layers: [['sky', { stars: 1.2, hor: 0.9, glow: 0.15 }], ['nightwin', {}]] },
    rain:       { hue: 212, sat: 34, lit: 0.42, layers: [['skyline', { far: true, y: 0.4, dim: 0.5 }], ['skyline', { far: false, y: 0.5, dim: 1 }], ['street', {}], ['fall', { kind: 'rain', n: 1.1, wind: 0.25 }], ['puddles', {}]] },
    campfire:   { hue: 24,  sat: 56, lit: 0.52, layers: [['sky', { stars: 1, hor: 2 }], ['pines', { y: 1.0, list: [[0.05, 0.77], [0.14, 0.64], [0.22, 0.5], [0.79, 0.55], [0.88, 0.68], [0.96, 0.82]], fill: 0.06, t: 1, sway: 0.5, lit: true }], ['fire', { narrow: true }], ['orbiters', { n: 7 }]] },
    drive:      { hue: 318, sat: 52, lit: 0.55, layers: [['sky', { stars: 0.6, hor: 0.56 }], ['road', { slow: 0.5, clean: true }], ['roadside', { speed: 0.6 }]] },
    train:      { hue: 26,  sat: 46, lit: 0.66, layers: [['sun', { x: 0.7, y: 0.5, r: 0.09 }], ['ridge', { kind: 'hills', y: 0.52, amp: 0.1, speed: 6, shade: 0.12 }], ['ridge', { kind: 'hills', y: 0.68, amp: 0.08, speed: 16, shade: 0.2 }], ['blurtrees', {}], ['poles', { speed: 40 }], ['birds', {}]] },
    tide:       { hue: 218, sat: 40, lit: 0.46, layers: [['sky', { stars: 0.9, hor: 0.45, moon: [0.7, 0.18, 0.07] }], ['waves', { y: 0.45, glint: 0.7, rough: true, speed: 0.75 }], ['shore', {}], ['meteor', { every: [5, 6], maxY: 0.42 }]] },
    grove:      { hue: 118, sat: 32, lit: 0.6,  layers: [['sky', { stars: 0, hor: 0.5, glow: 0.35 }], ['shafts', { slant: 0.2 }], ['pines', { y: 0.64, auto: 8, h: [0.2, 0.3], fill: 0.1, t: 1, sway: 0.3 }], ['mist', { y: 0.62 }], ['pines', { y: 0.92, list: [[0.05, 0.74], [0.15, 0.56], [0.85, 0.6], [0.95, 0.78]], fill: 0.16, t: 2, sway: 1 }], ['grass', { y: 0.92 }], ['gpond', { x: 0.5, y: 0.8, rx: 0.31, ry: 0.15 }], ['pines', { y: 1.08, list: [[0.27, 0.3], [0.73, 0.32], [0.01, 0.5], [0.99, 0.46]], fill: 0.16, t: 2, sway: 0.8 }], ['fireflies', { n: 26, x: [0.22, 0.78], y: [0.3, 0.8] }]] },
    peaks:      { hue: 204, sat: 20, lit: 0.8,  layers: [['haze', {}], ['ridge', { kind: 'massif', y: 0.74, amp: 0.62, speed: 0, shade: 0.12, snow: true, plumes: true }], ['ridge', { kind: 'peaks', y: 0.9, amp: 0.09, speed: 0, shade: 0.2, snow: true }], ['mist', { y: 0.68, amt: 0.35 }], ['blizzard', {}]] },
    orbit:      { hue: 252, sat: 38, lit: 0.36, layers: [['nebula', {}], ['sky', { stars: 1.1, hor: 2, drift: 0.15, calm: true }]] },
    city:       { hue: 214, sat: 42, lit: 0.5,  layers: [['sky', { stars: 0.3, hor: 0.6 }], ['airliner', { period: 60, size: 0.16, y: 0.3, fade: 0.7 }], ['skyline', { far: true, y: 0.45, dim: 0.55 }], ['skyline', { far: false, y: 0.6, dim: 1 }], ['towers', { list: [[0.21, 0.075, 0.12, 1], [0.8, 0.065, 0.2, 2]] }], ['traffic', { y: 0.76 }]] },
    dunes:      { hue: 30,  sat: 46, lit: 0.55, layers: [['sky', { stars: 0.3, hor: 0.55, glow: 0.4 }], ['sun', { x: 0.78, y: 0.5, r: 0.1 }], ['ridge', { kind: 'dunes', y: 0.58, amp: 0.08, speed: 0, shade: 0.16, caravan: true }], ['shimmer', { y: 0.52 }], ['ridge', { kind: 'dunes', y: 0.8, amp: 0.06, speed: 0.4, shade: 0.24 }], ['sand', {}]] },
    deep:       { hue: 192, sat: 50, lit: 0.3,  layers: [['shafts', { slant: 0.12, deep: true }], ['ridge', { kind: 'dunes', y: 0.92, amp: 0.04, speed: 0, shade: 0.1 }], ['jelly', { n: 6, far: 0.38 }], ['shark', {}], ['rise', { kind: 'bubble', n: 0.5 }]] },
    aurora:     { hue: 135, sat: 46, lit: 0.7, multi: { hues: [188, 200, 214, 226, 238], speed: 0.07 }, layers: [['sky', { stars: 0.8, hor: 2 }], ['corona', {}], ['pines', { y: 1.0, list: [[0, 0.68], [0.045, 0.61], [0.09, 0.55], [0.14, 0.62], [0.19, 0.5], [0.81, 0.5], [0.86, 0.62], [0.91, 0.55], [0.955, 0.61], [1, 0.68]], fill: 0.05, t: 1, sway: 0.2, fixed: true }]] },
    cafe:       { hue: 28,  sat: 40, lit: 0.55, layers: [['cafewin', {}]] },
    zen:        { hue: 342, sat: 34, lit: 0.74, zones: { 1: { hue: 196, sat: 55 }, 2: { hue: 24, sat: 90 } }, layers: [['pond', {}], ['bigkoi', {}], ['tadpoles', { n: 6 }], ['fall', { kind: 'petal', n: 0.1, wind: 0.5 }]] },
    lighthouse: { hue: 206, sat: 24, lit: 0.36, layers: [['storm', {}], ['beam', { x: 0.78, y: 0.36, power: 1.8 }], ['waves', { y: 0.62, rough: true }], ['spray', { x: 0.78, y: 0.62 }], ['fall', { kind: 'rain', n: 1, wind: 0.6 }]] },
  };
  const DEFAULT_THEME = { hue: 200, sat: 30, lit: 0.5, layers: [['sky', { stars: 1, hor: 0.7 }]] };
  const MODE_LIGHT = { lydian: 1, ionian: 0.8, mixolydian: 0.6, dorian: 0.4, aeolian: 0.2 };

  // ── layers. Each: init(G) when the grid changes, tick(dt, M) to move, paint(B, O, M) to fill
  // B (brightness, max-combined) and O (glyph overlay: O.ch char code, O.t tier, 0 = none).
  // G = { cols, rows, aspect } (aspect = cell width / cell height), M = the music this frame.
  const L = {};

  // a sky: a glow along the horizon, stars that twinkle (more with the music), maybe a moon
  L.sky = (o) => ({
    init(G) {
      const n = Math.round(G.cols * G.rows * 0.006 * (o.stars ?? 1));
      const hor = (o.hor ?? 0.7) * G.rows;
      this.st = Array.from({ length: n }, () => ({ c: rr(0, G.cols), r: rr(0, Math.min(G.rows, hor) - 1), f: rr(0.3, 1.6), p: rr(0, TAU), b: Math.random() }));
    },
    tick(dt, M) { this.t = (this.t || 0) + dt; for (const s of this.st) s.ph = (s.ph || 0) + dt * s.f * (o.calm ? 0.25 : 1 + M.notes); if (o.drift) for (const s of this.st) { s.c -= dt * o.drift * (0.4 + s.b); if (s.c < 0) s.c += M.G.cols; } },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G, hor = (o.hor ?? 0.7) * rows;
      if (hor < rows) for (let r = 0; r < rows; r++) {
        const g = (o.glow ?? 0.22) * Math.exp(-Math.abs(hor - r) / (rows * 0.08));
        if (g < 0.03) continue;
        for (let c = 0; c < cols; c++) B[r * cols + c] = Math.max(B[r * cols + c], g * (0.75 + 0.5 * noise(c * 0.05 + this.t * 0.05, r * 0.3)));
      }
      for (const s of this.st) {
        const tw = 0.5 + 0.5 * Math.sin(s.ph + s.p);
        const v = s.b * 0.6 + tw * 0.5;
        if (v < 0.35) continue;
        O.put(s.c | 0, s.r | 0, v > 0.95 ? 42 : v > 0.75 ? 43 : 46, v > 0.9 ? 3 : v > 0.65 ? 2 : 1);
      }
      if (o.moon) disc(B, M.G, o.moon[0] * cols, o.moon[1] * rows, o.moon[2] * rows, 0.62, -0.6, -0.5);
    },
  });

  // a lit disc (moon, sun, planet): brightness from a light direction, a soft halo round it
  function disc(B, G, cx, cy, R, top, lx, ly) {
    const { cols, rows, aspect } = G;
    const H = R * 2.2;
    for (let r = Math.max(0, (cy - H) | 0); r < Math.min(rows, cy + H + 1); r++)
      for (let c = Math.max(0, ((cx - H / aspect) | 0)); c < Math.min(cols, cx + H / aspect + 1); c++) {
        const dx = (c + 0.5 - cx) * aspect / R, dy = (r + 0.5 - cy) / R, d2 = dx * dx + dy * dy;
        const i = r * cols + c;
        if (d2 < 1) {
          const nz = Math.sqrt(1 - d2), lit = Math.max(0, -(dx * lx + dy * ly) * 0.7 + nz * 0.7);
          B[i] = Math.max(B[i], top * (0.45 + 0.55 * lit) * (0.92 + 0.08 * noise(c * 0.6, r * 0.6)));
        } else B[i] = Math.max(B[i], 0.22 * top * Math.exp(-(Math.sqrt(d2) - 1) * 3));
      }
  }
  L.sun = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G;
      disc(B, M.G, o.x * cols, o.y * rows, o.r * rows, o.soft ? 0.7 : 0.95, 0, 0);
      // a warm glow along the horizon under it
      if (!o.soft) for (let r = 0; r < rows; r++) {
        const g = 0.3 * Math.exp(-Math.abs(r - o.y * rows) / (rows * 0.1));
        for (let c = 0; c < cols; c++) B[r * cols + c] = Math.max(B[r * cols + c], g * (0.6 + 0.4 * Math.exp(-Math.abs(c - o.x * cols) / (cols * 0.3))));
      }
    },
  });

  // a ridge line filled below: hills, pine forest, mountains with snow, dunes. speed = columns per second it scrolls
  L.ridge = (o) => ({
    init(G) { this.x = rr(0, 1000); this.seed = rr(0, 100); },
    tick(dt, M) { this.x += dt * (o.speed || 0) * (0.6 + 0.6 * M.go); this.t = (this.t || 0) + dt; if (o.caravan) this.cv = (this.cv ?? M.G.cols * 0.75) + dt * 1.3 * (M.G.cols / 120); },
    top(c, G) {
      const X = (c + this.x) / G.cols, base = o.y * G.rows, A = o.amp * G.rows;
      if (o.kind === 'peaks') { const n = 1 - Math.abs(2 * noise(X * 5 + this.seed, 1.3) - 1), m = 1 - Math.abs(2 * noise(X * 11 + this.seed, 4.1) - 1); return base + A * 0.5 - A * (Math.pow(n, 2.2) * 1.15 + 0.3 * Math.pow(m, 3)); }
      if (o.kind === 'trees') {
        const w = 5 + 3 * hash((c + this.x) / 7 | 0, 3);
        const k = (c + this.x) % w / w, tall = 0.5 + 0.8 * hash(((c + this.x) / w) | 0, 9);
        return base - A * fbm(X * 2 + this.seed, 0.5) * 0.6 - A * tall * (1 - Math.abs(2 * k - 1)) * 0.9;
      }
      if (o.kind === 'massif') {
        const pk = (x0, w, h, p) => h * Math.pow(Math.max(0, 1 - Math.abs(X - x0) / w), p);
        let hh = Math.max(pk(0.5, 0.32, 1, 1.25), pk(0.15, 0.22, 0.55, 1.2), pk(0.86, 0.2, 0.6, 1.2), pk(0.33, 0.12, 0.42, 1.4), pk(0.69, 0.12, 0.45, 1.4));
        if (hh > 0.03) hh += 0.07 * (noise(X * 18 + this.seed, 2) - 0.5) + 0.035 * (noise(X * 45, 5) - 0.5);
        return base - A * hh;
      }
      if (o.kind === 'dunes') return base - A * Math.sin(X * 5 + this.seed + Math.sin(X * 2.3) * 1.2) * 0.6 - A * 0.4 * fbm(X * 2, this.seed);
      return base - A * (fbm(X * 2.2 + this.seed, 0.7) - 0.3) * 1.6; // hills
    },
    paint(B, O, M) {
      const { cols, rows } = M.G, sh = o.shade ?? 0.15;
      for (let c = 0; c < cols; c++) {
        const y = this.top(c, M.G), y1 = this.top(c + 1, M.G), slope = y1 - y;
        for (let r = Math.max(0, Math.floor(y)); r < rows; r++) {
          const i = r * cols + c, d = r - y;
          let v = (sh + 0.1) * (0.7 + 0.6 * noise(c * 0.25 + this.x * 0.25, r * 0.35)) + 0.32 * Math.exp(-d / 4);
          if (d < 1.2) v = Math.max(v, 0.55 + 0.2 * clamp(-slope, -1, 1)); // the rim catches the light
          if (o.snow && y < (o.y - o.amp * 0.15) * rows && d < (o.y * rows - y) * 0.35) v = Math.max(v, 0.72 - d * 0.05 + 0.15 * clamp(-slope, -1, 1));
          if (o.kind === 'dunes') v = Math.max(v, sh + 0.25 * clamp(-slope * 1.5, 0, 1) * Math.exp(-d / 6));
          B[i] = v; // a ridge hides what is behind it
          O.clear(c, r);
        }
      }
      if (o.kind === 'massif') { // ridgelines and gullies running down from the summits
        for (const [x0, h, n] of [[0.5, 1, 5], [0.15, 0.55, 3], [0.86, 0.6, 3]]) {
          const sc = Math.round(x0 * cols), sr = this.top(sc, M.G);
          for (let k = 0; k < n; k++) {
            const side = k % 2 ? 1 : -1, f = (k + 1) / (n + 1), len = rows * o.amp * h * (0.35 + 0.45 * f);
            const ex = sc + side * len * (0.9 + 0.5 * f), ey = sr + len * 0.8;
            seg(O, M.G, sc + side * (k >> 1), sr + 1 + k * 0.6, ex, Math.min(rows - 1, ey), ey < (o.y - o.amp * 0.4) * rows ? 3 : 2);
          }
        }
      }
      if (o.plumes) { // snow blown off the summits, streaming downwind
        const tops = []; for (let c = 0; c < cols; c++) tops.push(this.top(c, M.G));
        for (let c = 2; c < cols - 2; c++) {
          if (!(tops[c] < tops[c - 2] && tops[c] < tops[c + 2] && tops[c] < rows * 0.45)) continue;
          for (let k = 1; k < 15; k++) if (noise(k * 0.35 - this.t * 2.2, c * 0.7) > 0.36) O.put(c + k, (tops[c] - k * 0.3 - 1) | 0, k < 6 ? 126 : 46, k < 4 ? 3 : 2);
        }
      }
      if (o.caravan) { // camels plodding along the crest
        const step = Math.max(12, cols * 0.11);
        for (let j = 0; j < 3; j++) {
          const span = cols + 40, x = ((this.cv || 0) - j * step) % span; const c0 = (x < 0 ? x + span : x) - 20;
          const y = Math.floor(this.top(c0 + 5, M.G));
          stamp(O, c0, y - 3, CAMEL[(Math.floor((this.cv || 0) * 1.6) + j) & 1], j === 0 ? 3 : 2);
        }
      }
    },
  });

  // falling things: rain, snow, leaves, petals
  const FALL = {
    rain: { v: [28, 44], ch: () => 124, slant: 47, t: [1, 2] },
    snow: { v: [3, 7], ch: (p) => (p.s > 0.7 ? 42 : p.s > 0.4 ? 43 : 46), t: [1, 3] },
    leaf: { v: [3, 6], ch: (p, t) => [44, 39, 96, 126][((t * p.f * 3 + p.p) | 0) & 3], t: [1, 2] },
    petal: { v: [2.5, 5], ch: (p, t) => [42, 126, 44, 111][((t * p.f * 2 + p.p) | 0) & 3], t: [2, 3] },
  };
  L.fall = (o) => ({
    init(G) {
      const n = Math.round(G.cols * (o.n ?? 1) * (o.kind === 'rain' ? 0.7 : 0.45));
      this.p = Array.from({ length: n }, () => this.mk(G, true));
    },
    mk(G, any) { const K = FALL[o.kind]; return { c: rr(-G.cols * 0.2, G.cols), r: any ? rr(0, G.rows) : rr(-4, 0), v: rr(K.v[0], K.v[1]), s: Math.random(), f: rr(0.5, 1.5), p: rr(0, TAU), splash: 0 }; },
    tick(dt, M) {
      const G = M.G, K = FALL[o.kind];
      this.t = (this.t || 0) + dt;
      const wind = (o.wind || 0) * (0.6 + 0.8 * noise(this.t * 0.1, 3));
      for (const p of this.p) {
        if (p.splash > 0) { p.splash -= dt; if (p.splash <= 0) Object.assign(p, this.mk(G, false)); continue; }
        const sp = p.v * (0.5 + 0.5 * p.s) * (0.8 + 0.3 * M.go);
        p.r += sp * dt;
        p.c += (wind * sp * (o.kind === 'rain' ? 0.5 : 0.4) + (o.kind === 'rain' ? 0 : Math.sin(this.t * p.f + p.p) * 1.2)) * dt;
        if (p.r >= G.rows - 1) { if (o.kind === 'rain') { p.splash = 0.12; p.r = G.rows - 1; } else Object.assign(p, this.mk(G, false)); }
      }
    },
    paint(B, O, M) {
      const K = FALL[o.kind];
      for (const p of this.p) {
        if (p.splash > 0) { O.put(p.c | 0, M.G.rows - 1, p.splash > 0.06 ? 111 : 46, 1); continue; }
        const ch = o.kind === 'rain' && (o.wind || 0) > 0.3 ? K.slant : K.ch(p, this.t);
        const t = p.s > 0.6 ? K.t[1] : K.t[0];
        O.put(p.c | 0, p.r | 0, ch, t);
        if (o.kind === 'rain' && p.s > 0.5) O.put((p.c - (o.wind || 0) * 0.5) | 0, (p.r - 1) | 0, ch, t - 1); // a streak
      }
    },
  });

  // rising things: bubbles in the deep
  L.rise = (o) => ({
    init(G) { this.p = Array.from({ length: Math.round(G.cols * (o.n ?? 1) * 0.3) }, () => ({ c: rr(0, G.cols), r: rr(0, G.rows), v: rr(2, 6), s: Math.random(), p: rr(0, TAU) })); },
    tick(dt, M) {
      this.t = (this.t || 0) + dt;
      for (const p of this.p) { p.r -= p.v * dt * (0.7 + 0.5 * M.go); p.c += Math.sin(this.t * 2 + p.p) * dt * 0.8; if (p.r < 0) { p.r = M.G.rows + rr(0, 4); p.c = rr(0, M.G.cols); } }
      if (M.beat > 0.8 && Math.random() < 0.5) for (let k = 0; k < 4; k++) this.p[(Math.random() * this.p.length) | 0].v = rr(6, 10);
    },
    paint(B, O) { for (const p of this.p) O.put(p.c | 0, p.r | 0, p.s > 0.75 ? 79 : p.s > 0.4 ? 111 : 46, p.s > 0.75 ? 2 : 1); },
  });

  // slanted shafts of light from above (forest, deep sea)
  L.shafts = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G;
      for (let r = 0; r < rows; r++) {
        const fall = o.deep ? 0.75 * Math.exp(-r / (rows * 0.5)) : 0.45 * (1 - r / rows);
        for (let c = 0; c < cols; c++) {
          const x = (c + r * o.slant * 2.2) / cols;
          const s = Math.pow(noise(x * 7 + this.t * 0.04, 0.5), 3) * 2.2;
          const i = r * cols + c;
          B[i] = Math.max(B[i], fall * s * (0.85 + 0.3 * M.level) + (o.deep ? 0.08 : 0));
        }
      }
    },
  });

  // drifting points of light (the deep sea's creatures)
  L.glow = (o) => ({
    init(G) { this.p = Array.from({ length: o.n }, () => ({ x: rr(0.1, 0.9), y: rr(0.3, 0.9), p: rr(0, TAU), s: rr(0.6, 1.2) })); },
    tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G;
      for (const q of this.p) {
        const cx = (q.x + 0.05 * Math.sin(this.t * 0.1 + q.p)) * cols, cy = (q.y + 0.04 * Math.sin(this.t * 0.17 + q.p * 2)) * rows;
        disc(B, M.G, cx, cy, rows * 0.025 * q.s * (1 + 0.25 * Math.sin(this.t * 1.3 + q.p) + 0.3 * M.beat), 0.85, 0, -0.7);
        for (let k = 0; k < 4; k++) O.put((cx + (k - 1.5) * 1.5 + Math.sin(this.t * 2 + k) * 0.6) | 0, (cy + 2 + k * 0.4 + Math.abs(Math.sin(this.t + k))) | 0, 40 + (k & 1), 1); // tendrils
      }
    },
  });

  // waves: a moving water surface, crests catching the light, a glint road under the moon
  L.waves = (o) => ({
    init() {}, tick(dt, M) { this.t = (this.t || 0) + dt * (0.7 + 0.5 * M.go) * (o.rough ? 1.6 : 1) * (o.speed || 1); },
    paint(B, O, M) {
      const { cols, rows } = M.G, y0 = Math.floor(o.y * rows), t = this.t;
      for (let r = y0; r < rows; r++) {
        const d = (r - y0 + 1) / (rows - y0), k = 0.5 / (0.25 + d);
        for (let c = 0; c < cols; c++) {
          const ph = c * 0.09 * k + t * (0.6 + d) + 3 * noise(c * 0.03 * k, r * 0.7 + t * 0.1);
          let v = 0.1 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(ph), o.rough ? 3 : 6) * (0.4 + d);
          if (o.glint != null) v += 0.65 * Math.exp(-Math.pow((c - o.glint * cols) / (2 + 9 * d), 2)) * (Math.sin(ph * 1.7) > 0.2 ? 1 : 0.2);
          if (o.rough && Math.sin(ph) > 0.93 && r > y0) O.put(c, r - 1, 126, 2); // foam
          B[r * cols + c] = v;
          O.clear(c, r);
        }
      }
    },
  });
  L.lake = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) { // a still lake: the sky above mirrored, broken by slow ripples
      const { cols, rows } = M.G, y0 = Math.floor(o.y * rows);
      for (let r = y0; r < rows; r++) {
        const src = y0 - (r - y0) - 1;
        for (let c = 0; c < cols; c++) {
          const cc = clamp(Math.round(c + 2 * Math.sin(r * 0.9 + this.t * 0.8)), 0, cols - 1);
          B[r * cols + c] = src >= 0 ? B[src * cols + cc] * 0.55 : 0.05;
          O.clear(c, r);
        }
      }
    },
  });

  // northern lights: hanging curtains that ripple and fold
  L.aurora = () => ({
    init() {}, tick(dt, M) { this.t = (this.t || 0) + dt * (0.6 + 0.6 * M.go); },
    paint(B, O, M) {
      const { cols, rows } = M.G, t = this.t;
      for (let c = 0; c < cols; c++) {
        const x = c / cols;
        const y = rows * (0.2 + 0.08 * Math.sin(x * 5 + t * 0.15) + 0.06 * (noise(x * 4, t * 0.1) - 0.5) * 2);
        const s = (0.45 + 0.75 * Math.pow(noise(x * 9 + t * 0.2, 2.2), 1.2)) * (0.9 + 0.4 * M.level);
        const fold = 0.7 + 0.3 * Math.sin(c * 0.7 + t * 1.3 + 4 * noise(x * 3, t * 0.05));
        for (let r = 0; r < rows * 0.62; r++) {
          const above = r < y ? Math.exp(-(y - r) / 2.2) : Math.exp(-(r - y) / (rows * 0.22));
          const v = s * fold * above;
          const i = r * cols + c;
          if (v > B[i]) B[i] = v;
        }
      }
    },
  });

  // a city skyline: blocks, lit windows that come and go
  L.skyline = (o) => ({
    init(G) {
      this.b = [];
      for (let c = 0; c < G.cols;) {
        const w = Math.round(rr(5, 14) * (o.far ? 0.8 : 1)), h = rr(0.06, 0.3) * G.rows * (o.far ? 0.8 : 1.2);
        this.b.push({ c0: c, c1: c + w, top: o.y * G.rows - h + G.rows * 0.15, seed: rr(0, 999) });
        c += w + (Math.random() < 0.3 ? 1 : 0);
      }
    },
    tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G;
      for (const b of this.b) for (let c = b.c0; c < Math.min(cols, b.c1); c++) for (let r = Math.max(0, b.top | 0); r < rows; r++) {
        const i = r * cols + c, edge = c === b.c0 || c === b.c1 - 1 || r === (b.top | 0);
        B[i] = (edge ? 0.2 : 0.07) * o.dim; O.clear(c, r);
        if (!edge && (c - b.c0) % 2 === 1 && (r - (b.top | 0)) % 2 === 1) {
          const on = hash(c * 7 + b.seed, r) + 0.15 * Math.sin(this.t * 0.05 + hash(c, r * 3) * 40) > (o.far ? 0.62 : 0.55);
          if (on) O.put(c, r, o.far ? 46 : hash(c, r) > 0.5 ? 61 : 35, o.far ? 1 : hash(r, c) > 0.8 ? 3 : 2);
        }
      }
    },
  });
  L.puddles = () => ({ // rain rings on the ground
    init(G) { this.r = []; }, tick(dt, M) { this.t = (this.t || 0) + dt; if (Math.random() < dt * 6) this.r.push({ c: rr(0, M.G.cols), a: 0 }); for (const q of this.r) q.a += dt * 6; this.r = this.r.filter((q) => q.a < 5); },
    paint(B, O, M) { const r = M.G.rows - 1; for (const q of this.r) { const w = q.a | 0; O.put((q.c - w) | 0, r, 40, 1); O.put((q.c + w) | 0, r, 41, 1); } },
  });

  // a night road toward a striped sun, the grid rushing at you
  L.road = (o = {}) => ({
    init() {}, tick(dt, M) { this.z = ((this.z || 0) + dt * (1.2 + 1.5 * M.go) * (o.slow || 1)) % 2; /* mod 2 keeps every stripe phase whole, so nothing jumps */ this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G, hor = Math.floor(rows * 0.56), mid = cols / 2;
      // the sun: a disc with bands cut out of its lower half
      const R = rows * 0.2, cy = hor - 1;
      if (o.clean) {
        glowAt(B, M.G, mid, cy - R * 0.45, R * 0.9, 0.22);
        for (let r = Math.max(0, Math.floor(cy - R)); r < hor; r++) {
          const dy = (r + 0.5 - cy) / R; if (dy < -1) continue;
          const q = 1 + dy, hw = Math.sqrt(Math.max(0, 1 - dy * dy)) * R / aspect;   // q: 0 top … 1 horizon
          const gap = q > 0.42 ? (q - 0.42) / 0.58 * 0.6 : 0, ph = (((cy - r) / R) * 6 + this.t * 0.18) % 1;
          if (gap > 0 && ph < gap) continue;
          const c0 = Math.round(mid - hw), c1 = Math.round(mid + hw);
          for (let c = c0; c <= c1; c++) { if (c < 0 || c >= cols) continue; B[r * cols + c] = 0; O.put(c, r, q < 0.35 ? 35 : q < 0.7 ? 61 : 45, q < 0.5 ? 2 : 1); }
        }
      } else for (let r = Math.max(0, (cy - R) | 0); r < hor; r++) for (let c = 0; c < cols; c++) {
        const dx = (c - mid) * aspect / R, dy = (r - cy) / R;
        if (dx * dx + dy * dy > 1) continue;
        if (dy > -0.2 && Math.sin(dy * 22 - this.t * 1.5) > 0.2) continue;
        B[r * cols + c] = Math.max(B[r * cols + c], 0.55 + 0.35 * (1 + dy) / 2);
      }
      if (o.clean) { // thin perspective lines: road edges / \, centre dashes, a light grid scrolling toward you
        const zr = (r) => 1 / ((r - hor + 1) / (rows - hor));
        for (let r = hor; r < rows; r++) {
          const d = (r - hor + 1) / (rows - hor), z = zr(r), half = d * cols * 0.5, el = mid - 0.42 * half, er = mid + 0.42 * half;
          for (let c = 0; c < cols; c++) { B[r * cols + c] = c > el && c < er ? 0.05 + 0.04 * d : 0.025; O.clear(c, r); }
          const k0 = Math.floor(z * 0.6 + this.z), k1 = Math.floor(zr(r + 1) * 0.6 + this.z);
          if (k0 !== k1 && (z - zr(r + 1)) * 0.6 < 0.9) for (let c = 0; c < cols; c++) if (c < el - 1 || c > er + 1) O.put(c, r, 45, d > 0.5 ? 2 : 1); else if (d > 0.25) O.put(c, r, 46, 1);
          for (let k = 1; k <= 6; k++) for (const s of [-1, 1]) O.put(Math.round(mid + s * (0.42 + k * 0.55) * half), r, s < 0 ? 47 : 92, 1);
          const w = Math.max(1, Math.round(d * 2.2));
          for (let q = 0; q < w; q++) { O.put(Math.round(el) - q, r, 47, 3); O.put(Math.round(er) + q, r, 92, 3); }
          if (((z * 1.5 + this.z * 2.5) % 1) < 0.5) for (let q = 0; q < w; q++) O.put(Math.round(mid - (w - 1) / 2 + q), r, 124, d > 0.4 ? 3 : 2);
        }
        return;
      }
      for (let r = hor; r < rows; r++) {
        const d = (r - hor + 1) / (rows - hor), z = 1 / d;
        const line = Math.abs(((z * 0.6 + this.z) % 1) - 0.5) > 0.45;
        for (let c = 0; c < cols; c++) {
          const x = (c - mid) / (d * cols * 0.5); // road space
          const vline = Math.abs(x * 2.5 - Math.round(x * 2.5)) < 0.06 * (1 + 1 / (d * 6));
          let v = 0.04 + (line ? 0.32 * d + 0.1 : 0) + (vline ? 0.38 : 0);
          if (Math.abs(x) < 0.03 && ((z * 1.5 + this.z * 2.5) % 1) < 0.5) v = 0.9; // the centre dashes
          if (Math.abs(Math.abs(x) - 0.42) < 0.03 + 0.02 / d) v = 0.75; // the road's edges
          B[r * cols + c] = v; O.clear(c, r);
        }
      }
    },
  });

  // telegraph poles flicking past the train window
  L.poles = (o) => ({
    init(G) { this.x = 0; }, tick(dt, M) { this.x += dt * o.speed * (0.6 + 0.6 * M.go); },
    paint(B, O, M) {
      const { cols, rows } = M.G, gap = Math.round(cols * 0.45), wire = Math.round(rows * 0.3);
      for (let c = 0; c < cols; c++) {
        const k = (c + this.x) % gap;
        const sag = wire + Math.round(2 * Math.sin((k / gap) * Math.PI));
        O.put(c, sag, 45, 1);
        if (k < 1) for (let r = wire - 1; r < rows; r++) O.put(c, r, 124, 2);
      }
    },
  });

  // a ringed planet
  L.planet = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G, cx = o.x * cols, cy = o.y * rows, R = o.r * rows;
      disc(B, M.G, cx, cy, R, 0.8, -0.7, -0.4);
      for (let c = 0; c < cols; c++) { // the ring: a flat ellipse, its near half over the planet
        const dx = (c - cx) * aspect / (R * 2.1);
        if (Math.abs(dx) > 1) continue;
        for (const s of [1, -1]) {
          const r = Math.round(cy + s * Math.sqrt(1 - dx * dx) * R * 0.32 - dx * R * 0.25);
          if (r < 0 || r >= rows) continue;
          const behind = s < 0 && (c - cx) * (c - cx) * aspect * aspect + (r - cy) * (r - cy) < R * R;
          if (!behind) O.put(c, r, Math.abs(dx) > 0.92 ? 46 : 61, 2);
        }
      }
    },
  });

  // a lighthouse on a rock, its beam sweeping across the dark
  L.beam = (o) => ({
    init() {}, tick(dt, M) { this.a = ((this.a || 0) + dt * (0.6 + 0.3 * M.go)) % TAU; },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G, lx = o.x * cols, ly = o.y * rows;
      const dir = Math.cos(this.a), toward = Math.max(0, Math.sin(this.a)); // dir: left/right, toward: facing us
      for (let r = 0; r < rows * 0.62; r++) for (let c = 0; c < cols; c++) {
        const dx = (c - lx) * aspect, dy = r - ly, ang = Math.atan2(dy, dx * Math.sign(dir || 1));
        const w = Math.exp(-Math.pow(ang / (0.07 + 0.25 * toward), 2)) * (Math.sign(dx) === Math.sign(dir) ? 1 : 0);
        const v = w * Math.abs(dir) * 0.55 * (o.power || 1) * Math.exp(-Math.hypot(dx, dy) / (cols * 0.6)) + 0.04;
        const i = r * cols + c; if (v > B[i]) B[i] = v;
      }
      disc(B, M.G, lx, ly, rows * 0.025, 0.4 + 0.6 * toward, 0, 0);
      for (let r = Math.ceil(ly + 1); r < rows * 0.66; r++) for (let c = Math.round(lx - 1 - (r - ly) * 0.08); c <= Math.round(lx + 1 + (r - ly) * 0.08); c++) O.put(c, r, 35, 1); // the tower
    },
  });

  // a desk lamp's pool of light and a window of rain (study, café)
  L.lamp = (o) => ({
    init(G) { this.rain = L.fall({ kind: 'rain', n: 0.5, wind: 0.1 }); this.rain.init(G); },
    tick(dt, M) { this.t = (this.t || 0) + dt; this.rain.tick(dt, M); },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G;
      const wx0 = Math.round(cols * 0.08), wx1 = Math.round(cols * 0.42), wy0 = Math.round(rows * 0.1), wy1 = Math.round(rows * 0.6);
      // the window: a dark pane of night with rain on it, a frame round it
      const save = O.ch.slice(), saveT = O.t.slice();
      this.rain.paint(B, O, M);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c, inside = c > wx0 && c < wx1 && r > wy0 && r < wy1;
        if (!inside) { O.ch[i] = save[i]; O.t[i] = saveT[i]; }
        else B[i] = Math.max(B[i], 0.12 + 0.12 * noise(c * 0.15, r * 0.2 + this.t * 0.05));
      }
      for (let c = wx0; c <= wx1; c++) { O.put(c, wy0, 61, 1); O.put(c, wy1, 61, 1); O.put(c, (wy0 + wy1) >> 1, 45, 1); }
      for (let r = wy0; r <= wy1; r++) { O.put(wx0, r, 124, 1); O.put(wx1, r, 124, 1); O.put((wx0 + wx1) >> 1, r, 124, 1); }
      // the lamp's light on the wall and the desk
      const lx = cols * 0.74, ly = rows * 0.55;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const d = Math.hypot((c - lx) * aspect, (r - ly) * 1.2) / rows;
        const i = r * cols + c;
        B[i] = Math.max(B[i], (o.warm ? 0.6 : 0.5) * Math.exp(-d * 3.2) * (0.97 + 0.03 * Math.sin(this.t * 7)));
      }
      const desk = Math.round(rows * 0.8);
      for (let c = 0; c < cols; c++) { O.put(c, desk, 61, 2); for (let r = desk + 1; r < rows; r++) B[r * cols + c] = 0.1 + 0.05 * noise(c * 0.1, r); }
    },
  });
  L.motes = () => ({ // dust turning slowly in the lamplight
    init(G) { this.p = Array.from({ length: 40 }, () => ({ x: rr(0.55, 0.95), y: rr(0.2, 0.78), p: rr(0, TAU), f: rr(0.05, 0.15) })); },
    tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) { for (const q of this.p) O.put(((q.x + 0.04 * Math.sin(this.t * q.f + q.p)) * M.G.cols) | 0, ((q.y + 0.05 * Math.sin(this.t * q.f * 0.7 + q.p * 3)) * M.G.rows) | 0, 46, 0.5 + 0.5 * Math.sin(this.t + q.p) > 0.6 ? 3 : 2); },
  });
  L.steam = () => ({ // steam curling off a cup
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G, cx = cols * 0.66, base = Math.round(rows * 0.78);
      for (let c = Math.round(cx - 3); c <= Math.round(cx + 3); c++) { O.put(c, base, 95, 2); O.put(c, base - 1, c === Math.round(cx - 3) || c === Math.round(cx + 3) ? 124 : 32, 2); }
      O.put(Math.round(cx + 4), base - 1, 41, 2);
      for (let k = 0; k < 3; k++) for (let h = 2; h < rows * 0.22; h++) {
        const x = cx - 1.5 + k * 1.5 + 1.6 * Math.sin(h * 0.35 - this.t * 1.4 + k * 2) * (h / 10);
        const a = 1 - h / (rows * 0.22);
        if (a * noise(k * 9 + h * 0.3 - this.t, 1) > 0.25) O.put(x | 0, base - h, a > 0.6 ? 126 : 46, a > 0.6 ? 2 : 1);
      }
    },
  });
  L.sand = () => ({ init() {}, tick(dt, M) { this.t = (this.t || 0) + dt; }, paint(B, O, M) { const { cols, rows } = M.G; for (let k = 0; k < cols * 0.15; k++) { const c = ((hash(k, 1) * cols + this.t * (6 + 12 * hash(k, 2))) % cols) | 0; const r = (rows * (0.62 + 0.35 * hash(k, 3))) | 0; O.put(c, r, 45, 1); } } });
  L.rake = (o) => ({ // raked gravel and a few stones
    init(G) { this.st = [[0.3, 0.8, 0.07], [0.62, 0.75, 0.045], [0.72, 0.86, 0.03]]; },
    tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G, y0 = Math.floor(o.y * rows);
      for (let r = y0; r < rows; r++) for (let c = 0; c < cols; c++) { B[r * cols + c] = 0.12 + 0.1 * (r - y0) / (rows - y0); O.clear(c, r); }
      for (let r = y0; r < rows; r++) for (let c = 0; c < cols; c++) {
        let ring = 99;
        for (const s of this.st) ring = Math.min(ring, Math.hypot((c - s[0] * cols) * aspect, (r - s[1] * rows) * 1.6) - s[2] * rows);
        const lineOn = ring < 6 ? Math.abs(Math.sin(ring * 1.1)) > 0.85 : (r - y0) % 2 === 0;
        if (ring > 0 && lineOn) O.put(c, r, ring < 6 ? 46 : 126, ring < 6 ? 2 : 1);
      }
      for (const s of this.st) disc(B, M.G, s[0] * cols, s[1] * rows, s[2] * rows, 0.8, -0.6, -0.6);
    },
  });

  // ── fire: tongues in three ranks, sparks from their tips, a bed of coals and logs ──
  // The fire stands low in the middle (under the guitar) and tall on both sides. A tongue is a centre line that
  // bends more the higher it goes, its S travelling upward, with a waist that pulses; hottest low in its core,
  // cooling to its edges and tip. Its length licks up and down, and now and then a piece of tip tears off and rises.
  L.fire = (o = {}) => ({
    init(G) {
      const { cols, rows } = G;
      this.bed = rows > 40 ? 2 : 1;
      this.gr = rows - this.bed;
      const k = (this.k = clamp(rows / 56, 0.5, 1.6));
      this.ENV = new Float32Array(cols);
      for (let c = 0; c < cols; c++) {
        const d = Math.abs(c - cols / 2) / cols; // 0 centre … 0.5 edge
        const e = sstep(0.1, 0.32, d), edge = sstep(0.4, 0.52, d);
        this.ENV[c] = o.narrow ? rows * 0.52 * (1 - sstep(0.06, 0.22, d)) : rows * (0.16 + 0.5 * e) * (1 - 0.15 * edge) * (c < cols / 2 ? 1.03 : 0.97);
      }
      this.T = [];
      const rank = (sp, wA, wB, lA, lB, hot) => { for (let x = -sp * rr(0, 1); x < cols + sp; x += sp * rr(0.8, 1.2)) this.T.push({ x, w: rr(wA, wB) * k, len: rr(lA, lB), hot, sa: rr(1.4, 2.8) * k, ph: rr(0, TAU), f: rr(0.6, 1.4), s: rr(0, 100) }); };
      rank(11 * k, 3.4, 4.8, 0.85, 1.1, 0.95);  // tall, behind
      rank(12 * k, 3.2, 4.6, 0.5, 0.75, 1.05);  // middle
      rank(16 * k, 2.6, 3.6, 0.26, 0.42, 1.1);  // short, in front
      this.sp = [];
      this.bits = [];
      if (this.z == null) { this.z = rr(0, 100); this.lv = 0.8; this.lean = 0; this.flare = 0; this.gust = 0; this.lull = 1; this.next = rr(20, 50); }
      // logs and coals
      this.logs = (o.narrow ? [-0.15, -0.06, 0.03, 0.1] : [-0.38, -0.2, 0.02, 0.24, 0.4]).map((a) => ({ c: Math.round(cols * (0.5 + a) + rr(-3, 3)), w: Math.round(rr(8, 14) * k) }));
      this.ready = true;
    },
    tick(dt, M) {
      const { cols } = M.G;
      this.t = (this.t || 0) + dt;
      // rare events: a gust lays the flames over, a log settles (flare + a fountain of sparks), or the fire dies down a while
      this.next -= dt;
      if (this.next < 0) {
        const e = Math.random();
        if (e < 0.4) this.gust = (Math.random() < 0.5 ? -1 : 1) * rr(1, 1.8);
        else if (e < 0.8) { this.flare = 1; for (let i = 0; i < 30; i++) this.spark(M, true); }
        else this.lull = 0.55;
        this.next = rr(20, 60);
      }
      this.gust *= Math.exp(-dt * 0.8);
      this.lull += (1 - this.lull) * dt * 0.08;
      this.flare = Math.max(0, this.flare - dt * 0.35);
      if (M.beat > 0.85) this.flare = Math.min(1, this.flare + 0.12 * M.go); // the kick drum fans it
      const want = (0.5 + 0.55 * M.go + 0.15 * M.level) * this.lull * (1 + 0.3 * this.flare);
      this.lv += (want - this.lv) * Math.min(1, dt * 0.9);
      this.br = 1 + 0.16 * (noise(this.t * 0.2, 5) - 0.5) + 0.08 * (noise(this.t * 0.9, 9) - 0.5);
      this.z += dt * (2.4 + 3.4 * M.go + 2 * this.flare);
      const wl = (noise(this.t * 0.06, 2) - 0.5) * 1.1 + 0.3 * (noise(this.t * 0.35, 4) - 0.5);
      this.lean += (wl + this.gust - this.lean) * Math.min(1, dt * 1.8);
      // sparks: a thin steady stream, more on the beat and in a flare
      this.owe = (this.owe || 0) + dt * (2 + 9 * M.go * M.go + 14 * M.beat * M.go + 18 * this.flare) * (cols / 160) * this.lull;
      while (this.owe >= 1) { this.owe -= 1; this.spark(M, false); }
      for (const p of this.sp) {
        p.age += dt;
        p.r += p.vy * dt; p.vy *= Math.exp(-dt * 0.25);
        p.c += (p.vx + Math.sin(p.age * p.f * 3 + p.p) * p.amp + this.lean * 1.5) * dt;
      }
      this.sp = this.sp.filter((p) => p.age < p.life && p.r > -1);
      for (const b of this.bits) { b.age += dt; b.r -= dt * b.v; }
      this.bits = this.bits.filter((b) => b.age < b.life);
    },
    spark(M, big) {
      const { cols } = M.G;
      for (let tries = 0; tries < 6; tries++) {
        const c = rr(0, cols);
        if (Math.random() * M.G.rows * 0.66 > this.ENV[c | 0]) continue; // from where the fire stands tall
        const top = this.gr - this.ENV[c | 0] * this.lv * rr(0.4, 0.9);
        this.sp.push({ c, r: top, vx: rr(-1, 1), vy: -rr(4, 9) * this.k * (big ? 1.5 : 1) * (0.7 + 0.5 * M.go), age: 0, life: rr(1.8, 5.5), amp: rr(0.5, 2), f: rr(0.8, 2), p: rr(0, TAU) });
        return;
      }
    },
    paint(B, O, M) {
      const { cols, rows } = M.G, gr = this.gr, z = this.z, t = this.t, lv = this.lv * this.br;
      // the glow of the body low down, between the tongues
      for (let r = 0; r < gr; r++) {
        const h0 = gr - r;
        for (let c = 0; c < cols; c++) {
          const hb = this.ENV[c] * lv * 0.3;
          if (h0 > hb * 2.5) continue;
          const v = 0.85 * Math.exp(-h0 / Math.max(0.5, hb)) * (0.75 + 0.5 * noise(c * 0.2, r * 0.3 - z * 0.5));
          if (v < 0.12) continue;
          const i = r * cols + c; if (v > B[i]) B[i] = v;
        }
      }
      // the tongues
      for (const T of this.T) {
        const xc = clamp(T.x | 0, 0, cols - 1);
        const lick = 0.78 + 0.32 * noise(t * 0.7 * T.f + T.s, 1.7) + 0.1 * Math.sin(t * 4 * T.f + T.ph);
        const Lr = this.ENV[xc] * T.len * lv * lick;
        if (Lr < 1) continue;
        for (let r = gr - 1; r >= Math.max(0, gr - Lr); r--) {
          const h = (gr - r) / Lr; // 0 base … 1 tip
          const cx = T.x + this.lean * h * h * Lr * 0.12 + T.sa * Math.pow(h, 1.3) * Math.sin((gr - r) * 0.2 / this.k - z * 0.9 + T.ph) + 0.6 * Math.sin(t * 6 * T.f + h * 4);
          const wv = T.w * Math.pow(1 - h, 0.5) * (0.85 + 0.2 * Math.sin(t * 3.1 * T.f + h * 6 + T.ph)) * (h < 0.08 ? 0.75 + h * 3 : 1);
          if (wv < 0.2) continue;
          const core = 0.55 + 0.45 * (1 - h);
          for (let c = Math.max(0, Math.floor(cx - wv)); c <= Math.min(cols - 1, Math.ceil(cx + wv)); c++) {
            const d = Math.abs(c + 0.5 - cx) / wv;
            if (d >= 1) continue;
            const tex = 0.78 + 0.44 * noise(c * 0.32, r * 0.42 - z * 0.75);
            const v = 1.1 * T.hot * core * Math.pow(1 - d * d, 0.5) * (1 - 0.55 * Math.pow(h, 2)) * tex;
            const i = r * cols + c; if (v > B[i]) B[i] = v;
          }
          // a tip tears off now and then
          if (h > 0.96 && Math.random() < 0.004 * (1 + 2 * this.flare)) this.bits.push({ c: cx, r, v: rr(3, 6), age: 0, life: rr(0.4, 0.9), w: wv + 0.8 });
        }
      }
      for (const b of this.bits) {
        const a = 1 - b.age / b.life;
        for (let c = Math.floor(b.c - b.w); c <= Math.ceil(b.c + b.w); c++) { const i = Math.round(b.r) * cols + c; if (c >= 0 && c < cols && b.r >= 0 && B[i] < 0.5 * a) B[i] = 0.5 * a; }
      }
      // sparks
      for (const p of this.sp) {
        const a = 1 - p.age / p.life;
        O.put(p.c | 0, p.r | 0, a > 0.75 ? 42 : a > 0.5 ? (p.p > 3 ? 94 : 43) : a > 0.25 ? 39 : 46, a > 0.6 ? 3 : a > 0.3 ? 2 : 1);
      }
      // the bed: round coals that crawl with light, and logs lying in it
      const COAL = [111, 48, 64, 79];
      for (let r = gr; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (o.narrow && Math.abs(c - cols / 2) > cols * 0.2) continue;
        const heat = noise(c * 0.25 + t * 0.15, r * 0.9 + t * 0.4) * (0.6 + 0.5 * this.lv);
        O.put(c, r, COAL[(hash(c, r) * 4) | 0], heat > 0.62 ? 3 : heat > 0.42 ? 2 : 1);
      }
      for (const g of this.logs) {
        const r = gr - 1;
        for (let k = 0; k <= g.w; k++) {
          const c = g.c + k, ember = noise(c * 0.5, t * 0.6) > 0.66;
          O.put(c, r, k === 0 ? 40 : k === g.w ? 41 : ember ? 35 : 61, ember ? 3 : 1);
        }
      }
    },
  });

  // ── redesigned scenes (Nov 2026): helpers ──
  const KOI = ["><>", "><('>", "><((('>", "><((((((('>"];
  const CAMEL = [['  .--._ _  ', ' (      `o)', '  || ||    '], ['  .--._ _  ', ' (      `o)', '  /\\ /\\    ']];
  function stamp(O, c, r, lines, t) {
    for (let j = 0; j < lines.length; j++) { const ln = lines[j]; for (let i = 0; i < ln.length; i++) { const ch = ln[i]; if (ch !== ' ') O.put(Math.round(c + i), Math.round(r + j), ch.charCodeAt(0), t); } }
  }
  function glowAt(B, G, cx, cy, rad, amt) { // a soft round glow; rad in rows
    const { cols, rows, aspect } = G;
    const r0 = Math.max(0, Math.floor(cy - rad * 3)), r1 = Math.min(rows - 1, Math.ceil(cy + rad * 3));
    const c0 = Math.max(0, Math.floor(cx - rad * 3 / aspect)), c1 = Math.min(cols - 1, Math.ceil(cx + rad * 3 / aspect));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d = Math.hypot((c - cx) * aspect, r - cy) / rad, v = amt * Math.exp(-d * d * 0.5);
      const i = r * cols + c; if (v > B[i]) B[i] = v;
    }
  }
  function glyph(dx, dy, aspect) { const a = Math.abs(Math.atan2(dy, dx * aspect) * 180 / Math.PI) % 180; return a < 22 || a > 158 ? 45 : a > 68 && a < 112 ? 124 : dx * dy > 0 ? 92 : 47; }
  function seg(O, G, c0, r0, c1, r1, t, ch) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)))), g = ch || glyph(c1 - c0, r1 - r0, G.aspect);
    for (let i = 0; i <= n; i++) O.put(Math.round(c0 + (c1 - c0) * i / n), Math.round(r0 + (r1 - r0) * i / n), g, t);
  }
  const PERSON = [[' o ', '/|\\', ' | ', '/ \\'], [' o ', '/|\\', ' | ', ' | '], [' o ', '/|\\', ' | ', '| \\']];
  const walker = (t, x) => PERSON[[0, 1, 2, 1][Math.floor(t * 3 + x * 0.37) & 3]];

  // a layered pine: tiers with / \ edges and a ^ tip; off(k) sways it sideways at height fraction k; lit(c, r) adds firelight
  function pine(B, O, G, x, base, h, fill, t, off, lit) {
    const { cols, rows, aspect } = G, sc = rows / 44;
    const tiers = Math.max(3, Math.round(h / (6 * sc))), trunk = h * 0.12, top = base - h;
    for (let k = 0; k < tiers; k++) {
      const ty0 = top + k * (h - trunk) / tiers * 0.85, th = (h - trunk) / tiers * 1.5;
      for (let j = 0; j < th; j++) {
        const r = Math.floor(ty0 + j); if (r < 0 || r >= rows) continue;
        const xo = x + off((base - r) / h), w = (1 + (j / th) * (2.2 + k * 1.6) * sc) / aspect * 0.55;
        const c0 = Math.ceil(xo - w), c1 = Math.floor(xo + w);
        for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
          const i = r * cols + c;
          B[i] = fill + 0.12 * noise(c * 0.5, r * 0.5) + (c > xo ? 0.2 : 0) + (lit ? lit(c, r) : 0); O.clear(c, r);
        }
        O.put(Math.round(xo - w), r, 47, t); O.put(Math.round(xo + w), r, 92, Math.min(3, t + 1));
        if (j >= th - 1) for (let c = c0; c <= c1; c++) O.put(c, r, c & 1 ? 94 : 95, t);
      }
    }
    O.put(Math.round(x + off(1)), Math.floor(top) - 1, 94, 3);
    for (let r = Math.floor(base - trunk); r < base; r++) { O.put(Math.round(x), r, 124, 1); O.put(Math.round(x) + 1, r, 124, 1); }
  }
  L.pines = (o) => ({
    init(G) {
      const { cols, rows } = G;
      if (o.list) this.T = o.list.map(([x, h], k) => ({ x: x * cols, h: h * rows, p: k * 1.7 }));
      else { this.T = []; for (let x = -4; x < cols + 6; x += o.auto * rows / 44 * rr(0.85, 1.15)) this.T.push({ x: x + rr(-2, 2), h: rr(o.h[0], o.h[1]) * rows, p: rr(0, TAU) }); }
    },
    tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const G = M.G, base = o.y * G.rows, t = this.t, gust = 0.6 + 0.8 * noise(t * 0.12, 7), mid = G.cols / 2;
      const flick = 0.85 + 0.15 * noise(t * 1.2, 1);
      const lit = o.lit ? (c, r) => 0.4 * flick * Math.exp(-Math.abs(c - mid) / (G.cols * 0.25)) * Math.max(0, (r - G.rows * 0.3) / G.rows) : null;
      O.markOn = o.fixed ? 255 : 0; // 255: keep the scene's own colour in a multicolour scene
      for (const T of this.T) pine(B, O, G, T.x, base, T.h, o.fill, o.t, (k) => (o.sway || 0) * gust * k * k * T.h * 0.07 * Math.sin(t * 0.7 + T.p), lit);
      O.markOn = 0;
    },
  });
  // a drifting band of mist
  L.mist = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G, y = o.y * rows, amt = o.amt ?? 0.3, w = rows * 0.05;
      for (let r = Math.max(0, Math.floor(y - w * 4)); r < Math.min(rows, y + w * 4); r++) {
        const e = amt * Math.exp(-Math.abs(r - y) / w);
        for (let c = 0; c < cols; c++) { const v = e * (0.45 + 0.75 * noise(c * 0.06 - this.t * 0.25, r * 0.3 + this.t * 0.03)); const i = r * cols + c; if (v > B[i]) B[i] = v; }
      }
    },
  });
  // grass blades that lean with the wind
  L.grass = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G, base = Math.floor(o.y * rows), t = this.t;
      for (let r = base; r < rows; r++) for (let c = 0; c < cols; c++) { B[r * cols + c] = 0.1 + 0.04 * noise(c * 0.2, r); O.clear(c, r); }
      for (let c = 0; c < cols; c++) {
        O.put(c, base, c % 4 ? 34 : 44, 2);
        const h = 1 + Math.floor(hash(c, 5) * 3), s = Math.sin(t * 1.3 - c * 0.12) + 0.6 * (noise(c * 0.05 - t * 0.3, 2) - 0.5);
        const ch = s > 0.35 ? 47 : s < -0.35 ? 92 : 124;
        for (let k = 0; k < h; k++) O.put(c, base - 1 - k, ch, k < 1 ? 1 : 2);
      }
    },
  });
  // fireflies: wandering points that blink
  L.fireflies = (o) => ({
    init(G) { this.p = Array.from({ length: o.n }, () => ({ x: rr(o.x[0], o.x[1]), y: rr(o.y[0], o.y[1]), p: rr(0, TAU), f: rr(0.6, 1.4), s: rr(0, 100) })); },
    tick(dt) {
      this.t = (this.t || 0) + dt;
      for (const q of this.p) {
        q.x += (noise(this.t * 0.2, q.s) - 0.5) * dt * 0.05; q.y += (noise(q.s, this.t * 0.2) - 0.5) * dt * 0.06;
        q.x = clamp(q.x, o.x[0], o.x[1]); q.y = clamp(q.y, o.y[0], o.y[1]); if (q.x <= o.x[0] || q.x >= o.x[1] || q.y <= o.y[0] || q.y >= o.y[1]) q.s += 37; // turn back at the edge
      }
    },
    paint(B, O, M) {
      const { cols, rows } = M.G;
      for (const q of this.p) {
        const b = Math.pow(Math.max(0, Math.sin(this.t * q.f + q.p)), 3), c = q.x * cols, r = q.y * rows;
        if (b > 0.5) { glowAt(B, M.G, c, r, 0.9, 0.4 * b); O.put(c | 0, r | 0, 42, 3); }
        else O.put(c | 0, r | 0, b > 0.15 ? 43 : 46, b > 0.15 ? 2 : 1);
      }
    },
  });
  // a small forest pond: ripples, reeds swaying at its ends, a lily pad
  L.gpond = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows } = M.G, t = this.t, cx = o.x * cols, cy = o.y * rows, rx = o.rx * cols, ry = o.ry * rows;
      for (let r = Math.max(0, Math.floor(cy - ry * 1.3)); r < Math.min(rows, cy + ry * 1.3); r++) for (let c = Math.max(0, Math.floor(cx - rx * 1.2)); c < Math.min(cols, cx + rx * 1.2); c++) {
        const e = ((c - cx) / rx) ** 2 + ((r - cy) / ry) ** 2, i = r * cols + c;
        if (e < 1) {
          const top = cy - ry * Math.sqrt(Math.max(0, 1 - ((c - cx) / rx) ** 2)), src = Math.floor(top - (r - top) * 1.1 - 1), cc = Math.round(c + 1.5 * Math.sin(r * 0.9 + t * 0.9));
          const refl = src >= 0 && cc >= 0 && cc < cols ? B[src * cols + cc] : 0;
          B[i] = 0.1 + 0.08 * noise(c * 0.15 + t * 0.1, r * 0.5) + 0.5 * refl * (0.75 + 0.25 * Math.sin(c * 0.3 + t)); O.clear(c, r);
          const d = (r - (cy - ry)) / (2 * ry), ph = c * 0.22 / (0.4 + d) + t * 0.9 + 3 * noise(c * 0.04, r * 0.7 + t * 0.08);
          B[i] += 0.22 * Math.pow(0.5 + 0.5 * Math.sin(ph), 3) * (0.4 + d);
          if (Math.sin(ph) > 0.95 && d > 0.15) O.put(c, r - 1 >= cy - ry ? r : r, 126, 1);
        } else if (e < 1.3) { B[i] = 0.1; O.clear(c, r); if (hash(c, r) > 0.6) O.put(c, r, hash(r, c) > 0.5 ? 44 : 46, 1); }
      }
      stamp(O, cx - rx * 0.4, cy + ry * 0.25, ['(_)'], 1); O.put(Math.round(cx - rx * 0.4 + 1), Math.round(cy + ry * 0.25) - 1, 42, 3);
      stamp(O, cx + rx * 0.35, cy - ry * 0.2, ['(__)'], 1); stamp(O, cx + rx * 0.5, cy + ry * 0.45, ['(_)'], 1);
      for (const [side, n] of [[-1, 4], [1, 3]]) for (let k = 0; k < n; k++) { // reeds and cattails
        const c = Math.round(cx + side * (rx * 0.95 + k * 1.6)), h = 3 + ((k * 7) % 3), sw = Math.sin(t * 1.1 + k + side);
        for (let j = 0; j < h; j++) O.put(c + (j > h - 2 && Math.abs(sw) > 0.5 ? Math.sign(sw) : 0), Math.round(cy) - j, j === h - 1 ? 48 : sw > 0.5 && j > 0 ? 47 : sw < -0.5 && j > 0 ? 92 : 124, j === h - 1 ? 2 : 1);
      }
    },
  });
  L.haze = () => ({ init() {}, tick(dt) { this.t = (this.t || 0) + dt; }, paint(B, O, M) { const { cols, rows } = M.G; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = 0.12 + 0.15 * fbm(c * 0.03 + this.t * 0.03, r * 0.1); const i = r * cols + c; if (v > B[i]) B[i] = v; } } });
  // snow driven sideways in gusts
  L.blizzard = () => ({
    init(G) { this.p = Array.from({ length: Math.round(G.cols * G.rows * 0.035) }, () => ({ c: rr(0, G.cols), r: rr(0, G.rows), v: rr(10, 26), s: Math.random(), p: rr(0, TAU) })); },
    tick(dt, M) {
      this.t = (this.t || 0) + dt;
      this.w = (0.55 + 0.9 * noise(this.t * 0.15, 3)) * (0.85 + 0.3 * M.go) * (M.G.cols / 120);
      for (const p of this.p) {
        p.c += p.v * this.w * dt; p.r += (p.v * 0.12 + Math.sin(this.t * 2 + p.p) * 1.5) * dt;
        if (p.c > M.G.cols || p.r > M.G.rows) { p.c = rr(-10, 0); p.r = rr(-2, M.G.rows); }
      }
    },
    paint(B, O, M) {
      for (const p of this.p) {
        const sp = p.v * this.w, t = p.s > 0.8 ? 3 : p.s > 0.5 ? 2 : 1;
        O.put(p.c | 0, p.r | 0, sp > 22 ? 45 : sp > 14 ? 126 : 46, t);
        if (sp > 22 && t > 1) O.put((p.c - 1) | 0, p.r | 0, 45, t - 1);
      }
    },
  });
  // lava-lamp blobs: soft shapes that drift, swell and merge
  L.nebula = () => ({
    init() { this.b = Array.from({ length: 8 }, (_, k) => ({ px: rr(0, TAU), py: rr(0, TAU), fx: rr(0.025, 0.06), fy: rr(0.02, 0.05), r: rr(0.08, 0.15), pr: rr(0, TAU), fr: rr(0.1, 0.25), ax: rr(0.25, 0.42), ay: rr(0.25, 0.4) })); },
    tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G, t = this.t;
      const P = this.b.map((q) => ({ x: (0.5 + q.ax * Math.sin(t * q.fx + q.px)) * cols * aspect, y: (0.5 + q.ay * Math.sin(t * q.fy + q.py)) * rows, R2: Math.pow(q.r * rows * (1 + 0.3 * Math.sin(t * q.fr + q.pr)), 2) }));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = c * aspect;
        let f = 0; for (const p of P) { const dx = x - p.x, dy = r - p.y; f += p.R2 / (dx * dx + dy * dy + 0.5); }
        const tex = 0.85 + 0.3 * noise(c * 0.07 + t * 0.03, r * 0.14 - t * 0.02);
        const v = (f < 1 ? 0.3 * f * f : 0.3 + 0.5 * Math.min(1, (f - 1) * 0.6)) * tex * (0.9 + 0.2 * M.level);
        const i = r * cols + c; if (v > B[i]) B[i] = v;
      }
    },
  });
  // northern lights seen from below: rays fanning out from a point overhead, turning slowly
  L.corona = () => ({
    init() {}, tick(dt, M) { this.t = (this.t || 0) + dt * (0.6 + 0.6 * M.go); },
    paint(B, O, M) {
      const { cols, rows, aspect } = M.G, t = this.t, cx = cols / 2, cy = rows * 0.35, k = 44 / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const dx = (c - cx) * aspect * k, dy = (r - cy) * k, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
        const rays = Math.pow(0.5 + 0.5 * Math.sin(ang * 14 + Math.sin(d * 0.2 - t * 0.5) * 2 + t * 0.06), 3) * noise(Math.cos(ang) * 2.5 + 5 + t * 0.04, Math.sin(ang) * 2.5 + t * 0.03);
        const v = clamp(rays * 1.3 * Math.exp(-d / 30) * clamp(d / 4, 0, 1) * (0.85 + 0.35 * M.level), 0, 1);
        const i = r * cols + c; if (v > B[i]) B[i] = v;
      }
    },
  });
  // jellyfish: domes that pulse and push upward, tentacles trailing
  L.jelly = (o) => ({
    init(G) { this.J = Array.from({ length: o.n }, (_, k) => ({ x: (0.06 + 0.88 * (k + rr(0, 0.6)) / o.n) * G.cols, y: rr(0.15, 0.9) * G.rows, s: rr(0.6, 1.3) * (o.far || 1), ph: rr(0, TAU), f: rr(0.8, 1.3) })); },
    tick(dt, M) {
      this.t = (this.t || 0) + dt;
      for (const j of this.J) {
        const push = Math.max(0, Math.sin(this.t * j.f + j.ph));
        j.y -= dt * (0.25 + 1.3 * push) * j.s * (0.7 + 0.5 * M.go) * (M.G.rows / 44);
        j.x += Math.sin(this.t * 0.1 + j.ph) * dt * 0.5;
        if (j.y < -10) { j.y = M.G.rows + 6; j.x = rr(0.1, 0.9) * M.G.cols; }
      }
    },
    paint(B, O, M) {
      const G = M.G, { cols, rows, aspect } = G, k = rows / 44, t = this.t;
      for (const j of this.J) {
        const p = 0.5 + 0.5 * Math.sin(t * j.f + j.ph), R0 = 3 * j.s * k, rx = R0 * (1.05 + 0.2 * (1 - p)), ry = R0 * (0.75 + 0.3 * p);
        glowAt(B, G, j.x, j.y - ry * 0.4, R0 * 1.3, o.far ? 0.18 : 0.3);
        for (let r = Math.max(0, Math.floor(j.y - ry)); r <= Math.min(rows - 1, Math.floor(j.y)); r++)
          for (let c = Math.max(0, Math.floor(j.x - rx / aspect)); c <= Math.min(cols - 1, Math.ceil(j.x + rx / aspect)); c++) {
            const dx = (c + 0.5 - j.x) * aspect / rx, dy = (r + 0.5 - j.y) / ry, d2 = dx * dx + dy * dy;
            if (d2 >= 1) continue;
            const v = (d2 > 0.7 ? 0.72 : 0.3 + 0.25 * (1 - d2) - 0.1 * dy) * (o.far ? 0.6 : 1), i = r * cols + c; if (v > B[i]) B[i] = v;
          }
        for (let i = 0; i < (o.far ? 3 : 5); i++) {
          const sx = j.x + (i - (o.far ? 1 : 2)) * rx / aspect * 0.4, len = 7 * j.s * k * (0.9 + 0.2 * (1 - p));
          for (let s = 1; s < len; s++) {
            const w = Math.sin(s * 0.7 - t * 2.2 + i * 1.3 + j.ph);
            O.put(Math.round(sx + w * (s / len) * 1.6), Math.round(j.y + s), w > 0 ? 41 : 40, o.far ? 1 : s < len * 0.4 ? 2 : 1);
          }
        }
      }
    },
  });
  // a night window: the moon, clouds sailing past, a branch swaying across the glass
  L.nightwin = () => ({
    init() {}, tick(dt, M) { this.t = (this.t || 0) + dt * (0.8 + 0.4 * M.go); },
    paint(B, O, M) {
      const G = M.G, { cols, rows } = G, t = this.t;
      const x0 = Math.round(cols * 0.07), x1 = Math.round(cols * 0.93), y0 = Math.round(rows * 0.07), y1 = Math.round(rows * 0.8);
      disc(B, G, cols * 0.63, rows * 0.28, rows * 0.1, 0.85, -0.6, -0.5);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c, inside = c > x0 && c < x1 && r > y0 && r < y1;
        if (!inside) { B[i] = r > y1 + 1 ? 0.1 + 0.04 * noise(c * 0.1, r) : 0.05 + 0.03 * noise(c * 0.08, r * 0.1); O.clear(c, r); continue; }
        const n = fbm(c * 0.035 - t * 0.05, r * 0.16 + t * 0.004);
        if (n > 0.5) { const v = (n - 0.43) * 1.2 * (1 + 0.8 * Math.exp(-Math.hypot((c - cols * 0.63) * G.aspect, r - rows * 0.28) / (rows * 0.15))); if (v > B[i]) B[i] = v; if (n > 0.56) O.clear(c, r); }
      }
      for (let c = x0; c <= x1; c++) { O.put(c, y0, 61, 1); O.put(c, y1, 61, 2); O.put(c, (y0 + y1) >> 1, 45, 1); O.put(c, y1 + 1, 95, 2); }
      for (let r = y0; r <= y1; r++) { O.put(x0, r, 124, 1); O.put(x1, r, 124, 1); O.put((x0 + x1) >> 1, r, 124, 1); }
      // the branch, from the top right corner, swaying with the wind
      const sway = 0.5 * Math.sin(t * 0.6) + 0.5 * (noise(t * 0.3, 4) - 0.5) * 2, L0 = cols * 0.32;
      const pt = (k) => [x1 - 1 - k, y0 + 1.5 + k * 0.22 + sway * k * k * 0.0035 * (44 / rows) * (rows / 44)];
      let prev = pt(0);
      for (let k = 1; k <= L0; k++) { const p = pt(k); seg(O, G, prev[0], prev[1], p[0], p[1], 2); prev = p; }
      for (const [k, d, len] of [[L0 * 0.3, -1, 5], [L0 * 0.55, 1, 4], [L0 * 0.8, -1, 4], [L0, 1, 3]]) {
        const [bx, by] = pt(k), s2 = sway * 0.6;
        const ex = bx - len * 1.2, ey = by + d * len * 0.5 + s2 * len * 0.3;
        seg(O, G, bx, by, ex, ey, 2);
        for (let q = 0; q < 3; q++) O.put(Math.round(ex - 1 + q + Math.sin(t * 3 + k + q) * 0.6), Math.round(ey + (q - 1) * 0.5), q === 1 ? 64 : 38, q === 1 ? 3 : 2);
      }
    },
  });
  // a wet street: headlights sliding past, their glow smeared down the road, umbrellas walking by
  L.street = () => ({
    init(G) {
      this.cars = Array.from({ length: 3 }, (_, k) => ({ x: rr(0, G.cols), dir: k % 2 ? -1 : 1, v: rr(9, 14) * G.cols / 120 }));
      this.ppl = Array.from({ length: 3 }, (_, k) => ({ x: rr(0, G.cols), dir: k % 2 ? -1 : 1, v: rr(1.5, 2.6) * G.cols / 120 }));
    },
    tick(dt, M) {
      this.t = (this.t || 0) + dt; const W = M.G.cols + 30, go = 0.6 + 0.6 * M.go;
      for (const q of this.cars) { q.x += q.dir * q.v * dt * go; if (q.x > W) q.x = -30; if (q.x < -30) q.x = W; }
      for (const q of this.ppl) { q.x += q.dir * q.v * dt; if (q.x > W) q.x = -10; if (q.x < -10) q.x = W; }
    },
    paint(B, O, M) {
      const G = M.G, { cols, rows } = G, gy = Math.floor(rows * 0.62), walk = gy + 2, laneA = Math.floor(rows * 0.76), laneB = Math.floor(rows * 0.9);
      for (let r = gy; r < rows; r++) for (let c = 0; c < cols; c++) { B[r * cols + c] = r <= walk ? 0.09 : 0.05 + 0.03 * noise(c * 0.1, r * 0.5); O.clear(c, r); }
      for (let c = 0; c < cols; c++) { O.put(c, gy, 95, 1); O.put(c, walk + 1, 61, 1); if ((c >> 2) % 2) O.put(c, Math.floor((laneA + laneB) / 2), 45, 1); }
      for (const q of this.cars) {
        const row = q.dir > 0 ? laneA : laneB, front = q.dir > 0 ? q.x + 12 : q.x;
        stamp(O, q.x, row - 3, q.dir > 0 ? ['   ____     ', ' _/__|_\\__  ', '|_  ___   O>', '  (_)  (_)  '] : ['    ____    ', '  __/_|__\\_ ', '<O   ___  _|', '  (_)  (_)  '], 2);
        glowAt(B, G, front, row - 1, 0.9, 0.85);
        const L = Math.round(cols * 0.16);
        for (let k = 1; k <= L; k++) { // the beam: a narrow cone of light ahead, fading with distance
          const c = Math.round(front + q.dir * k), wv = 0.4 + k * 0.12, a = 0.9 * Math.pow(1 - k / L, 0.8) * (0.9 + 0.1 * Math.sin(this.t * 9 + k));
          for (let r = Math.floor(row - 1 - wv * 0.6); r <= Math.ceil(row - 1 + wv); r++) {
            if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
            const v = a * Math.exp(-Math.pow((r - (row - 1 + wv * 0.25)) / Math.max(0.6, wv), 2)), i = r * cols + c; if (v > B[i]) B[i] = v;
          }
        }
        for (let k = 1; k < 4; k++) O.put(Math.round(front + Math.sin(k + this.t * 4) * 0.5), row + k, k < 2 ? 124 : 58, k < 2 ? 2 : 1); // a short reflection
      }
      for (const q of this.ppl) stamp(O, q.x, walk - 3, walker(this.t, q.x), 2);
    },
  });
  // the night-drive roadside: palms and streetlamps coming toward you
  L.roadside = (o = {}) => ({
    init(G) { this.P = Array.from({ length: 12 }, (_, k) => ({ z: 1 + k * 1.1, side: k % 2 ? 1 : -1, kind: (k >> 1) % 2 ? 'lamp' : 'palm' })); },
    tick(dt, M) { const sp = (1.2 + 1.4 * M.go) * (o.speed || 0.6); for (const p of this.P) { p.z -= dt * sp; if (p.z < 0.85) p.z += 13.2; } },
    paint(B, O, M) {
      const G = M.G, { cols, rows, aspect } = G, hor = Math.floor(rows * 0.56), mid = cols / 2;
      for (const p of [...this.P].sort((a, b) => b.z - a.z)) {
        const d = 1 / p.z, base = hor + d * (rows - hor) - 1, x = mid + p.side * (p.kind === 'lamp' ? 0.5 : 0.7) * d * cols * 0.5, h = d * rows * (p.kind === 'lamp' ? 0.6 : 0.8);
        if (d > 0.9) continue;
        if (d < 0.22) { O.put(Math.round(x), Math.round(base), 46, 1); continue; }
        if (p.kind === 'lamp') {
          for (let r = Math.round(base - h); r <= base; r++) O.put(Math.round(x), r, 124, 1);
          const arm = Math.max(1, Math.round(h * 0.25 / aspect * 0.5));
          for (let k = 1; k <= arm; k++) O.put(Math.round(x - p.side * k), Math.round(base - h), 45, 1);
          glowAt(B, G, x - p.side * arm, base - h + 0.6, 0.5 + d * 2.5, 0.7); O.put(Math.round(x - p.side * arm), Math.round(base - h + 1), 111, 3);
        } else {
          let tx = x, ty = base;
          for (let j = 0; j < h; j++) { tx = x + p.side * Math.sin(j / h * 1.3) * h * 0.25; ty = base - j; O.put(Math.round(tx), Math.round(ty), j % 2 ? 40 : 124, 1); }
          const fl = Math.max(1, h * 0.38);
          for (let f = 0; f < 6; f++) {
            const ang = -Math.PI * (0.05 + 0.9 * f / 5);
            let px = tx, py = ty;
            for (let s = 1; s <= fl; s++) {
              const nx = tx + Math.cos(ang) * s / aspect * 0.6, ny = ty + Math.sin(ang) * s * 0.45 + s * s * 0.3 / fl;
              O.put(Math.round(nx), Math.round(ny), glyph(nx - px, ny - py, aspect), 2); px = nx; py = ny;
            }
          }
        }
      }
    },
  });
  // train window extras: trees right by the track whipping past, and birds flying alongside
  L.blurtrees = () => ({
    init() { this.x = rr(0, 100); }, tick(dt, M) { this.x += dt * 70 * (0.6 + 0.6 * M.go) * M.G.cols / 120; },
    paint(B, O, M) {
      const { cols, rows } = M.G, g = Math.floor(rows * 0.82), rail = Math.floor(rows * 0.9), sc = rows / 44;
      for (let r = g; r < rows; r++) for (let c = 0; c < cols; c++) { B[r * cols + c] = 0.13; O.clear(c, r); }
      for (let c = 0; c < cols; c++) {
        const X = c + this.x, k = Math.floor(X / 9);
        O.put(c, rail, 45, 2); O.put(c, g, 95, 1);
      }
    },
  });
  L.birds = () => ({
    init(G) { this.x = rr(0, G.cols); }, tick(dt, M) { this.t = (this.t || 0) + dt; this.x = (this.x + dt * 1.6 * M.G.cols / 120) % (M.G.cols + 40); },
    paint(B, O, M) {
      const { rows } = M.G, y = rows * 0.2 + Math.sin(this.t * 0.3) * 2;
      [[0, 0], [4, 1], [8, -1], [-3, 2], [11, 0.5]].forEach(([dx, dy], i) => O.put(Math.round(this.x - 20 + dx), Math.round(y + dy + Math.sin(this.t + i) * 0.4), (this.t * 3 + i * 0.37) % 1 < 0.5 ? 118 : 45, 3));
    },
  });
  // a beach: the foam line runs up the sand and slides back
  L.shore = () => ({
    init() {}, tick(dt, M) { this.t = (this.t || 0) + dt * (0.7 + 0.5 * M.go); },
    paint(B, O, M) {
      const { cols, rows } = M.G, t = this.t;
      for (let c = 0; c < cols; c++) {
        const sand = rows * 0.62 + (c / cols) * rows * 0.3 + 2 * Math.sin(c * 0.15);
        const wash = (rows / 44) * (3 * (0.5 + 0.5 * Math.sin(t * 0.5 + c * 0.02)) + 0.6 * Math.sin(t * 1.3 + c * 0.2));
        const foam = sand - wash;
        for (let r = Math.max(0, Math.floor(foam)); r < rows; r++) {
          const i = r * cols + c, wet = r < sand + 2;
          B[i] = wet ? 0.07 + 0.04 * noise(c * 0.3, r + t) : 0.14 + 0.08 * noise(c * 0.2, r * 0.4); O.clear(c, r);
          if (wet && r > foam + 1 && hash(c, r) > 0.9 && Math.sin(t * 0.8 + hash(r, c) * 40) > 0.3) O.put(c, r, 46, 2);
        }
        O.put(c, Math.floor(foam), 126, 3); O.put(c, Math.floor(foam) - 1, c % 3 ? 126 : 45, 2);
        if (noise(c * 0.3, t) > 0.6) O.put(c, Math.floor(foam) - 2, 46, 2);
      }
    },
  });
  // city traffic: two lanes of lights streaming each way, a plane blinking across the sky
  L.traffic = (o) => ({
    init(G) {
      this.cars = [];
      for (const dir of [1, -1]) for (let k = 0; k < 11; k++) this.cars.push({ dir, x: rr(0, G.cols), v: rr(10, 18) * G.cols / 120, len: Math.round(rr(3, 6)) });
    },
    tick(dt, M) { const W = M.G.cols + 10, go = 0.6 + 0.6 * M.go; for (const q of this.cars) { q.x += q.dir * q.v * dt * go; if (q.x > W) q.x = -10; if (q.x < -10) q.x = W; } },
    paint(B, O, M) {
      const G = M.G, { cols, rows } = G, y0 = Math.floor(o.y * rows), lA = Math.floor(y0 + (rows - y0) * 0.3), lB = Math.floor(y0 + (rows - y0) * 0.68), mid = Math.floor((lA + lB) / 2);
      for (let r = y0; r < rows; r++) for (let c = 0; c < cols; c++) { B[r * cols + c] = 0.06 + 0.03 * noise(c * 0.2, r); O.clear(c, r); }
      for (let c = 0; c < cols; c++) { O.put(c, y0, 95, 1); if (c % 6 < 3) O.put(c, mid, 45, 1); }
      for (const q of this.cars) {
        const row = q.dir > 0 ? lA : lB;
        for (let k = 0; k <= q.len; k++) {
          const c = Math.round(q.x - q.dir * k);
          if (q.dir > 0) O.put(c, row, k === 0 ? 111 : 61, k === 0 ? 3 : 1); else O.put(c, row, k === q.len ? 58 : 45, k === q.len ? 2 : 1);
        }
        if (q.dir > 0) glowAt(B, G, q.x + 1, row, 0.9, 0.55);
        O.put(Math.round(q.x), row + 1, 58, 1); // reflection on the road
      }
    },
  });
  L.plane = () => ({
    init(G) { this.x = rr(0, G.cols); }, tick(dt, M) { this.t = (this.t || 0) + dt; this.x -= dt * 2.2 * M.G.cols / 120; if (this.x < -6) this.x = M.G.cols + 6; },
    paint(B, O, M) { const r = Math.round(M.G.rows * 0.1 + this.x * 0.02); O.put(Math.round(this.x), r, this.t % 1.2 < 0.25 ? 42 : 46, this.t % 1.2 < 0.25 ? 3 : 1); O.put(Math.round(this.x) + 1, r, 45, 1); O.put(Math.round(this.x) + 2, r, 61, 1); },
  });
  L.shimmer = (o) => ({ init() {}, tick(dt) { this.t = (this.t || 0) + dt; }, paint(B, O, M) { const { cols, rows } = M.G, y = Math.floor(o.y * rows); for (let c = 0; c < cols; c++) for (const d of [0, 1]) if (noise(c * 0.3 + d * 9, this.t * 2) > 0.64) O.put(c, y + d, 126, 1); } });
  // a café window: rain and blurred street lights outside, people walking past, cups steaming on the counter
  L.cafewin = () => ({
    init(G) {
      this.rain = L.fall({ kind: 'rain', n: 0.6, wind: 0.15 }); this.rain.init(G);
      this.ppl = Array.from({ length: 3 }, (_, k) => ({ x: rr(0, G.cols * 0.7), dir: k % 2 ? -1 : 1, v: rr(1.6, 2.8) * G.cols / 120 }));
      this.bok = Array.from({ length: 9 }, () => ({ x: rr(0.07, 0.65), y: rr(0.12, 0.5), r: rr(1.2, 2.6), a: rr(0.3, 0.5), p: rr(0, TAU) }));
    },
    tick(dt, M) {
      this.t = (this.t || 0) + dt; this.rain.tick(dt, M);
      const x0 = M.G.cols * 0.04, x1 = M.G.cols * 0.68;
      for (const q of this.ppl) { q.x += q.dir * q.v * dt; if (q.x > x1) q.x = x0 - 6; if (q.x < x0 - 6) q.x = x1; }
    },
    paint(B, O, M) {
      const G = M.G, { cols, rows, aspect } = G, t = this.t;
      const x0 = Math.round(cols * 0.04), x1 = Math.round(cols * 0.68), y0 = Math.round(rows * 0.07), y1 = Math.round(rows * 0.72);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const d = Math.hypot((c - cols * 0.84) * aspect, (r - rows * 0.3) * 1.2) / rows; B[r * cols + c] = Math.max(B[r * cols + c], 0.5 * Math.exp(-d * 3)); }
      for (let r = y0 + 1; r < y1; r++) for (let c = x0 + 1; c < x1; c++) { const i = r * cols + c; B[i] = Math.max(B[i] * 0.4, 0.06 + 0.05 * noise(c * 0.1, r * 0.1 + t * 0.03)); }
      const save = O.ch.slice(), saveT = O.t.slice();
      const hb = y1 - 5; // the houses' ground line; people walk on the pavement in front
      for (let c = x0 + 1; c < x1; c++) { // far town: dim blocks with a few lit dots
        const k = Math.floor(c / 6), h = Math.round((0.25 + 0.35 * hash(k, 21)) * (hb - y0));
        for (let r = hb - h; r < hb; r++) { B[r * cols + c] = 0.09; if ((c % 3 === 1) && (r % 2 === 0) && hash(c, r) > 0.7) O.put(c, r, 46, 1); }
      }
      for (let x = x0 + 2, k = 0; x < x1 - 8; k++) { // cottages: walls, a pitched roof, lit windows, a chimney with smoke
        const w = 11 + Math.round(hash(k, 31) * 5), hh = 5 + Math.round(hash(k, 32) * 2), rh = Math.round(w / 3.2), xm = x + w / 2;
        for (let r = hb - hh; r < hb; r++) for (let c = x; c < x + w; c++) { B[r * cols + c] = 0.16; O.clear(c, r); if (c === x || c === x + w - 1) O.put(c, r, 124, 1); }
        for (let j = 0; j <= rh; j++) { const r = hb - hh - 1 - j, half = (w / 2 + 1) * (1 - j / (rh + 1)); for (let c = Math.round(xm - half); c <= Math.round(xm + half); c++) { B[r * cols + c] = 0.12; O.clear(c, r); } O.put(Math.round(xm - half), r, 47, 2); O.put(Math.round(xm + half), r, 92, 2); }
        const chx = Math.round(xm + w * 0.25), chy = hb - hh - Math.round(rh * 0.55);
        O.put(chx, chy, 91, 1); O.put(chx + 1, chy, 93, 1); O.put(chx, chy + 1, 124, 1); O.put(chx + 1, chy + 1, 124, 1);
        for (let s = 1; s < 7; s++) { const a = 1 - s / 7; if (noise(s * 0.4 - t * 0.8, k) * a < 0.18) continue; O.put(Math.round(chx + Math.sin(s * 0.7 - t * 1.2 + k) * (s / 3) + s * 0.3), chy - s, a > 0.5 ? 126 : 46, 1); }
        for (const wx of [x + 2, x + w - 5]) { const on = hash(k * 7 + wx, Math.floor(t / 9 + hash(k, wx) * 3)) > 0.25; stamp(O, wx, hb - hh + 1, [on ? '[#]' : '[ ]'], on ? 2 : 1); if (on) glowAt(B, G, wx + 1, hb - hh + 1, 0.8, 0.35); }
        stamp(O, Math.round(xm) - 1, hb - 2, ['|"|', '| |'], 1);
        if (k % 2 === 1) { const lx = x + w + 1; for (let r = hb - 7; r < hb + 3; r++) O.put(lx, r, 124, 1); O.put(lx, hb - 8, 111, 3); glowAt(B, G, lx, hb - 7.5, 1.1, 0.55); }
        x += w + 3 + Math.round(hash(k, 33) * 2);
      }
      for (let r = hb; r < y1; r++) for (let c = x0 + 1; c < x1; c++) { B[r * cols + c] = 0.07; O.clear(c, r); }
      for (let c = x0 + 1; c < x1; c++) O.put(c, hb, 95, 1);
      this.rain.paint(B, O, M);
      for (const q of this.ppl) stamp(O, q.x, y1 - 4, walker(t, q.x), 2);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c, inside = c > x0 && c < x1 && r > y0 && r < y1;
        if (!inside) { O.ch[i] = save[i]; O.t[i] = saveT[i]; }
      }
      for (const b of this.bok) glowAt(B, G, b.x * cols, b.y * rows, b.r * rows / 44, b.a * (0.85 + 0.15 * Math.sin(t * 0.7 + b.p)));
      for (let c = x0; c <= x1; c++) { O.put(c, y0, 61, 1); O.put(c, y1, 61, 2); }
      for (let r = y0; r <= y1; r++) { O.put(x0, r, 124, 1); O.put(x1, r, 124, 1); }
      const desk = Math.round(rows * 0.8);
      for (let c = 0; c < cols; c++) { O.put(c, desk, 61, 2); for (let r = desk + 1; r < rows; r++) { B[r * cols + c] = 0.1 + 0.05 * noise(c * 0.1, r); O.clear(c, r); } }
      { // a cluster of candles on a little tray, each flame flickering on its own
        const cx = Math.round(cols * 0.84);
        stamp(O, cx - 8, desk - 1, ['\\_______________/'], 1);
        for (const [dx, h, k] of [[-6, 3, 1], [-3, 6, 2], [0, 4, 3], [3, 8, 4], [6, 5, 5], [-1, 2, 6]]) {
          const c = cx + dx, top = desk - 2 - h, fl = 0.7 + 0.3 * noise(t * 4 + k * 10, k) + 0.08 * Math.sin(t * 11 + k);
          for (let r = top + 1; r <= desk - 2; r++) O.put(c, r, 124, r === top + 1 ? 2 : 1);
          O.put(c, top, 95, 2); O.put(c, top - 1, 39, 1);
          const sway = Math.round((noise(t * 2.2, k * 3) - 0.5) * 2.4);
          O.put(c + sway * 0, top - 2, fl > 0.82 ? 64 : 48, 3); O.put(c + sway, top - 3, fl > 0.75 ? 39 : 46, fl > 0.75 ? 3 : 2);
          glowAt(B, G, c, top - 2.5, 1.3 * rows / 44, 0.42 * fl);
        }
      }
      for (const cx of [cols * 0.18, cols * 0.6]) {
        stamp(O, cx, desk - 3, [' _____ ', '|     |)', ' \\___/ '], 2);
        const SH = Math.round(rows * 0.16);
        for (let k = 0; k < 3; k++) for (let h = 1; h < SH; h++) { // steam: three strands curling upward, drifting and thinning out
          const a = 1 - h / SH; if (a * (0.3 + noise(k * 9 + h * 0.25 - t * 1.6, cx)) < 0.34) continue;
          const x = cx + 2 + k * 1.3 + Math.sin(h * 0.42 - t * 2 + k * 2.1) * (0.6 + h * 0.16) + Math.sin(t * 0.5 + k) * h * 0.06;
          O.put(Math.round(x), desk - 3 - h, a > 0.6 ? 126 : a > 0.3 ? 41 + (h & 1) * -1 : 46, a > 0.6 ? 2 : 1);
        }
      }
    },
  });
  // a koi pond from above: fish circling, ripples spreading, petals afloat, a ring of stones
  L.pond = () => ({
    init(G) {
      this.koi = [3, 2, 2, 1, 1, 1, 0, 0, 0].map((sz, k) => ({ sz, rf: rr(0.3, 0.82), a: rr(0, TAU), w: rr(0.06, 0.12) * (1.6 - sz * 0.25) * (k % 2 ? -1 : 1), wob: rr(0, TAU) }));
      this.rip = []; this.pet = Array.from({ length: 7 }, () => this.np());
    },
    np() { return { a: rr(0, TAU), d: rr(0.25, 0.85), w: rr(0.02, 0.05) * (Math.random() < 0.5 ? -1 : 1), p: rr(0, TAU) }; },
    tick(dt, M) {
      this.t = (this.t || 0) + dt;
      for (const k of this.koi) k.a += k.w * dt * (0.7 + 0.5 * M.go);
      if (Math.random() < dt * (0.5 + 0.8 * M.beat)) { const a = rr(0, TAU), d = Math.sqrt(Math.random()) * 0.8; this.rip.push({ x: 0.5 + Math.cos(a) * d * 0.42, y: 0.56 + Math.sin(a) * d * 0.38, r: 0 }); }
      for (const q of this.rip) q.r += dt * 2.2; this.rip = this.rip.filter((q) => q.r < 6);
      for (const p of this.pet) { p.a += p.w * dt; p.x = 0.5 + Math.cos(p.a) * p.d * 0.42; p.y = 0.56 + Math.sin(p.a) * p.d * 0.38; }
    },
    paint(B, O, M) {
      const G = M.G, { cols, rows } = G, t = this.t, cx = cols * 0.5, cy = rows * 0.56, rx = cols * 0.42, ry = rows * 0.38;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c, e = ((c - cx) / rx) ** 2 + ((r - cy) / ry) ** 2;
        O.markOn = e <= 0.96 ? 1 : 0; O.clear(c, r);
        if (e > 1.1) { B[i] = 0.12 + 0.04 * noise(c * 0.1, r * 0.2); if (r % 2 === 0 && hash(c, r) > 0.82) O.put(c, r, 46, 1); }
        else if (e > 0.96) { B[i] = 0.2; O.put(c, r, hash(c, r) > 0.5 ? 79 : 111, 2); }
        else B[i] = 0.17 + 0.09 * noise(c * 0.12 + t * 0.06, r * 0.3 - t * 0.04) + 0.1 * Math.pow(Math.max(0, Math.sin(c * 0.3 + r * 0.8 + t * 0.7 + 2 * noise(c * 0.05, r * 0.1))), 4);
      }
      O.markOn = 0;
      for (const [px, py, fl] of [[0.25, 0.4, 1], [0.7, 0.72, 0], [0.62, 0.32, 0]]) { stamp(O, px * cols, py * rows, ['(___)'], 1); if (fl) O.put(Math.round(px * cols + 2), Math.round(py * rows - 1), 42, 3); }
      O.markOn = 1;
      for (const q of this.rip) {
        const a = 1 - q.r / 6;
        for (let s = 0; s < 28; s++) { const an = s / 28 * TAU; O.put(Math.round(q.x * cols + Math.cos(an) * q.r * 1.3), Math.round(q.y * rows + Math.sin(an) * q.r * 0.5), 46, a > 0.6 ? 2 : 1); }
      }
      for (const k of this.koi) {
        const x = cx + Math.cos(k.a) * rx * k.rf, y = cy + Math.sin(k.a) * ry * k.rf, right = -Math.sin(k.a) * k.w > 0;
        const tail = Math.sin(t * 6 + k.wob) > 0;
        const body = KOI[k.sz]; let s = right ? body : [...body].reverse().join('').replace(/[<>()]/g, (m) => ({ '<': '>', '>': '<', '(': ')', ')': '(' })[m]);
        if (!tail) s = right ? '}' + s.slice(1) : s.slice(0, -1) + '{';
        O.markOn = 2; stamp(O, x - s.length / 2, y, [s], k.sz >= 2 ? 3 : 2); O.markOn = 1;
      }
      O.markOn = 0;
      for (const p of this.pet) O.put(Math.round(p.x * cols), Math.round(p.y * rows), Math.sin(t + p.p) > 0 ? 42 : 111, 3);
    },
  });
  // a storm: churning clouds and lightning that lights up everything
  L.storm = () => ({
    init() { this.next = rr(2, 5); this.flash = 0; this.bolt = null; },
    tick(dt, M) {
      this.t = (this.t || 0) + dt; this.next -= dt; this.flash *= Math.exp(-dt * 5);
      if (this.re != null) { this.re -= dt; if (this.re < 0) { this.flash = Math.max(this.flash, 0.75); this.re = null; } }
      if (this.next < 0) {
        const { cols, rows } = M.G; let x = rr(0.08, 0.6) * cols, r = 0; const pts = [];
        while (r < rows * 0.55) { pts.push([x, r]); r += rr(1.5, 3.5) * rows / 44; x += rr(-3, 3); }
        const br = pts[(pts.length / 2) | 0];
        this.bolt = { pts, br: br ? [br, [br[0] + rr(4, 8), br[1] + rr(3, 6)]] : null };
        this.flash = 1; this.re = rr(0.1, 0.2); this.next = rr(4, 11) * (1.2 - 0.4 * M.go);
      }
      if (this.flash < 0.05) this.bolt = null;
    },
    paint(B, O, M) {
      const G = M.G, { cols, rows } = G, t = this.t;
      for (let r = 0; r < rows * 0.6; r++) for (let c = 0; c < cols; c++) {
        const v = 0.1 + 0.45 * clamp(fbm(c * 0.04 + t * 0.04, r * 0.14 - t * 0.02) - 0.35, 0, 1) * (1 + 1.5 * this.flash), i = r * cols + c; if (v > B[i]) B[i] = v;
      }
      if (this.bolt && this.flash > 0.25) {
        const p = this.bolt.pts; for (let k = 1; k < p.length; k++) seg(O, G, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1], 3);
        if (this.bolt.br) seg(O, G, this.bolt.br[0][0], this.bolt.br[0][1], this.bolt.br[1][0], this.bolt.br[1][1], 3);
      }
    },
  });
  // waves bursting into spray against the lighthouse rock
  L.spray = (o) => ({
    init() { this.P = []; this.next = rr(1, 3); },
    tick(dt, M) {
      this.t = (this.t || 0) + dt; this.next -= dt; const k = M.G.rows / 44;
      if (this.next < 0) { const x = o.x * M.G.cols + rr(-7, 7); for (let i = 0; i < 28; i++) this.P.push({ c: x, r: o.y * M.G.rows, vx: rr(-7, 7), vy: -rr(6, 14) * k, age: 0, life: rr(0.8, 1.6) }); this.next = rr(1.5, 4) * (1.2 - 0.5 * M.go); }
      for (const p of this.P) { p.age += dt; p.vy += 16 * k * dt; p.c += p.vx * dt; p.r += p.vy * dt; }
      this.P = this.P.filter((p) => p.age < p.life);
    },
    paint(B, O, M) {
      const { cols, rows } = M.G, cx = o.x * cols, y = o.y * rows;
      for (let r = Math.floor(y - 1); r < Math.min(rows, y + 5); r++) { const w = 6 + (r - y) * 1.8; for (let c = Math.round(cx - w); c <= Math.round(cx + w); c++) if (c >= 0 && c < cols) { B[r * cols + c] = 0.14 + 0.1 * noise(c * 0.5, r * 0.5) + (r < y ? 0.15 : 0); O.clear(c, r); } }
      for (const p of this.P) { const a = 1 - p.age / p.life; O.put(Math.round(p.c), Math.round(p.r), a > 0.6 ? 42 : a > 0.3 ? 39 : 46, a > 0.6 ? 3 : a > 0.3 ? 2 : 1); }
    },
  });

  // ── round 3 additions ──
  // fireflies looping round the campfire, well clear of the flames; bigger and brighter the nearer they come to the fire
  L.orbiters = (o) => ({
    init() { this.f = Array.from({ length: o.n }, () => ({ a: rr(0, TAU), w: rr(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1), rx: rr(0.27, 0.46), ry: rr(0.12, 0.3), s: rr(0, 100), p: rr(0, TAU) })); },
    tick(dt) { this.t = (this.t || 0) + dt; for (const q of this.f) q.a += q.w * dt * (0.8 + 0.4 * noise(this.t * 0.3, q.s)); },
    paint(B, O, M) {
      const G = M.G, { cols, rows } = G, fx = cols / 2, fy = rows * 0.72;
      for (const q of this.f) {
        const wob = 0.06 * (noise(this.t * 0.4, q.s) - 0.5);
        const x = fx + Math.cos(q.a) * (q.rx + wob) * cols, y = fy + Math.sin(q.a) * (q.ry + wob) * rows - rows * 0.05 * Math.sin(this.t * 0.7 + q.p);
        const near = clamp(1 - Math.hypot((x - fx) / cols, (y - fy) / rows) / 0.5, 0, 1), blink = 0.6 + 0.4 * Math.sin(this.t * 2.3 + q.p);
        if (near > 0.45) { glowAt(B, G, x, y, 0.6 + near * 0.9, 0.45 * blink); O.put(Math.round(x), Math.round(y), 42, 3); }
        else if (near > 0.2) { glowAt(B, G, x, y, 0.6, 0.3 * blink); O.put(Math.round(x), Math.round(y), 43, blink > 0.7 ? 3 : 2); }
        else O.put(Math.round(x), Math.round(y), 46, blink > 0.6 ? 2 : 1);
      }
    },
  });
  // a shooting star every few seconds
  L.meteor = (o) => ({
    init() { this.next = rr(1, 3); this.m = null; },
    tick(dt, M) {
      this.next -= dt;
      if (this.next < 0) { const { cols, rows } = M.G, d = Math.random() < 0.5 ? -1 : 1; this.m = { x: rr(0.15, 0.85) * cols, y: rr(0.02, 0.18) * rows, vx: d * rr(38, 58) * cols / 120, vy: rr(9, 15) * rows / 44, age: 0, life: rr(0.7, 1.1) }; this.next = rr(o.every[0], o.every[1]); }
      if (this.m) { const m = this.m; m.age += dt; m.x += m.vx * dt; m.y += m.vy * dt; if (m.age > m.life) this.m = null; }
    },
    paint(B, O, M) {
      const m = this.m; if (!m || m.y > M.G.rows * (o.maxY || 0.42)) return;
      const a = 1 - m.age / m.life, sp = Math.hypot(m.vx, m.vy), ux = m.vx / sp, uy = m.vy / sp, g = glyph(m.vx, m.vy, M.G.aspect);
      for (let k = 1; k < 14; k++) { const tr = 1 - k / 14; if (tr * a < 0.15) break; O.put(Math.round(m.x - ux * k * 1.4), Math.round(m.y - uy * k * 0.7), k < 4 ? g : 46, tr * a > 0.6 ? 3 : tr * a > 0.35 ? 2 : 1); }
      O.put(Math.round(m.x), Math.round(m.y), 42, 3); glowAt(B, M.G, m.x, m.y, 0.7, 0.5 * a);
    },
  });
  // tall towers: chasing window lights, an elevator gliding, a blinking mast
  L.towers = (o) => ({
    init() {}, tick(dt) { this.t = (this.t || 0) + dt; },
    paint(B, O, M) {
      const G = M.G, { cols, rows } = G, t = this.t, base = Math.floor(rows * 0.78);
      for (const [xf, wf, topf, seed] of o.list) {
        const w = Math.max(7, Math.round(wf * cols)) | 1, x0 = Math.round(xf * cols - w / 2), top = Math.round(topf * rows), x1 = x0 + w - 1, mid = x0 + (w >> 1);
        for (let r = top; r < base; r++) for (let c = x0; c <= x1; c++) {
          if (c < 0 || c >= cols) continue; const i = r * cols + c, edge = c === x0 || c === x1;
          B[i] = edge ? 0.24 : 0.09; O.clear(c, r);
          if (edge) O.put(c, r, 124, 1);
        }
        for (let c = x0 + 1; c < x1; c++) { O.put(c, top, 95, 2); O.put(c, top - 1, c === mid ? 65 : c > x0 + 1 && c < x1 - 1 ? 95 : 0, 1); }
        for (let r = top - 2; r > top - 2 - Math.round(rows * 0.08); r--) O.put(mid, r, 124, 1);                      // mast
        const mr = top - 2 - Math.round(rows * 0.08); O.put(mid, mr, (t + seed) % 2.4 < 0.6 ? 42 : 46, 2);
        for (let r = top + 2; r < base - 1; r += 2) for (let c = x0 + 2; c < x1 - 1; c += 2) { // windows: each switches on or off every so often
          const on = hash(c * 3 + seed, r) + 0.18 * Math.sin(t * 0.06 + hash(c, r * 5) * 60) > 0.55;
          if (on) O.put(c, r, hash(c, r * 7) > 0.5 ? 61 : 35, hash(r, c * 3) > 0.85 ? 3 : 2); else if (hash(c, r + seed) > 0.7) O.put(c, r, 46, 1);
        }
      }
    },
  });
  // a shark: swims slowly across, coming close to you and then drifting away again
  L.shark = () => ({
    init() { this.t = rr(0, 30); }, tick(dt, M) { this.t += dt * (0.8 + 0.3 * M.go); },
    paint(B, O, M) {
      const G = M.G, { cols, rows, aspect } = G, t = this.t;
      const th = t * TAU / 30, z = 0.5 + 0.5 * Math.cos(th), dirv = Math.cos(th), dir = dirv >= 0 ? 1 : -1, turn = 0.3 + 0.7 * Math.pow(Math.abs(dirv), 0.6);
      const xc = cols * (0.5 + 0.22 * Math.sin(th)), yc = rows * (0.5 + 0.06 * Math.sin(t * 0.21));
      const Lc = cols * (0.14 + 0.32 * z) * turn, H = cols * (0.14 + 0.32 * z) * aspect * 0.2, fog = 0.3 + 0.7 * z, sway = Math.sin(t * 2.2);
      const hb = (u) => H * Math.pow(Math.max(0, 1 - u * u), 0.55) * (u > 0.55 ? 1 - (u - 0.55) * 0.7 : 1);
      const fill = (c, r, v) => { if (c < 0 || c >= cols || r < 0 || r >= rows) return; const i = r * cols + c; B[i] = Math.max(B[i] * 0.3, v * fog); O.clear(c, r); };
      const C0 = Math.floor(xc - Lc * 0.75), C1 = Math.ceil(xc + Lc * 0.55);
      for (let c = C0; c <= C1; c++) {
        const u = (c - xc) / (Lc / 2) * dir, yb = yc + sway * H * 0.25 * Math.max(0, -u);  // the tail end swings
        if (u >= -1 && u <= 1) {
          const h = hb(u);
          for (let r = Math.floor(yb - h); r <= Math.ceil(yb + h * 0.9); r++) { const d = (r - yb) / h; fill(c, r, d < -0.55 ? 0.7 : d > 0.45 ? 0.5 : 0.36 + 0.1 * noise(c * 0.3, r * 0.4)); }
        }
        if (u > -0.27 && u < 0.15) { const fh = H * 0.95 * (u < -0.12 ? (u + 0.27) / 0.15 : (0.15 - u) / 0.27); for (let k = 1; k <= fh; k++) fill(c, Math.round(yb - hb(u) - k), 0.5); }
        if (u > 0.08 && u < 0.45) { const fh = H * 0.9 * (1 - (u - 0.08) / 0.37); for (let k = 1; k <= fh; k++) fill(c, Math.round(yb + hb(u) * 0.9 + k), 0.38); }
        if (u < -0.95 && u > -1.45) {
          const s = (-0.95 - u) / 0.5, yt = yc + sway * H * 0.3;
          for (let k = 0; k < Math.max(1, H * 0.35 * (1 - s * 0.6)); k++) { fill(c, Math.round(yt - H * 0.1 - s * H * 1.5 - k), 0.5); fill(c, Math.round(yt + H * 0.1 + s * H * 0.9 + k * 0.6), 0.36); }
        }
      }
      const at = (u) => Math.round(xc + u * (Lc / 2) * dir);
      O.put(at(0.72), Math.round(yc - H * 0.25), z > 0.35 ? 111 : 46, 3);
      if (z > 0.25) { for (const u of [0.46, 0.51, 0.56]) O.put(at(u), Math.round(yc), 40 + (dir > 0 ? 1 : 0), 1); for (let u = 0.78; u < 0.97; u += 0.04) O.put(at(u), Math.round(yc + H * 0.4), 45, 1); }
    },
  });
  // tadpoles wriggling about the pond
  L.tadpoles = (o) => ({
    init() { this.p = Array.from({ length: o.n }, () => ({ x: rr(0.3, 0.7), y: rr(0.35, 0.75), a: rr(0, TAU), s: rr(0, 100), v: rr(0.012, 0.025) })); },
    tick(dt) {
      this.t = (this.t || 0) + dt;
      for (const q of this.p) {
        q.a += (noise(this.t * 0.5, q.s) - 0.5) * dt * 6;
        const e = ((q.x - 0.5) / 0.36) ** 2 + ((q.y - 0.56) / 0.32) ** 2; if (e > 0.8) q.a = Math.atan2(0.56 - q.y, 0.5 - q.x);
        const burst = 0.4 + Math.max(0, Math.sin(this.t * 3 + q.s));
        q.x += Math.cos(q.a) * q.v * burst * dt; q.y += Math.sin(q.a) * q.v * burst * dt * 1.6;
      }
    },
    paint(B, O, M) {
      const { cols, rows } = M.G;
      for (const q of this.p) {
        const x = q.x * cols, y = q.y * rows, ux = -Math.cos(q.a), uy = -Math.sin(q.a) * 0.5, w = Math.sin(this.t * 14 + q.s) > 0;
        O.markOn = 1; O.put(Math.round(x), Math.round(y), 111, 3);
        O.put(Math.round(x + ux * 1.2), Math.round(y + uy), w ? 126 : 45, 2);
        O.put(Math.round(x + ux * 2.3 + (w ? 0.3 : -0.3)), Math.round(y + uy * 2), 39, 1); O.markOn = 0;
      }
    },
  });
  // one big koi seen from above, its body bending along its path, shaded so it looks round
  L.bigkoi = () => ({
    init() { this.s = rr(0, TAU); }, tick(dt, M) { this.t = (this.t || 0) + dt; this.s += dt * 0.09 * (0.8 + 0.4 * M.go); },
    paint(B, O, M) {
      const G = M.G, { cols, rows, aspect } = G, t = this.t;
      const P = (s) => [cols * (0.5 + 0.27 * Math.sin(s)), rows * (0.56 + 0.2 * Math.sin(2 * s))];
      const N = 24, W = rows * 0.075, spine = [];
      for (let k = 0; k < N; k++) {
        const s = this.s - k * 0.03, [x, y] = P(s), wig = Math.sin(t * 5 - k * 0.5) * (k / N) * 0.8;
        const [x2, y2] = P(s + 0.01), tx = (x2 - x) * aspect, ty = y2 - y, tl = Math.hypot(tx, ty) || 1;
        spine.push({ x: x + (-ty / tl) * wig / aspect, y: y + (tx / tl) * wig, nx: -ty / tl, ny: tx / tl, tx: tx / tl, ty: ty / tl });
      }
      const prof = (k) => (k < 3 ? 0.75 + 0.08 * k : 1 - Math.pow((k - 3) / (N - 3), 1.3) * 0.82);
      O.markOn = 2;
      for (let k = N - 1; k >= 0; k--) {
        const q = spine[k], w = W * prof(k), patch = noise(k * 0.45 + 3.3, 7.1) > 0.5;
        for (let r = Math.floor(q.y - w - 1); r <= Math.ceil(q.y + w + 1); r++) for (let c = Math.floor(q.x - (w + 1) / aspect); c <= Math.ceil(q.x + (w + 1) / aspect); c++) {
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
          const dx = (c + 0.5 - q.x) * aspect / w, dy = (r + 0.5 - q.y) / w, d2 = dx * dx + dy * dy; if (d2 >= 1) continue;
          const nz = Math.sqrt(1 - d2), lit = clamp(nz * 0.75 - dx * 0.25 - dy * 0.35, 0, 1), scale = 0.9 + 0.1 * Math.sin((c * 0.9 + r * 1.7) + k);
          const i = r * cols + c; B[i] = (0.5 + 0.55 * lit) * (patch ? 1 : 0.78) * scale; O.clear(c, r);
        }
      }
      const h = spine[0], fin = Math.sin(t * 3.5) * 0.35;
      for (const side of [-1, 1]) {
        O.put(Math.round(h.x + h.nx * side * W * 0.45 / aspect + h.tx * 0.6 / aspect), Math.round(h.y + h.ny * side * W * 0.45 + h.ty * 0.6), 111, 3); // eyes
        const f = spine[4], ex = f.x + (f.nx * side * (W * 1.9) - f.tx * W * (1 + fin * side)) / aspect, ey = f.y + f.ny * side * W * 1.9 - f.ty * W * (1 + fin * side);
        seg(O, G, f.x + f.nx * side * W * 0.9 / aspect, f.y + f.ny * side * W * 0.9, ex, ey, 2);                    // pectoral fins
      }
      const e = spine[N - 1], tf = Math.sin(t * 6) * 0.5;
      for (const sp of [-0.75, -0.35, 0, 0.35, 0.75]) {                                                               // the tail, fanning and fluttering
        const a = Math.atan2(-e.ty, -e.tx) + sp * 0.8 + tf, len = W * (1.3 - Math.abs(sp) * 0.6);
        seg(O, G, e.x, e.y, e.x + Math.cos(a) * len / aspect, e.y + Math.sin(a) * len, Math.abs(sp) < 0.5 ? 3 : 2);
      }
      for (const k of [6, 10, 14]) { const q = spine[k]; O.put(Math.round(q.x), Math.round(q.y), 42, 3); }           // a few bright scales
      O.markOn = 0;
    },
  });

  // a big airliner crossing the sky: shaded fuselage, swept wings, engines, tail, a row of windows, blinking lights
  function fillPoly(B, O, G, pts, shade) {
    const { cols, rows } = G;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let r = Math.max(0, Math.floor(y0)); r <= Math.min(rows - 1, Math.ceil(y1)); r++) for (let c = Math.max(0, Math.floor(x0)); c <= Math.min(cols - 1, Math.ceil(x1)); c++) {
      const px = c + 0.5, py = r + 0.5; let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside; }
      if (inside) { B[r * cols + c] = shade(c, r); O.clear(c, r); }
    }
  }
  L.airliner = (o = {}) => ({
    init() { this.t = rr(8, 20); }, tick(dt) { this.t += dt; },
    paint(B, O, M) {
      const G = M.G, { cols, rows, aspect } = G, t = this.t, P = o.period || 60, s = (t % P) / P;
      const Lc = cols * (o.size || 0.56), dir = -1, xc = cols * (1 + o.size * 0.6 - (1 + o.size * 1.2) * s / 0.78), yc = rows * (o.y || 0.17) + Math.sin(t * 0.3) * 0.3;
      if (s > 0.78) return; // off screen for the rest of the loop
      const Hf = Lc * aspect * 0.06, X = (u) => xc + u * (Lc / 2) * dir;
      const before = o.fade ? B.slice() : null;
      // the far wing, mostly hidden behind the body
      fillPoly(B, O, G, [[X(0.28), yc - Hf * 0.6], [X(0.06), yc - Hf * 0.6], [X(-0.2), yc - Hf * 2.3], [X(-0.12), yc - Hf * 2.4]], (c, r) => 0.2 + 0.06 * noise(c * 0.4, r));
      fillPoly(B, O, G, [[X(-0.74), yc - Hf * 0.5], [X(-0.86), yc - Hf * 0.4], [X(-1.0), yc - Hf * 1.3], [X(-0.95), yc - Hf * 1.35]], () => 0.2);
      // the fuselage: a lit cylinder, nose rounded, tail swept up and narrowing
      for (let c = Math.floor(X(1)) - 1; c <= Math.ceil(X(-1)) + 1; c++) {
        if (c < 0 || c >= cols) continue;
        const u = (c - xc) / (Lc / 2) * dir; if (u < -1 || u > 1) continue;
        let rad = Hf, off = 0;
        if (u > 0.82) rad = Hf * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.82) / 0.18, 2)));
        if (u < -0.55) { const k = (-0.55 - u) / 0.45; rad = Hf * (1 - 0.65 * k); off = -Hf * 0.75 * k * k; }
        const cy = yc + off;
        for (let r = Math.floor(cy - rad); r <= Math.ceil(cy + rad); r++) {
          if (r < 0 || r >= rows) continue;
          const d = (r + 0.5 - cy) / Math.max(0.5, rad); if (Math.abs(d) > 1.05) continue;
          const v = 0.35 + 0.42 * Math.sqrt(Math.max(0, 1 - d * d)) + (d < -0.35 ? 0.2 : 0) - (d > 0.5 ? 0.1 : 0);
          B[r * cols + c] = clamp(v, 0, 1); O.clear(c, r);
        }
        if (u > -0.55 && u < 0.74 && (c % 2 === 0)) O.put(c, Math.round(cy - rad * 0.2), 46, 0);                     // passenger windows
        if (u > 0.86 && u < 0.94) O.put(c, Math.round(cy - rad * 0.35), 61, 0);                                       // cockpit glass
        if (u > -0.5 && u < 0.78) O.put(c, Math.round(cy + rad * 0.55), 95, 1);                                       // the belly line
      }
      // the tail fin and the near tailplane
      fillPoly(B, O, G, [[X(-0.62), yc - Hf * 0.7], [X(-0.86), yc - Hf * 0.9], [X(-1.02), yc - Hf * 3.4], [X(-0.9), yc - Hf * 3.4]], (c, r) => 0.42 + 0.2 * clamp((yc - r) / (Hf * 3.4), 0, 1));
      seg(O, G, X(-0.62), yc - Hf * 0.7, X(-0.9), yc - Hf * 3.4, 3);
      fillPoly(B, O, G, [[X(-0.72), yc - Hf * 0.1], [X(-0.88), yc], [X(-1.04), yc + Hf * 1.4], [X(-0.97), yc + Hf * 1.45]], () => 0.4);
      // the near wing, swept back and down toward us
      const wr0 = [X(0.34), yc + Hf * 0.7], wr1 = [X(0.04), yc + Hf * 0.8], wt1 = [X(-0.32), yc + Hf * 4.6], wt0 = [X(-0.2), yc + Hf * 4.5];
      fillPoly(B, O, G, [wr0, wr1, wt1, wt0], (c, r) => { const k = clamp((r - yc) / (Hf * 4.6), 0, 1); return 0.34 + 0.22 * (1 - k) + 0.06 * noise(c * 0.3, r * 0.5); });
      seg(O, G, wr0[0], wr0[1], wt0[0], wt0[1], 3);                                                                    // leading edge catches the light
      seg(O, G, wt0[0], wt0[1], wt0[0] - 1.5 * dir, wt0[1] - Hf * 0.9, 2);                                             // winglet
      // two engines slung under the wing
      for (const f of [0.32, 0.66]) {
        const ex = wr0[0] + (wt0[0] - wr0[0]) * f - (Lc * 0.035) * dir, ey = wr0[1] + (wt0[1] - wr0[1]) * f + Hf * 0.55;
        const erx = Lc * 0.06, ery = Hf * 0.55;
        for (let r = Math.floor(ey - ery); r <= Math.ceil(ey + ery); r++) for (let c = Math.floor(ex - erx); c <= Math.ceil(ex + erx); c++) {
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
          const dx = (c + 0.5 - ex) / erx, dy = (r + 0.5 - ey) / ery; if (dx * dx + dy * dy > 1) continue;
          B[r * cols + c] = 0.38 + 0.4 * Math.sqrt(1 - dy * dy) * (1 - 0.3 * dy); O.clear(c, r);
        }
        O.put(Math.round(ex + erx * dir), Math.round(ey), 40, 1);                                                      // the intake
      }
      // lights: a strobe on the wingtip, a beacon on the belly, both blinking
      if (t % 1.3 < 0.12) { O.put(Math.round(wt0[0]), Math.round(wt0[1]), 42, 3); glowAt(B, G, wt0[0], wt0[1], 1, 0.8); }
      if ((t + 0.6) % 1.8 < 0.3) O.put(Math.round(X(0.1)), Math.round(yc + Hf + 0.6), 43, 3);
      O.put(Math.round(X(-1.02)), Math.round(yc - Hf * 3.4), 46, 2);
      if (before) for (let i = 0; i < B.length; i++) if (B[i] !== before[i]) B[i] *= o.fade; // far away: a little hazy
    },
  });

  // ── the grid, the colour and the paint ──
  function create(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, fs = 13, cw = 8, line = 16, font = '';
    const G = { cols: 0, rows: 0, aspect: 0.5 };
    let cur = null, prev = null, blend = 1, fast = 0;
    let Bc, Bp, B, Oc, Op;
    const col = { hue: 200, sat: 30, lit: 0.5 }, shown = { hue: 200, sat: 30, lit: 0.5 };
    let pal = null, clock = 0, kick = 0, wander = Math.random() * 100;

    const overlay = (n) => {
      const O = { ch: new Uint16Array(n), t: new Uint8Array(n), m: new Uint8Array(n), markOn: 0 };
      O.put = (c, r, ch, t) => { if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) return; const i = r * G.cols + c; O.ch[i] = ch; O.t[i] = clamp(t | 0, 0, 3); O.m[i] = O.markOn; };
      O.clear = (c, r) => { const i = r * G.cols + c; O.ch[i] = 0; O.m[i] = O.markOn; };
      return O;
    };
    function makeScene(id) {
      const th = THEMES[id] || DEFAULT_THEME;
      const sc = { id, th, layers: th.layers.map(([k, o]) => L[k](o)) };
      if (G.cols) sc.layers.forEach((l) => l.init(G));
      return sc;
    }
    function resize(w, h, d) {
      W = w; H = h; dpr = d;
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      fs = opts.fs || Math.round(clamp(Math.min(w / 125, h / 52), 10, 16));
      font = `500 ${fs}px ui-monospace, "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace`;
      ctx.font = font;
      cw = ctx.measureText('M').width || fs * 0.6;
      line = Math.round(fs * 1.18);
      G.cols = Math.ceil(w / cw); G.rows = Math.ceil(h / line); G.aspect = cw / line;
      const n = G.cols * G.rows;
      Bc = new Float32Array(n); Bp = new Float32Array(n); B = new Float32Array(n); Oc = overlay(n); Op = overlay(n);
      for (const s of [cur, prev]) if (s) s.layers.forEach((l) => l.init(G));
    }
    function setScene(id) {
      if (cur && cur.id === id) return;
      prev = cur; cur = makeScene(id); blend = prev ? 0 : 1; fast = 1.4;
      if (!prev) Object.assign(shown, { hue: cur.th.hue, sat: cur.th.sat, lit: cur.th.lit });
    }

    // the colour the music asks for now
    function target(info) {
      const th = cur.th, mix = info.mix || {};
      const mood = info.mood || 'main';
      const ml = MODE_LIGHT[info.mode] ?? 0.5;
      const warm = clamp(0.8 * (mix.beats || 0) + 0.5 * (mix.bass || 0) - 0.7 * (mix.synth || 0) - (mood === 'airy' ? 0.5 : 0) + (mood === 'full' ? 0.3 : 0), -1, 1);
      // nudge the hue toward warm (30°) or cool (215°) by up to 16°, the short way round
      const goal = warm >= 0 ? 30 : 215, dd = ((goal - th.hue + 540) % 360) - 180;
      const nudge = Math.sign(dd) * Math.min(Math.abs(dd), 16 * Math.abs(warm));
      const drift = 7 * (noise(wander + clock * 0.012, 1.5) - 0.5) * 2;
      col.hue = (th.hue + nudge + drift + 360) % 360;
      col.sat = clamp(th.sat + (mood === 'full' ? 10 : mood === 'sparse' ? -10 : 0) + 10 * (info.sig.energy || 0) * (info.playing ? 1 : 0) - (info.playing ? 0 : 6), 4, 80);
      col.lit = clamp(th.lit * 0.65 + ml * 0.35 + (mood === 'airy' ? 0.08 : mood === 'sparse' ? -0.06 : 0), 0, 1);
    }
    function hsl(h, s, l) { return `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`; }
    function tiersAt(h, sOver) { const { lit: b } = shown, s = sOver ?? shown.sat, k = 0; return [hsl(h, s * 0.5 + 5, 23 + 9 * b), hsl(h, s * 0.72 + 8, 35 + 12 * b), hsl(h, s * 0.85 + 10, 57 + 10 * b + k), hsl(h, s * 0.55 + 10, 84 + 7 * b + k)]; }
    function makePalette() {
      const { hue: h, sat: s, lit: b } = shown;
      return {
        tiers: tiersAt(h),
        bg: hsl(h, Math.min(28, s * 0.55 + 5), 3.6 + 1.6 * b),
        accent: hsl(h, s * 0.9 + 14, 62 + 8 * b),
        hue: h, sat: s, lit: b,
      };
    }

    function step(sc, Bx, Ox, dt, M) {
      Bx.fill(0); Ox.ch.fill(0); Ox.m.fill(0);
      sc.flash = 0;
      for (const l of sc.layers) { l.tick(dt, M); l.paint(Bx, Ox, M); if (l.flash) sc.flash = Math.max(sc.flash, l.flash); }
    }
    const tmpPal = [];
    function draw(dtIn, info) {
      if (!cur || !G.cols) return;
      const dt = clamp(dtIn || 0, 0, 0.1);
      info = info || {}; info.sig = info.sig || {};
      clock += dt;
      fast = Math.max(0, fast - dt);
      // the scene's own time runs slow when paused, so the picture rests but never freezes
      const sdt = dt * (info.playing ? 1 : 0.3);
      kick = Math.max(kick * Math.exp(-dt * 6), info.playing ? Math.min(1, (info.sig.beat || 0) * 0.6) : 0);
      const M = { G, beat: info.playing ? info.sig.beat || 0 : 0, notes: info.playing ? info.sig.notes || 0 : 0, level: info.level || 0, go: info.playing ? clamp(0.35 + 0.65 * (info.sig.energy || 0), 0, 1) : 0.15 };
      // colour: ease toward what the music asks for (fast just after a scene change)
      target(info);
      const hk = Math.min(1, dt * (fast > 0 ? 3.5 : 0.7));
      shown.hue = (shown.hue + (((col.hue - shown.hue + 540) % 360) - 180) * hk + 360) % 360;
      shown.sat += (col.sat - shown.sat) * hk;
      shown.lit += (col.lit - shown.lit) * hk;
      pal = makePalette();

      step(cur, Bc, Oc, sdt, M);
      let Bs = Bc, Os = Oc;
      if (prev && blend < 1) {
        step(prev, Bp, Op, sdt, M);
        blend = Math.min(1, blend + dt / 1.6);
        const e = blend * blend * (3 - 2 * blend);
        for (let i = 0; i < B.length; i++) B[i] = Bp[i] + (Bc[i] - Bp[i]) * e;
        // glyphs dissolve cell by cell
        for (let i = 0; i < B.length; i++) if (hash(i, 7) > e) { Oc.ch[i] = Op.ch[i]; Oc.t[i] = Op.t[i]; }
        Bs = B;
        if (blend >= 1) prev = null;
      }
      // a step darker in the middle, so the guitar stays the brightest thing (no beat pulse: it read as flicker)
      const { cols, rows } = G, mx = cols / 2, my = rows * 0.46, R2 = Math.pow(rows * 0.3, 2);
      const flash = cur.flash || 0, nod = 1 + 0.6 * flash, dimK = opts.dim === false ? 0 : 0.32;

      // paint
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
      ctx.font = font; ctx.textBaseline = 'top';
      const buf = [new Array(cols), new Array(cols), new Array(cols), new Array(cols)];
      const multi = cur.th.multi || null, zones = cur.th.zones || null, SEG = 6, mcache = {};
      const hueAt = (hs, w) => { const p = w * (hs.length - 1), k = Math.min(hs.length - 2, Math.floor(p)); return hs[k] + (hs[k + 1] - hs[k]) * (p - k); };
      for (let r = 0; r < rows; r++) {
        const any = [false, false, false, false];
        for (let t = 0; t < 4; t++) buf[t].fill(' ');
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const ov = Os.ch[i];
          if (ov) { if (ov !== 32) { buf[Os.t[i]][c] = String.fromCharCode(ov); any[Os.t[i]] = true; } continue; }
          const dx = (c - mx) * G.aspect, dy = r - my;
          let v = Math.pow(Bs[i], 0.85) * nod * (1 - dimK * Math.exp(-(dx * dx + dy * dy) / R2)) + 0.1 * flash;
          if (v < 0.045) continue;
          v = Math.min(1, v);
          const t = v > 0.78 ? 3 : v > 0.52 ? 2 : v > 0.27 ? 1 : 0;
          buf[t][c] = RAMP[Math.max(1, Math.min(9, Math.round(v * 9)))];
          any[t] = true;
        }
        if (multi || zones) { // more than one colour: drifting bands (northern lights) and/or zones a layer marked (pond water, koi); 255 = the scene's own colour
          let run = '', rk = null, rs = 0, rt = 0;
          const tiersOf = (k) => k === -1 ? pal.tiers : mcache[k] || (mcache[k] = k <= -100 ? tiersAt(zones[-k - 100].hue, zones[-k - 100].sat) : tiersAt(k * 5));
          const flush = () => { if (run.trim()) { ctx.fillStyle = tiersOf(rk)[rt]; ctx.fillText(run, rs * cw, r * line); } run = ''; };
          for (let c0 = 0; c0 < cols; c0 += SEG) {
            const hk = multi ? Math.round(hueAt(multi.hues, 0.5 + 0.5 * Math.sin(clock * multi.speed + c0 * 0.035 - r * 0.06 + Math.sin(clock * 0.05 + r * 0.02) * 2)) / 5) : -1;
            for (let c = c0; c < Math.min(cols, c0 + SEG); c++) {
              let tt = -1; for (let q = 0; q < 4; q++) if (buf[q][c] !== ' ') { tt = q; break; }
              if (tt < 0) { if (run) run += ' '; continue; }
              const m = Os.m[r * cols + c], k = m === 255 ? -1 : m && zones && zones[m] ? -100 - m : hk;
              if (!run || k !== rk || tt !== rt) { flush(); rk = k; rt = tt; rs = c; }
              run += buf[tt][c];
            }
          }
          flush();
        } else for (let t = 0; t < 4; t++) if (any[t]) { ctx.fillStyle = pal.tiers[t]; ctx.fillText(buf[t].join(''), 0, r * line); }
      }
    }

    return {
      resize, setScene, draw,
      palette: () => pal || (cur ? (Object.assign(shown, { hue: cur.th.hue, sat: cur.th.sat, lit: cur.th.lit }), makePalette()) : null),
      _grid: () => ({ G, B: prev && blend < 1 ? B : Bc, O: Oc, shown: { ...shown }, target: { ...col } }),
    };
  }

  return { create, THEMES, RAMP, noise };
})();
