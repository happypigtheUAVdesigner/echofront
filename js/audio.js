'use strict';
// Procedural sound effects with WebAudio. No audio files needed.
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null, muted = false;
  const last = {};
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.32; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function tone(type, f0, f1, dur, vol, delay) {
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, delay) {
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  const bank = {
    pulse: () => { tone('square', 880, 330, 0.08, 0.12); },
    scatter: () => { noise(0.14, 0.35, 900, 0.6); tone('sawtooth', 220, 80, 0.12, 0.1); },
    needle: () => { tone('square', 1400, 900, 0.03, 0.06); },
    lance: () => { tone('sawtooth', 1800, 120, 0.28, 0.14); noise(0.2, 0.15, 3000, 2); },
    mortar: () => { tone('sine', 160, 60, 0.25, 0.3); },
    prism: () => { tone('triangle', 1200, 600, 0.1, 0.12); tone('triangle', 1800, 900, 0.1, 0.06, 0.02); },
    swarm: () => { noise(0.18, 0.12, 2400, 1.5); tone('square', 500, 900, 0.12, 0.05); },
    singularity: () => { tone('sine', 90, 40, 0.6, 0.35); tone('sawtooth', 400, 60, 0.5, 0.08); },
    drone: () => { tone('square', 1600, 1200, 0.03, 0.04); },
    boss: () => { tone('sawtooth', 300, 140, 0.12, 0.06); },
    hit: () => { noise(0.06, 0.25, 2200, 1); },
    bank: () => { tone('triangle', 1320, 1760, 0.08, 0.12); },
    bounce: () => { tone('sine', 2400, 1800, 0.04, 0.04); },
    hurt: () => { tone('square', 200, 90, 0.15, 0.18); noise(0.1, 0.2, 600, 1); },
    kill: () => { tone('square', 660, 1320, 0.12, 0.12); tone('square', 990, 1980, 0.12, 0.08, 0.06); },
    die: () => { tone('sawtooth', 400, 40, 0.6, 0.2); noise(0.5, 0.25, 400, 0.5); },
    boom: () => { noise(0.45, 0.45, 300, 0.4); tone('sine', 120, 30, 0.4, 0.35); },
    dash: () => { noise(0.15, 0.2, 1800, 0.5); },
    echo: () => { tone('sine', 300, 900, 0.25, 0.15); tone('sine', 600, 1800, 0.25, 0.08, 0.08); },
    ability: () => { tone('triangle', 500, 1000, 0.18, 0.15); },
    vent: () => { noise(0.4, 0.4, 700, 0.3); tone('sine', 200, 50, 0.35, 0.3); },
    overheat: () => { tone('square', 300, 150, 0.3, 0.12); tone('square', 300, 150, 0.3, 0.12, 0.15); },
    coin: () => { tone('square', 1320, 1320, 0.05, 0.07); tone('square', 1760, 1760, 0.08, 0.07, 0.05); },
    pickup: () => { tone('triangle', 600, 1200, 0.15, 0.12); },
    click: () => { tone('triangle', 900, 700, 0.04, 0.08); },
    buy: () => { [0, 0.07, 0.14].forEach((d, i) => tone('square', 660 * (1 + i * 0.25), 0, 0.09, 0.08, d)); },
    error: () => { tone('square', 180, 140, 0.18, 0.1); },
    level: () => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, 0, 0.18, 0.14, i * 0.09)); },
    win: () => { [523, 659, 784, 659, 1046].forEach((f, i) => tone('square', f, 0, 0.16, 0.1, i * 0.12)); },
    lose: () => { [400, 340, 280, 200].forEach((f, i) => tone('triangle', f, 0, 0.22, 0.12, i * 0.15)); },
    wave: () => { tone('sawtooth', 110, 220, 0.6, 0.12); },
    spin: () => { tone('square', 1000, 0, 0.02, 0.04); },
    notify: () => { tone('sine', 880, 0, 0.1, 0.1); tone('sine', 1320, 0, 0.14, 0.1, 0.09); },
  };
  return {
    init,
    setMuted(m) { muted = m; },
    get muted() { return muted; },
    play(name, minGap) {
      if (muted || !ac || !bank[name]) return;
      const t = performance.now();
      if (last[name] && t - last[name] < (minGap || 30)) return;
      last[name] = t;
      try { bank[name](); } catch (e) { /* ignore */ }
    },
  };
})();
