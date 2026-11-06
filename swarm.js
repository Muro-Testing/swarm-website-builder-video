// Swarm builder test: hundreds of cursors and typewriter carets build a real HTML page while it scrolls.
// Deterministic: renderFrame(f) derives every element's state from the frame number alone.
(async () => {
const FRAMES = 1200;
const SX = 60, SY = 314;                     // site origin in camera space
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eoc = t => 1 - Math.pow(1 - t, 3);
const eob = (t, s = 1.9) => { const c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry(2026);
const $ = id => document.getElementById(id);
const site = $('site'), ov = $('overlay'), cam = $('cam');
const EVENTS = [];
const ev = (f, type, x = 540, gain = 1) => EVENTS.push({f: Math.round(f), type, pan: clamp((x - 540) / 540, -1, 1), gain});
const div = (parent, cls, css = {}) => { const d = document.createElement('div'); if (cls) d.className = cls; Object.assign(d.style, css); parent.appendChild(d); return d; };
const px = v => v + 'px';
// build front (site y) keyframes, smoothed so the scroll never stops and starts
const FRONT_KEYS = [[0, 260], [60, 300], [250, 1150], [330, 1500], [430, 1950], [620, 2450], [720, 2650], [1200, 2650]];
const frontLin = f => { for (let i = 1; i < FRONT_KEYS.length; i++) { const [f1, y1] = FRONT_KEYS[i], [f0, y0] = FRONT_KEYS[i - 1]; if (f <= f1) return lerp(y0, y1, inv(f0, f1, f)); } return 2650; };
const FRONT = new Float32Array(FRAMES + 200); for (let f = 0; f < FRONT.length; f++) { let a = 0; for (let k = -45; k <= 45; k++) a += frontLin(f - 100 + k); FRONT[f] = a / 91; }
const frontY = f => { const x = clamp(f + 100, 0, FRONT.length - 2); const i = Math.floor(x); return lerp(FRONT[i], FRONT[i + 1], x - i); };
const ss01 = t => t * t * (3 - 2 * t);
const scrollAt = f => clamp(frontY(f) - 640, 0, 1424) * ss01(inv(110, 200, f));
const toCam = (x, y, f) => [x + SX, y + SY - scrollAt(f)];

// ---------- cursors ----------
const ARROW = '<svg viewBox="0 0 34 44" width="34" height="44"><path d="M4 3 L4 35 L12 27.5 L17.5 40 L23.5 37.4 L18 25 L29 25 Z" fill="#ff2a2a" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>';
const cursors = [];
function makeCursor(pathFn, scale = 1) {
  const g1 = div(ov, 'ghost'), g2 = div(ov, 'ghost'); g1.innerHTML = g2.innerHTML = ARROW;
  const el = div(ov, 'cur'); el.innerHTML = ARROW; el.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,.35))';
  const c = {el, g1, g2, pathFn, scale}; cursors.push(c); return c;
}
// bezier travel with a sideways bow, positions in camera space
function travel(a, b, t, bow) {
  const k = eio(clamp(t)); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1]; const cx = mx - dy * bow, cy = my + dx * bow;
  const u = 1 - k; return [u * u * a[0] + 2 * u * k * cx + k * k * b[0], u * u * a[1] + 2 * u * k * cy + k * k * b[1]];
}
const edgePoint = r => { const s = Math.floor(r() * 4), t = r(); return s === 0 ? [-80, t * 1920] : s === 1 ? [1160, t * 1920] : s === 2 ? [t * 1080, -80] : [t * 1080, 2000]; };
// a task cursor: arrives, follows work(f) in site space during [s,e], leaves
function taskCursor(s, e, work, {arrive = 16, leave = 20} = {}) {
  const r = mulberry(Math.floor(R() * 1e9)); const from = edgePoint(r), to = edgePoint(r), bow = (r() - .5) * .6, bow2 = (r() - .5) * .6;
  return makeCursor(f => {
    if (f < s - arrive || f > e + leave) return null;
    const w = work(clamp(f, s, e)); const wc = toCam(w[0], w[1], f);
    if (f < s) return {p: travel(from, wc, inv(s - arrive, s, f), bow), press: 0};
    if (f <= e) return {p: wc, press: w[2] || 0};
    return {p: travel(wc, to, inv(e, e + leave, f), bow2), press: 0};
  });
}

// ---------- page building blocks ----------
const builders = [];   // each: (f) => void
function box(x, y, w, h, s, dur, finalCss, {inner = null, pop = false} = {}) {
  const fin = div(site, 'abs', {left: px(x), top: px(y), width: px(w), height: px(h), opacity: 0, boxSizing: 'border-box', ...finalCss});
  const sel = div(site, 'sel', {left: px(x), top: px(y), display: 'none'});
  if (inner) inner(fin);
  if (pop) {
    builders.push(f => { const k = inv(s, s + 12, f); fin.style.opacity = k > 0 ? 1 : 0; fin.style.transform = `scale(${Math.max(0, eob(k, 2.6))})`; });
    ev(s, 'pop', x + SX);
    return fin;
  }
  taskCursor(s, s + dur, f => { const k = eoc(inv(s, s + dur, f)); return [x + w * k, y + h * k, f >= s && f < s + 3 ? 1 : 0]; });
  ev(s, 'click', x + SX); ev(s + dur, 'release', x + w + SX);
  builders.push(f => {
    const k = eoc(inv(s, s + dur, f));
    sel.style.display = f >= s && f < s + dur + 4 ? 'block' : 'none';
    sel.style.width = px(w * k); sel.style.height = px(h * k);
    const o = inv(s + dur - 2, s + dur + 6, f); fin.style.opacity = o;
    fin.style.transform = `scale(${lerp(.96, 1, eob(o, 1.6))})`;
  });
  return fin;
}
function text(x, y, str, s, {size = 24, weight = 500, font = 'DM', color = '#0b1630', rate = 1.3, caretColor = '#1677ff', parkCursor = true, track = 0, caretFrom = null} = {}) {
  const t = div(site, 'txt', {left: px(x), top: px(y), fontSize: px(size), fontWeight: weight, fontFamily: font, color, letterSpacing: track + 'em', lineHeight: 1.05});
  const spans = [...str].map(ch => { const sp = document.createElement('span'); sp.textContent = ch === ' ' ? ' ' : ch; t.appendChild(sp); return sp; });
  const caret = div(site, 'caret', {height: px(size * 1.05), background: caretColor, display: 'none'});
  const e = s + str.length * rate;
  spans.forEach((sp, i) => { if (str[i] !== ' ') ev(s + i * rate, 'key', x + SX + i * size * .55, .8); });
  let offs = null;
  if (parkCursor) taskCursor(s - 2, e + 4, f => [x - 34 + Math.min(1, (f - s) / (e - s)) * 30, y + size * 1.25 + Math.sin(f * .4) * 3]);
  builders.push(f => {
    if (!offs) offs = spans.map(sp => sp.offsetLeft + sp.offsetWidth);
    const n = clamp(Math.floor((f - s) / rate) + 1, 0, spans.length);
    spans.forEach((sp, i) => {
      const on = i < n; sp.style.visibility = on ? 'visible' : 'hidden';
      if (on) { const k = inv(s + i * rate, s + i * rate + 7, f); sp.style.transform = `translateY(${(1 - eoc(k)) * size * .25}px) scale(${lerp(1.35, 1, eoc(k))})`; sp.style.opacity = lerp(.2, 1, k); }
    });
    const live = f >= (caretFrom ?? s - 10) && f < e + 22; caret.style.display = live && (f < s || f > e ? Math.floor(f / 9) % 2 === 0 : true) ? 'block' : 'none';
    caret.style.left = px(x + (n ? offs[n - 1] : 0) + 2); caret.style.top = px(y);
  });
  return {el: t, end: e};
}

// ---------- page content (fictional demo business) ----------
const hero = div(site, 'abs', {left: 0, top: px(84), width: px(960), height: px(1000), background: 'radial-gradient(700px 500px at 85% 20%,rgba(138,43,255,.18),transparent 60%),radial-gradient(800px 600px at 10% 70%,rgba(0,229,255,.16),transparent 60%),linear-gradient(180deg,#f3f7ff,#ffffff)', clipPath: 'circle(0px at 700px 220px)'});
builders.push(f => { const k = eoc(inv(52, 96, f)); hero.style.clipPath = `circle(${k * 1300}px at 700px 220px)`; });
taskCursor(46, 56, f => [700, 304, f >= 52 && f < 56 ? 1 : 0]); ev(52, 'paint', 760);
box(0, 0, 960, 84, 38, 16, {background: '#fff', borderBottom: '1px solid #e6eaf2'});
box(32, 22, 44, 40, 58, 0, {background: 'linear-gradient(135deg,#1677ff,#8a2bff)', borderRadius: '12px'}, {pop: true});
text(90, 27, 'NORTHLINE', 62, {size: 24, weight: 700, font: 'UB', rate: 1.2});
[['Services', 410], ['Work', 528], ['Pricing', 606]].forEach(([w, x], i) => text(x, 31, w, 70 + i * 4, {size: 20, weight: 500, color: '#42506b', rate: 1.4}));
box(746, 18, 184, 48, 64, 14, {background: '#0b1630', borderRadius: '24px'});
text(782, 30, 'Book a call', 84, {size: 19, weight: 600, color: '#fff', rate: 1.2, caretColor: '#00e5ff'});
// headline: the first caret blinks alone before the swarm arrives
const h1 = text(56, 176, 'Websites that', 34, {size: 74, weight: 800, font: 'UB', rate: 2.1, parkCursor: false, caretFrom: -99});
const h2 = text(56, 270, 'win clients.', h1.end + 2, {size: 74, weight: 800, font: 'UB', rate: 2.1, color: '#1677ff', parkCursor: false});
text(56, 388, 'Built, launched and found on Google.', 96, {size: 30, weight: 400, color: '#42506b', rate: .85});
text(56, 432, 'Ready in days, not months.', 104, {size: 30, weight: 400, color: '#42506b', rate: .85});
const cta = box(56, 500, 300, 80, 112, 14, {background: 'linear-gradient(90deg,#1677ff,#8a2bff)', borderRadius: '40px', boxShadow: '0 18px 40px rgba(22,119,255,.35)'});
text(96, 524, 'Get my website', 128, {size: 26, weight: 600, color: '#fff', rate: 1.1, caretColor: '#00e5ff'});
box(376, 500, 260, 80, 118, 14, {border: '2px solid #0b1630', borderRadius: '40px'});
text(416, 524, 'See our work', 134, {size: 26, weight: 600, rate: 1.1});
// CTA click: cursor presses, ripple and glow
taskCursor(170, 182, f => [250, 556, f >= 176 && f < 181 ? 1 : 0], {arrive: 14});
const rip = div(site, 'ripple', {display: 'none'}); ev(176, 'bigclick', 310);
builders.push(f => {
  const k = inv(176, 200, f); rip.style.display = k > 0 && k < 1 ? 'block' : 'none';
  const r = 20 + eoc(k) * 220; Object.assign(rip.style, {left: px(250 - r), top: px(556 - r), width: px(r * 2), height: px(r * 2), opacity: 1 - k, borderColor: '#8a2bff'});
  const pr = f >= 176 && f < 182 ? .94 : 1; if (f >= 126) cta.style.transform = `scale(${pr})`;
  cta.style.boxShadow = `0 18px 40px rgba(22,119,255,.35),0 0 ${80 * Math.exp(-Math.max(0, f - 176) / 10) * (f >= 176 ? 1 : 0)}px rgba(138,43,255,.9)`;
});
// hero image assembled from tiles carried by cursors
const IX = 56, IY = 630, IW = 848, IH = 400, TC = 8, TR = 5, TW = IW / TC, TH = IH / TR;
box(IX, IY, IW, IH, 126, 16, {background: '#0b1630', borderRadius: '24px', boxShadow: '0 30px 60px rgba(11,22,48,.25)'});
const art = document.createElement('canvas'); art.width = IW; art.height = IH; {
  const g = art.getContext('2d'); const gr = g.createLinearGradient(0, 0, IW, IH); gr.addColorStop(0, '#0b1630'); gr.addColorStop(1, '#1a1050'); g.fillStyle = gr; g.fillRect(0, 0, IW, IH);
  const card = (x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill(); };
  card(24, 24, 520, 352); card(560, 24, 264, 166); card(560, 210, 264, 166);
  g.strokeStyle = '#00e5ff'; g.lineWidth = 5; g.beginPath(); for (let i = 0; i <= 40; i++) { const x = 50 + i * 11.8, y = 300 - i * 4.2 - Math.sin(i * .7) * 22; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  const fill = g.createLinearGradient(0, 120, 0, 360); fill.addColorStop(0, 'rgba(0,229,255,.35)'); fill.addColorStop(1, 'rgba(0,229,255,0)'); g.lineTo(522, 350); g.lineTo(50, 350); g.fillStyle = fill; g.fill();
  for (let i = 0; i < 7; i++) { const h = 30 + ((i * 37) % 90); const bg = g.createLinearGradient(0, 170 - h, 0, 170); bg.addColorStop(0, '#8a2bff'); bg.addColorStop(1, '#1677ff'); g.fillStyle = bg; g.beginPath(); g.roundRect(584 + i * 34, 170 - h, 22, h, 6); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 14; g.beginPath(); g.arc(692, 293, 56, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#00e5ff'; g.beginPath(); g.arc(692, 293, 56, -Math.PI / 2, Math.PI * 1.1); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.75)'; [[50, 50, 160], [50, 76, 100]].forEach(([x, y, w]) => { g.beginPath(); g.roundRect(x, y, w, 12, 6); g.fill(); });
}
const artURL = art.toDataURL();
const order = [...Array(TC * TR).keys()].sort(() => R() - .5);
order.forEach((ti, k) => {
  const cx = ti % TC, cy = Math.floor(ti / TC), tx = IX + cx * TW, ty = IY + cy * TH;
  const land = 146 + k * 1.35, fly = 20;
  const css = {width: px(TW), height: px(TH), backgroundImage: `url(${artURL})`, backgroundSize: `${IW}px ${IH}px`, backgroundPosition: `${-cx * TW}px ${-cy * TH}px`};
  const rad = {borderTopLeftRadius: ti === 0 ? '24px' : 0, borderTopRightRadius: ti === TC - 1 ? '24px' : 0, borderBottomLeftRadius: ti === TC * (TR - 1) ? '24px' : 0, borderBottomRightRadius: ti === TC * TR - 1 ? '24px' : 0};
  const fixed = div(site, 'tile', {...css, ...rad, left: px(tx), top: px(ty), opacity: 0});
  const flying = div(ov, 'tile', {...css, ...rad, left: 0, top: 0, display: 'none', boxShadow: '0 20px 30px rgba(0,0,0,.35)'});
  const r = mulberry(ti * 77 + 5); const from = edgePoint(r), bow = (r() - .5) * .7, rot = (r() - .5) * 60;
  ev(land, 'snap', tx + SX, .7);
  builders.push(f => {
    const k2 = inv(land - fly, land, f);
    if (f < land - fly || f >= land) flying.style.display = 'none';
    else { const tc = toCam(tx, ty, f); const p = travel(from, tc, k2, bow); flying.style.display = 'block'; flying.style.transform = `translate(${p[0]}px,${p[1]}px) rotate(${rot * (1 - eio(k2))}deg) scale(${lerp(.7, 1, eio(k2))})`; }
    fixed.style.opacity = f >= land ? 1 : 0;
    fixed.style.filter = `brightness(${1 + 1.2 * Math.exp(-Math.max(0, f - land) / 4) * (f >= land ? 1 : 0)})`;
  });
  // the carrying cursor rides on the tile's top-left corner, then flies off
  const r2 = mulberry(ti * 31 + 9); const to = edgePoint(r2), bow2 = (r2() - .5) * .6;
  makeCursor(f => {
    if (f < land - fly || f > land + 18) return null;
    if (f < land) { const tc = toCam(tx, ty, f); const p = travel(from, tc, inv(land - fly, land, f), bow); return {p: [p[0] + 18, p[1] + 14], press: f > land - 3 ? 1 : 0}; }
    const tc = toCam(tx + 18, ty + 14, f); return {p: travel(tc, to, inv(land, land + 18, f), bow2), press: 0};
  });
});
// stats row
[['Mobile-first', 56], ['SEO-ready', 348], ['Fast loading', 640]].forEach(([w, x], i) => {
  box(x, 1070, 264, 120, 176 + i * 6, 14, {background: '#fff', border: '1px solid #e3e8f0', borderRadius: '20px', boxShadow: '0 12px 30px rgba(11,22,48,.08)'});
  box(x + 22, 1102, 56, 56, 196 + i * 5, 0, {background: 'linear-gradient(135deg,#00e5ff,#1677ff)', borderRadius: '16px'}, {pop: true});
  text(x + 94, 1114, w, 200 + i * 5, {size: 24, weight: 700, rate: 1.1});
});
// features section revealed by the scroll
text(56, 1250, 'Everything customers need', 204, {size: 40, weight: 700, font: 'UB', rate: 1.05});
[['Online booking', 56], ['Real reviews', 348], ['Instant contact', 640]].forEach(([w, x], i) => {
  box(x, 1330, 264, 300, 216 + i * 6, 16, {background: '#fff', border: '1px solid #e3e8f0', borderRadius: '24px', boxShadow: '0 16px 36px rgba(11,22,48,.09)'});
  box(x + 28, 1360, 64, 64, 236 + i * 5, 0, {background: ['linear-gradient(135deg,#1677ff,#8a2bff)', 'linear-gradient(135deg,#00e5ff,#1677ff)', 'linear-gradient(135deg,#8a2bff,#ff2a8a)'][i], borderRadius: '18px'}, {pop: true});
  text(x + 28, 1450, w, 244 + i * 5, {size: 26, weight: 700, rate: 1.1});
  for (let l = 0; l < 3; l++) {
    const bar = div(site, 'abs', {left: px(x + 28), top: px(1500 + l * 30), height: px(12), width: 0, borderRadius: '6px', background: '#e6ebf3'});
    const s = 256 + i * 5 + l * 4, W = [200, 180, 130][l];
    builders.push(f => { bar.style.width = px(W * eoc(inv(s, s + 14, f))); });
  }
});


function clickAt(x, y, f0, color = '#8a2bff') {
  taskCursor(f0 - 6, f0 + 6, f => [x - 6, y - 4, f >= f0 && f < f0 + 5 ? 1 : 0], {arrive: 14});
  const rp = div(site, 'ripple', {display: 'none', borderColor: color}); ev(f0, 'bigclick', x + SX);
  builders.push(f => { const k = inv(f0, f0 + 24, f); rp.style.display = k > 0 && k < 1 ? 'block' : 'none'; const r = 16 + eoc(k) * 160; Object.assign(rp.style, {left: px(x - r), top: px(y - r), width: px(r * 2), height: px(r * 2), opacity: 1 - k}); });
}
// testimonials
text(56, 1720, 'Loved by local clients', 300, {size: 40, weight: 700, font: 'UB', rate: 1.1});
[['Sarah, caf\u00e9 owner', 56], ['Dan, plumber', 492]].forEach(([who, x], i) => {
  box(x, 1800, 412, 260, 318 + i * 8, 16, {background: '#fff', border: '1px solid #e3e8f0', borderRadius: '24px', boxShadow: '0 16px 36px rgba(11,22,48,.09)'});
  text(x + 28, 1828, '\u2605\u2605\u2605\u2605\u2605', 338 + i * 6, {size: 30, weight: 700, color: '#f5b301', rate: 2, parkCursor: false});
  for (let l = 0; l < 3; l++) { const bar = div(site, 'abs', {left: px(x + 28), top: px(1892 + l * 30), height: px(12), width: 0, borderRadius: '6px', background: '#e6ebf3'}); const s0 = 348 + i * 6 + l * 4, W = [340, 320, 210][l]; builders.push(f => { bar.style.width = px(W * eoc(inv(s0, s0 + 14, f))); }); }
  text(x + 28, 2004, who, 364 + i * 6, {size: 22, weight: 600, color: '#42506b', rate: 1.1});
});
// contact form
text(56, 2140, 'Book your free call', 398, {size: 40, weight: 700, font: 'UB', rate: 1.1});
box(56, 2210, 848, 420, 412, 18, {background: '#0b1630', borderRadius: '28px', boxShadow: '0 30px 60px rgba(11,22,48,.25)'});
[[2250, 70, 432], [2340, 70, 440], [2430, 110, 448]].forEach(([y, h, s0]) => box(96, y, 768, h, s0, 12, {background: '#fff', borderRadius: '16px'}));
text(124, 2272, 'Sarah Mitchell', 452, {size: 24, rate: 1.1});
text(124, 2362, 'sarah@example.com', 466, {size: 24, rate: 1});
text(124, 2452, 'Can you build our new site?', 484, {size: 24, rate: .9});
box(96, 2560, 320, 56, 506, 12, {background: 'linear-gradient(90deg,#1677ff,#8a2bff)', borderRadius: '28px'});
text(140, 2572, 'Send request', 520, {size: 22, weight: 600, color: '#fff', rate: 1.1, caretColor: '#00e5ff'});
clickAt(256, 2588, 560);
text(446, 2572, '\u2713 Request sent', 568, {size: 22, weight: 700, color: '#28c840', rate: .6, parkCursor: false});
// footer
box(0, 2690, 960, 110, 590, 16, {background: '#0b1630'});
text(56, 2726, 'NORTHLINE', 606, {size: 26, weight: 700, font: 'UB', color: '#fff', rate: 1.2, caretColor: '#00e5ff'});

// ---------- the idle swarm: flocks around the build front, clicking at random ----------
const SWARM = 120;
// keyword letters sampled into cursor targets (screen space)
const TARGETS = (() => {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 420; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.font = '900 230px UB'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SWARM', 540, 215);
  const d = g.getImageData(0, 0, 1080, 420).data, pts = [];
  for (let y = 0; y < 420; y += 21) for (let x = (y / 21) % 2 ? 10 : 0; x < 1080; x += 21) if (d[(y * 1080 + x) * 4 + 3] > 140) pts.push([x - 12, y + 690]);
  const rr = mulberry(77); for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return pts;
})();
function camParams(f) {
  const z = eio(inv(26, 96, f)), pb = eio(inv(760, 830, f)), rec = eio(inv(830, 900, f));
  const caret = toCam(70, 214, f), front = [540, toCam(480, frontY(f), f)[1]], whole = [540, 970];
  let P = [lerp(caret[0], front[0], z), lerp(caret[1], front[1], z)]; P = [lerp(P[0], whole[0], pb), lerp(P[1], whole[1], pb)];
  const s = lerp(lerp(lerp(2.6, 1.12, z), .9, pb), .62, rec);
  const C = [540, lerp(lerp(820, 900, z), 960, pb)];
  return {s, tx: C[0] - P[0] * s, ty: C[1] - P[1] * s, rot: (1 - z) * 8};
}
function formation(i, f, startCam, fs0, fd, bow, fromScreen) {
  const tgt = TARGETS[i % TARGETS.length]; const jit = [Math.sin(f * .08 + i) * 2.5, Math.cos(f * .07 + i * 1.7) * 2.5];
  const tScreen = [tgt[0] + jit[0], tgt[1] + jit[1]];
  let startScreen = fromScreen;
  if (!startScreen) { const k0 = camParams(fs0); startScreen = [startCam[0] * k0.s + k0.tx, startCam[1] * k0.s + k0.ty]; }
  const sp = travel(startScreen, tScreen, inv(fs0, fs0 + fd, f), bow);
  const camp = camParams(f); const land = f >= fs0 + fd && f < fs0 + fd + 4;
  return {p: [(sp[0] - camp.tx) / camp.s, (sp[1] - camp.ty) / camp.s], press: land ? 1 : 0, scale: .78 / camp.s};
}
const focusAt = f => toCam(480, frontY(f) - 120, f);
for (let i = 0; i < SWARM; i++) {
  const r = mulberry(1000 + i); const from = edgePoint(r), enter = (i % 2 ? -34 : 14) + r() * 40, dur = 30 + r() * 18, bow = (r() - .5) * .8;
  const rx = 220 + r() * 380, ry = 140 + r() * 300, ph = r() * 6.28, sp = (.012 + r() * .02) * (r() < .5 ? -1 : 1), wob = r() * 6.28, sc = .62 + r() * .4;
  const orbit = f => { const c = focusAt(f); const a = ph + f * sp; return [c[0] + Math.cos(a) * rx + Math.sin(f * .05 + wob) * 26, c[1] + Math.sin(a) * ry + Math.cos(f * .045 + wob) * 22]; };
  const clicks = []; for (let f = enter + dur + r() * 40; f < 830; f += 40 + r() * 70) clicks.push(Math.round(f));
  clicks.forEach(f => { const p = orbit(f); ev(f, 'tick', p[0], .35); });
  const fs0 = 846 + r() * 34, fd = 34 + r() * 22;
  const c = makeCursor(f => {
    if (f < enter) return null;
    if (f >= fs0) return formation(i, f, orbit(fs0), fs0, fd, bow);
    const p = f < enter + dur ? travel(from, orbit(enter + dur), inv(enter, enter + dur, f), bow) : orbit(f);
    return {p, press: clicks.some(k => f >= k && f < k + 3) ? 1 : 0};
  }, sc);
  c.clicks = clicks; ev(fs0 + fd, 'tick', 540, .6);
}
for (let i = SWARM; i < TARGETS.length; i++) {
  const r = mulberry(5000 + i); const from = edgePoint(r), fs0 = 850 + r() * 50, fd = 30 + r() * 24, bow = (r() - .5) * .8;
  makeCursor(f => f < fs0 ? null : formation(i, f, null, fs0, fd, bow, from), 1); ev(fs0 + fd, 'tick', 540, .6);
}
ev(842, 'whoosh', 540, 1); ev(862, 'riser', 540, 1); ev(942, 'impact', 540, 1);
ev(18, 'whoosh', 540, 1); ev(40, 'swell', 540, 1);
const ripPool = []; for (const c of cursors) if (c.clicks) for (const k of c.clicks) ripPool.push({c, k, el: div(ov, 'ripple', {display: 'none'})});

// ---------- on-screen copy ----------
const glowEl = div(document.body, '', {position: 'absolute', left: '40px', top: '600px', width: '1000px', height: '600px', background: 'radial-gradient(closest-side,rgba(255,42,42,.45),rgba(138,43,255,.18) 55%,transparent)', opacity: 0, zIndex: 30, pointerEvents: 'none'});
const CAPS = [
  {from: 0, to: 176, lines: [['Building websites', 'with Claude?'], ['You can make videos', 'like this too.']], top: 300, big: true, still: true},
  {from: 186, to: 372, lines: [['Every cursor you see', 'is a few lines of code.']], top: 300},
  {from: 382, to: 566, lines: [['Claude wrote it.', 'I just told it what to build.']], top: 300},
  {from: 576, to: 760, lines: [['No After Effects.', 'No Blender.']], top: 300},
  {from: 948, to: 1300, lines: [['Comment <b>SWARM</b> and', "I'll DM you the code."]], top: 1180}
];
const capEls = CAPS.map(c => {
  const el = div(document.body, '', {position: 'absolute', left: '0', width: '1080px', top: px(c.top), zIndex: 40, textAlign: 'center', fontFamily: 'DM', color: '#fff', pointerEvents: 'none'});
  const panel = div(el, '', {display: 'inline-block', padding: '26px 44px 30px', borderRadius: '34px', background: 'rgba(5,10,24,.9)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 24px 60px rgba(0,0,0,.45)'});
  c.words = [];
  c.lines.forEach((pair, li) => pair.forEach((line, k) => {
    const row = div(panel, '', {display: 'block', margin: '0 auto', fontWeight: 800, fontSize: px(c.big ? (li ? 50 : 76) : 62), lineHeight: 1.12, letterSpacing: '-.01em', marginTop: px(li && !k ? 26 : 0)});
    line.split(' ').forEach(w => { const sp = document.createElement('span'); sp.innerHTML = w + '&nbsp;'; sp.style.display = 'inline-block'; sp.style.textShadow = '0 6px 28px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.9)'; row.appendChild(sp); c.words.push({sp, li}); });
  }));
  el.querySelectorAll('b').forEach(b => { b.style.color = '#ff2a2a'; b.style.textShadow = '0 0 24px rgba(255,42,42,.6)'; });
  return el;
});
const capBack = null && div(document.body, '', {position: 'absolute', left: 0, top: '230px', width: '1080px', height: '360px', zIndex: 35, pointerEvents: 'none', background: 'linear-gradient(180deg,rgba(3,7,17,0) 0%,rgba(3,7,17,.62) 28%,rgba(3,7,17,.62) 72%,rgba(3,7,17,0) 100%)'});
function renderCaptions(f) {
  let back = 0;
  CAPS.forEach((c, ci) => {
    const el = capEls[ci]; const on = f >= c.from && f < c.to; el.style.display = on ? 'block' : 'none'; if (!on) return;
    const out = inv(c.to - 8, c.to, f); el.style.opacity = 1 - out; if (c.top < 600) back = Math.max(back, 1 - out);
    c.words.forEach((w, k) => {
      const st = c.still ? -99 : c.from + (c.still ? 34 : 0) + k * 3; const t = inv(st, st + 9, f);
      w.sp.style.opacity = t; w.sp.style.transform = `translateY(${(1 - eoc(t)) * 26}px) scale(${lerp(.86, 1, eob(t, 2))})`;
    });
  });
}
CAPS.forEach(c => c.words.forEach((w, k) => { if (!c.still) ev(c.from + (c.still ? 34 : 0) + k * 3, 'word', 540, .5); }));

// ---------- frame ----------
const opening = $('browser');
window.renderFrame = f => {
  const K = camParams(f);
  cam.style.transformOrigin = '0 0';
  cam.style.transform = `perspective(2400px) translate(${K.tx}px,${K.ty}px) scale(${K.s}) rotateX(${K.rot}deg)`;
  const dim = eio(inv(836, 900, f)); opening.style.filter = `brightness(${1 - dim * .72}) blur(${dim * 5}px)`;
  glowEl.style.opacity = .9 * Math.exp(-Math.max(0, f - 942) / 18) * (f >= 940 ? 1 : 0) + ss01(inv(940, 1000, f)) * .35;
  renderCaptions(f);
  site.style.transform = `translateY(${-scrollAt(f)}px)`;
  for (const b of builders) b(f);
  for (const c of cursors) {
    const st = c.pathFn(f);
    if (!st) { c.el.style.display = c.g1.style.display = c.g2.style.display = 'none'; continue; }
    const sc = (st.scale || c.scale) * (st.press ? .82 : 1);
    c.el.style.display = 'block'; c.el.style.transform = `translate(${st.p[0]}px,${st.p[1]}px) scale(${sc})`;
    const a = c.pathFn(f - 1.2), b = c.pathFn(f - 2.4);
    [[c.g1, a, .3], [c.g2, b, .15]].forEach(([g, q, o]) => {
      if (!q) { g.style.display = 'none'; return; }
      const sp = Math.hypot(q.p[0] - st.p[0], q.p[1] - st.p[1]); g.style.display = sp > 6 ? 'block' : 'none';
      g.style.opacity = Math.min(o, sp / 80 * o); g.style.transform = `translate(${q.p[0]}px,${q.p[1]}px) scale(${q.scale || c.scale})`;
    });
  }
  for (const rp of ripPool) {
    const k = inv(rp.k, rp.k + 16, f); if (k <= 0 || k >= 1) { rp.el.style.display = 'none'; continue; }
    const st = rp.c.pathFn(rp.k); if (!st) continue; const r = 6 + eoc(k) * 34;
    Object.assign(rp.el.style, {display: 'block', left: px(st.p[0] + 4 - r), top: px(st.p[1] + 3 - r), width: px(r * 2), height: px(r * 2), opacity: (1 - k) * .8, borderWidth: '2px'});
  }
};
await document.fonts.ready;
EVENTS.sort((a, b) => a.f - b.f);
window.EVENTS = EVENTS; window.FRAMES = FRAMES;
window.renderFrame(0); window.ready = true;
})();
