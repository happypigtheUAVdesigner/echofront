'use strict';
// Procedural art: every ship, weapon, icon and effect is drawn in code.
const Art = (() => {
  const cache = {};

  function skinCols(id, t) {
    const s = SKINS[id] || SKINS.ion;
    if (s.anim === 'rainbow') {
      const h = (t * 90) % 360;
      return { core: `hsl(${h},100%,70%)`, hull: s.hull, trail: `hsl(${(h + 60) % 360},100%,65%)` };
    }
    if (s.anim === 'flare') {
      const k = 0.5 + 0.5 * Math.sin(t * 6);
      return { core: k > 0.5 ? '#ffe066' : '#ff9a3d', hull: s.hull, trail: s.trail };
    }
    if (s.anim === 'gold') {
      const k = 0.5 + 0.5 * Math.sin(t * 3);
      return { core: `hsl(48,100%,${70 + k * 18}%)`, hull: s.hull, trail: s.trail };
    }
    return s;
  }

  function poly(ctx, n, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function weapon(ctx, id, r, col) {
    ctx.fillStyle = '#d7dcff'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    switch (id) {
      case 'scatter':
        ctx.beginPath(); ctx.moveTo(r * 0.2, -5); ctx.lineTo(r * 1.15, -10); ctx.lineTo(r * 1.15, 10); ctx.lineTo(r * 0.2, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.fillRect(r * 1.05, -10, 4, 20); break;
      case 'needle':
        ctx.fillRect(r * 0.2, -6, r * 1.25, 3); ctx.fillRect(r * 0.2, 3, r * 1.25, 3);
        ctx.fillStyle = col; ctx.fillRect(r * 1.3, -6, 4, 3); ctx.fillRect(r * 1.3, 3, 4, 3); break;
      case 'lance':
        ctx.fillRect(r * 0.2, -2.5, r * 1.75, 5);
        ctx.fillStyle = col; ctx.fillRect(r * 0.5, -8, r * 1.3, 2.5); ctx.fillRect(r * 0.5, 5.5, r * 1.3, 2.5);
        ctx.fillRect(r * 0.3, -1, r * 1.7, 2); break;
      case 'mortar':
        ctx.fillRect(r * 0.1, -8, r * 1.05, 16); ctx.strokeRect(r * 0.1, -8, r * 1.05, 16);
        ctx.fillStyle = col; ctx.fillRect(r * 0.75, -9, 5, 18); break;
      case 'prism':
        ctx.fillRect(r * 0.2, -3, r * 0.6, 6);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(r * 0.7, -9); ctx.lineTo(r * 1.4, 0); ctx.lineTo(r * 0.7, 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(r * 0.78, -4); ctx.lineTo(r * 1.1, 0); ctx.lineTo(r * 0.78, 4); ctx.fill(); break;
      case 'swarm':
        ctx.fillRect(r * 0.25, -9, r * 0.9, 18); ctx.strokeRect(r * 0.25, -9, r * 0.9, 18);
        ctx.fillStyle = col; [-5, 0, 5].forEach((y) => { ctx.beginPath(); ctx.arc(r * 1.1, y, 2.2, 0, 7); ctx.fill(); }); break;
      case 'singularity':
        ctx.fillRect(r * 0.2, -4, r * 0.8, 8);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r * 1.2, 0, 8, 0, 7); ctx.stroke();
        ctx.fillStyle = '#05020f'; ctx.beginPath(); ctx.arc(r * 1.2, 0, 5, 0, 7); ctx.fill(); break;
      default: // pulse
        ctx.fillRect(r * 0.2, -3.5, r * 1.1, 7);
        ctx.fillStyle = col; ctx.fillRect(r * 1.2, -4.5, 4, 9);
    }
  }

  // Player-style ship (humans and versus bots)
  function ship(ctx, o, t) {
    const c = skinCols(o.skin, t);
    const r = o.r;
    ctx.save(); ctx.translate(o.x, o.y);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    // team ring
    if (o.ring) { ctx.strokeStyle = o.ring; ctx.globalAlpha *= 0.55; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, 7); ctx.stroke(); ctx.globalAlpha = o.alpha != null ? o.alpha : 1; }
    // glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = c.core; ctx.globalAlpha *= 0.16; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, 7); ctx.fill();
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    ctx.globalCompositeOperation = 'source-over';
    // hull
    ctx.save(); ctx.rotate(o.body || 0);
    // hover pods
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      ctx.fillStyle = c.trail; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, r * 0.2, 0, 7); ctx.fill();
    }
    ctx.fillStyle = o.flash > 0 ? '#ffffff' : c.hull; ctx.strokeStyle = c.core; ctx.lineWidth = 2;
    poly(ctx, 6, r, 0); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    poly(ctx, 6, r * 0.66, 0); ctx.stroke();
    ctx.restore();
    // turret
    ctx.rotate(o.ang || 0);
    weapon(ctx, o.weapon || 'pulse', r, c.core);
    // core
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.45);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, c.core); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, 7); ctx.fill();
    ctx.restore();
  }

  function enemy(ctx, o, t) {
    const r = o.r;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.ang || 0);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.fillStyle = o.flash > 0 ? '#fff' : '#1a1026'; ctx.strokeStyle = o.color; ctx.lineWidth = 2.5;
    switch (o.shape) {
      case 'tri': poly(ctx, 3, r, 0); break;
      case 'square': poly(ctx, 4, r, Math.PI / 4); break;
      case 'hex': poly(ctx, 6, r, 0); break;
      case 'diamond': ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(0, r * 0.7); ctx.lineTo(-r, 0); ctx.lineTo(0, -r * 0.7); ctx.closePath(); break;
      case 'spike': {
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + t * 4; const rr = i % 2 ? r * 0.6 : r * 1.15; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); break;
      }
      default: poly(ctx, 5, r, 0);
    }
    ctx.fill(); ctx.stroke();
    if (o.weapon) weapon(ctx, o.weapon, r * 0.85, o.color);
    ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 7); ctx.fill();
    ctx.restore();
  }

  function boss(ctx, o, t) {
    const r = o.r;
    ctx.save(); ctx.translate(o.x, o.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = o.color; ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // rotating outer ring segments
    ctx.save(); ctx.rotate(t * 0.8);
    ctx.strokeStyle = o.color; ctx.lineWidth = 5;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0, 0, r * 1.25, (i / 6) * Math.PI * 2, (i / 6) * Math.PI * 2 + 0.6); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.rotate(-t * 0.5);
    ctx.fillStyle = o.flash > 0 ? '#fff' : '#150b1f'; ctx.strokeStyle = o.color; ctx.lineWidth = 3;
    const n = o.bossId === 'hydra' ? 3 : o.bossId === 'mking' ? 8 : o.bossId === 'sing' ? 12 : 6;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; const rr = i % 2 ? r * 0.75 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (o.bossId === 'sing') { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, 7); ctx.fill(); ctx.strokeStyle = '#c3b2ff'; ctx.lineWidth = 2; ctx.stroke(); }
    else {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 0.45);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, o.color); g.addColorStop(1, 'rgba(0,0,0,.3)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, 7); ctx.fill();
    }
    if (o.mirrorT > 0) { ctx.strokeStyle = 'rgba(220,240,255,.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, 7); ctx.stroke(); }
    ctx.restore();
  }

  function mkCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  function weaponIcon(id) {
    const k = 'w_' + id; if (cache[k]) return cache[k];
    const c = mkCanvas(240, 140), x = c.getContext('2d');
    const w = WEAPONS[id];
    x.translate(70, 70); x.scale(2.3, 2.3);
    x.shadowColor = w.color; x.shadowBlur = 12;
    weapon(x, id, 22, w.color);
    // bullet preview
    x.shadowBlur = 16; x.fillStyle = w.color;
    const bx = 22 * 1.9;
    if (id === 'scatter') { for (let i = -2; i <= 2; i++) { x.beginPath(); x.arc(bx + 6, i * 5, 2, 0, 7); x.fill(); } }
    else if (id === 'singularity') { x.fillStyle = '#05020f'; x.beginPath(); x.arc(bx + 8, 0, 7, 0, 7); x.fill(); x.strokeStyle = w.color; x.lineWidth = 2; x.stroke(); }
    else if (id === 'lance') { x.fillRect(bx, -1.5, 22, 3); }
    else if (id === 'swarm') { [-6, 0, 6].forEach((y) => { x.beginPath(); x.arc(bx + 4 + Math.abs(y), y, 2, 0, 7); x.fill(); }); }
    else { x.beginPath(); x.arc(bx + 5, 0, w.r * 0.6, 0, 7); x.fill(); }
    return (cache[k] = c.toDataURL());
  }

  function shipIcon(skin, wid, size) {
    const k = 's_' + skin + '_' + wid + '_' + (size || 160); if (cache[k]) return cache[k];
    const S = size || 160;
    const c = mkCanvas(S, S), x = c.getContext('2d');
    x.scale(S / 160, S / 160);
    ship(x, { x: 72, y: 80, r: 34, ang: -0.35, body: 0.3, skin, weapon: wid }, 1.3);
    return (cache[k] = c.toDataURL());
  }

  function abilityIcon(id) {
    const k = 'a_' + id; if (cache[k]) return cache[k];
    const c = mkCanvas(140, 140), x = c.getContext('2d');
    x.translate(70, 70); x.lineCap = 'round'; x.lineJoin = 'round';
    x.shadowColor = '#4de3ff'; x.shadowBlur = 14;
    switch (id) {
      case 'echo':
        [0.25, 0.5, 1].forEach((a, i) => { x.globalAlpha = a; x.strokeStyle = '#4de3ff'; x.lineWidth = 6; poly(x, 6, 26, 0); x.save(); x.restore(); x.translate(-14 * (2 - i) / 2, 0); });
        x.setTransform(1, 0, 0, 1, 70, 70); x.globalAlpha = 1;
        x.strokeStyle = '#e8eaff'; x.lineWidth = 5; x.beginPath(); x.arc(8, 0, 26, 0, 7); x.stroke();
        x.globalAlpha = 0.5; x.beginPath(); x.arc(-10, 0, 26, 0, 7); x.stroke();
        x.globalAlpha = 0.22; x.beginPath(); x.arc(-26, 0, 26, 0, 7); x.stroke(); break;
      case 'blink':
        x.strokeStyle = '#c38bff'; x.lineWidth = 6;
        x.beginPath(); x.moveTo(-34, 22); x.lineTo(-8, -6); x.lineTo(6, 8); x.lineTo(34, -24); x.stroke();
        x.fillStyle = '#c38bff'; x.beginPath(); x.moveTo(34, -24); x.lineTo(18, -22); x.lineTo(30, -10); x.fill(); break;
      case 'mirror':
        x.strokeStyle = '#bfe9ff'; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 32, 0, 7); x.stroke();
        x.lineWidth = 4; x.beginPath(); x.moveTo(-40, -30); x.lineTo(-18, -8); x.lineTo(-38, 10); x.stroke(); break;
      case 'stasis':
        x.strokeStyle = '#9dff6a'; x.lineWidth = 5; x.setLineDash([8, 7]); x.beginPath(); x.arc(0, 0, 34, 0, 7); x.stroke(); x.setLineDash([]);
        x.fillStyle = '#9dff6a'; [[-10, -8], [12, 4], [-4, 14]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); }); break;
      case 'drone':
        x.strokeStyle = '#7fffd4'; x.lineWidth = 3; x.setLineDash([4, 6]); x.beginPath(); x.arc(0, 0, 32, 0, 7); x.stroke(); x.setLineDash([]);
        x.fillStyle = '#7fffd4'; x.beginPath(); x.arc(23, -23, 10, 0, 7); x.fill();
        x.fillStyle = '#e8eaff'; poly(x, 6, 14, 0); x.fill(); break;
    }
    return (cache[k] = c.toDataURL());
  }

  function upgradeIcon(id) {
    const k = 'u_' + id; if (cache[k]) return cache[k];
    const c = mkCanvas(140, 140), x = c.getContext('2d');
    x.translate(70, 70); x.lineWidth = 6; x.lineCap = 'round'; x.shadowBlur = 12;
    const col = { hull: '#4de3ff', thruster: '#ffb347', coolant: '#9dff6a', magnet: '#ffe066' }[id];
    x.strokeStyle = col; x.fillStyle = col; x.shadowColor = col;
    if (id === 'hull') { poly(x, 6, 34, 0); x.stroke(); x.beginPath(); x.moveTo(-14, 0); x.lineTo(14, 0); x.moveTo(0, -14); x.lineTo(0, 14); x.stroke(); }
    if (id === 'thruster') { [-16, 0, 16].forEach((y, i) => { x.beginPath(); x.moveTo(-30 + i * 6, y); x.lineTo(24, y); x.stroke(); }); x.beginPath(); x.moveTo(14, -26); x.lineTo(34, 0); x.lineTo(14, 26); x.stroke(); }
    if (id === 'coolant') { for (let i = 0; i < 6; i++) { x.save(); x.rotate((i / 6) * Math.PI * 2); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -34); x.moveTo(0, -20); x.lineTo(-9, -29); x.moveTo(0, -20); x.lineTo(9, -29); x.stroke(); x.restore(); } }
    if (id === 'magnet') { x.lineWidth = 12; x.beginPath(); x.arc(0, 4, 24, Math.PI, 0); x.stroke(); x.fillRect(-30, 4, 12, 22); x.fillRect(18, 4, 12, 22); }
    return (cache[k] = c.toDataURL());
  }

  function modeIcon(kind, col) {
    const k = 'm_' + kind; if (cache[k]) return cache[k];
    const c = mkCanvas(120, 120), x = c.getContext('2d');
    x.translate(60, 60); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round';
    x.shadowColor = col; x.shadowBlur = 10;
    switch (kind) {
      case 'waves': [-18, 0, 18].forEach((y) => { x.beginPath(); for (let i = -30; i <= 30; i += 3) x.lineTo(i, y + Math.sin(i / 6) * 6); x.stroke(); }); break;
      case 'skull': x.beginPath(); x.arc(0, -6, 24, Math.PI * 0.85, Math.PI * 2.15); x.lineTo(14, 28); x.lineTo(-14, 28); x.closePath(); x.stroke();
        x.beginPath(); x.arc(-9, -4, 6, 0, 7); x.arc(9, -4, 6, 0, 7); x.fill(); break;
      case 'shield': x.beginPath(); x.moveTo(0, -32); x.lineTo(28, -20); x.lineTo(24, 10); x.lineTo(0, 32); x.lineTo(-24, 10); x.lineTo(-28, -20); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(0, -24); x.lineTo(0, 24); x.stroke(); break;
      case 'bounce': x.beginPath(); x.moveTo(-34, -24); x.lineTo(0, 22); x.lineTo(34, -24); x.stroke(); x.fillRect(-36, 26, 72, 6); x.beginPath(); x.arc(34, -24, 6, 0, 7); x.fill(); break;
      case 'glass': x.beginPath(); x.moveTo(-24, -30); x.lineTo(24, -30); x.lineTo(14, 30); x.lineTo(-14, 30); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(-8, -20); x.lineTo(4, 0); x.lineTo(-4, 10); x.lineTo(6, 22); x.stroke(); break;
      case 'coin': x.beginPath(); x.moveTo(0, -32); x.lineTo(26, 0); x.lineTo(0, 32); x.lineTo(-26, 0); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(0, -16); x.lineTo(12, 0); x.lineTo(0, 16); x.lineTo(-12, 0); x.closePath(); x.fill(); break;
      case 'zone': x.setLineDash([7, 6]); x.beginPath(); x.arc(0, 0, 32, 0, 7); x.stroke(); x.setLineDash([]); x.beginPath(); x.arc(0, 0, 10, 0, 7); x.fill(); break;
      case 'crown': x.beginPath(); x.moveTo(-32, 22); x.lineTo(-32, -18); x.lineTo(-14, 0); x.lineTo(0, -26); x.lineTo(14, 0); x.lineTo(32, -18); x.lineTo(32, 22); x.closePath(); x.stroke(); break;
    }
    return (cache[k] = c.toDataURL());
  }

  function cacheIcon() {
    const k = 'cache'; if (cache[k]) return cache[k];
    const c = mkCanvas(200, 200), x = c.getContext('2d');
    x.translate(100, 106);
    x.shadowColor = '#ff4fa3'; x.shadowBlur = 30;
    x.fillStyle = '#1a1030'; x.strokeStyle = '#ff4fa3'; x.lineWidth = 5;
    poly(x, 6, 70, Math.PI / 6); x.fill(); x.stroke();
    x.shadowColor = '#4de3ff'; x.strokeStyle = '#4de3ff'; x.lineWidth = 3;
    poly(x, 6, 46, Math.PI / 6); x.stroke();
    x.fillStyle = '#ffe066'; x.shadowColor = '#ffe066'; x.beginPath(); x.moveTo(0, -26); x.lineTo(20, 0); x.lineTo(0, 26); x.lineTo(-20, 0); x.closePath(); x.fill();
    return (cache[k] = c.toDataURL());
  }

  return { ship, enemy, boss, weapon, poly, skinCols, weaponIcon, shipIcon, abilityIcon, upgradeIcon, modeIcon, cacheIcon };
})();
