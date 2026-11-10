'use strict';
// Shared helpers for Echofront
const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  dist2: (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay),
  angDiff: (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  now: () => Date.now(),
  // Seeded RNG (mulberry32) so every client spawns identical spreads from a shot event
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  code(n, alphabet) {
    const al = alphabet || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    const buf = new Uint32Array(n);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (let i = 0; i < n; i++) s += al[buf[i] % al.length];
    return s;
  },
  store: {
    get(k, def) {
      try {
        const v = localStorage.getItem('ef_' + k);
        return v == null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(k, v) {
      try { localStorage.setItem('ef_' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
    },
  },
  ago(ts) {
    if (!ts) return 'never';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    return d + 'd ago';
  },
  clock(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return 'today ' + t;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + t;
  },
  fmt: (n) => Math.floor(n).toLocaleString(),
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  dayKey: () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  // Segment vs axis-aligned rect intersection (for line of sight)
  segRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else {
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
        else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
    }
    return true;
  },
  circleRect(cx, cy, cr, r) {
    const nx = U.clamp(cx, r.x, r.x + r.w), ny = U.clamp(cy, r.y, r.y + r.h);
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < cr * cr;
  },
};
