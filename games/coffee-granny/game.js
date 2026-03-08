'use strict';

const canvas = document.getElementById('granny-canvas');
const ctx    = canvas.getContext('2d');
const CW = canvas.width;   // 280
const CH = canvas.height;  // 340

// ─── Upgrade definitions ──────────────────────────────
const UPGRADE_DEFS = [
  { id: 'beans',   name: 'Better Beans',    icon: '☕', desc: '+1 per click',   baseCost: 15,    cpc: 1,  cps: 0  },
  { id: 'biscuit', name: 'Biscuits',         icon: '🍪', desc: '+3 per click',   baseCost: 80,    cpc: 3,  cps: 0  },
  { id: 'cat',     name: 'Lap Cat',          icon: '🐱', desc: '+2 per second',  baseCost: 120,   cpc: 0,  cps: 2  },
  { id: 'blanket', name: 'Cozy Blanket',     icon: '🧣', desc: '+6 per click',   baseCost: 400,   cpc: 6,  cps: 0  },
  { id: 'rocker',  name: 'Rocking Chair',    icon: '🪑', desc: '+5 per second',  baseCost: 600,   cpc: 0,  cps: 5  },
  { id: 'knit',    name: 'Knitting',         icon: '🧶', desc: '+12 per click',  baseCost: 1200,  cpc: 12, cps: 0  },
  { id: 'bigmug',  name: 'Bigger Mug',       icon: '🫖', desc: '+15 per second', baseCost: 3000,  cpc: 0,  cps: 15 },
  { id: 'garden',  name: 'Garden Stroll',    icon: '🌷', desc: '+40 per second', baseCost: 10000, cpc: 0,  cps: 40 },
  { id: 'nap',     name: 'Afternoon Nap',    icon: '💤', desc: '+100/sec',       baseCost: 40000, cpc: 0,  cps: 100 },
];

const HAPPINESS = [
  [0,      'Settling in…'],
  [50,     'Cozy'],
  [200,    'Content'],
  [1000,   'Blissful'],
  [5000,   'Heavenly'],
  [20000,  'Pure Joy'],
  [100000, 'Transcendent'],
];

// ─── State ────────────────────────────────────────────
let state;

function initState() {
  state = {
    contentment:      0,
    totalContentment: 0,
    cpc: 1,
    cps: 0,
    upgrades:   UPGRADE_DEFS.map(d => ({ ...d, count: 0 })),
    clicks:     0,    // total click count
    clickAnim:  0,    // 0→1 on click, decays to 0
    rubPhase:   0,    // continuous rotation (rad)
    burpAnim:   0,    // 1→0 while burp plays
    fartAnim:   0,    // 1→0 while fart plays
    steam:      [],
    floaters:   [],
    lastTime:   0,
  };
}

function upgradeCost(upg) {
  return Math.ceil(upg.baseCost * Math.pow(1.15, upg.count));
}

function formatNum(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function happinessLabel(total) {
  let label = HAPPINESS[0][1];
  for (const [thresh, lbl] of HAPPINESS) {
    if (total >= thresh) label = lbl;
  }
  return label;
}

// ─── Input ────────────────────────────────────────────
canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (CW / rect.width);
  const my = (e.clientY - rect.top)  * (CH / rect.height);
  doClick(mx, my);
});

function doClick(x, y) {
  state.contentment      += state.cpc;
  state.totalContentment += state.cpc;
  state.clickAnim = 1;
  state.clicks++;

  state.floaters.push({
    x, y: y - 10,
    vy: -1.4,
    text: `+${formatNum(state.cpc)}`,
    life: 55, maxLife: 55,
  });

  // Steam burst from mug top
  for (let i = 0; i < 4; i++) addSteam(true);

  // Milestones — fart check first (every 100), burp for remaining 50s
  if (state.clicks % 100 === 0) {
    state.fartAnim = 1;
    playFart();
  } else if (state.clicks % 50 === 0) {
    state.burpAnim = 1;
    playBurp();
  }

  updateUpgradesUI();
  updateScoreDOM();
}

// ─── Steam ────────────────────────────────────────────
const MUG_X = CW / 2 + 52;
const MUG_STEAM_Y = 100;

function addSteam(burst) {
  const life = (40 + Math.random() * 35) | 0;
  state.steam.push({
    x: MUG_X + (Math.random() - 0.5) * 10,
    y: MUG_STEAM_Y,
    vx: (Math.random() - 0.5) * 0.35,
    vy: -(0.35 + Math.random() * 0.3 + (burst ? 0.5 : 0)),
    r: 2.5 + Math.random() * 2.5,
    life, maxLife: life,
  });
}

// ─── Update ───────────────────────────────────────────
function update(dt) {
  state.contentment      += state.cps * dt;
  state.totalContentment += state.cps * dt;

  state.clickAnim = Math.max(0, state.clickAnim - dt * 2.8);
  state.burpAnim  = Math.max(0, state.burpAnim  - dt * 0.38);
  state.fartAnim  = Math.max(0, state.fartAnim  - dt * 0.38);
  state.rubPhase += dt * (0.9 + state.clickAnim * 3.5);

  // Passive steam
  if (Math.random() < 0.12) addSteam(false);

  for (const s of state.steam) {
    s.x += s.vx; s.y += s.vy; s.r += 0.025; s.life--;
  }
  state.steam = state.steam.filter(s => s.life > 0);

  for (const f of state.floaters) { f.y += f.vy; f.life--; }
  state.floaters = state.floaters.filter(f => f.life > 0);

  updateScoreDOM();
  updateUpgradesAffordability();
}

function updateScoreDOM() {
  document.getElementById('contentment-count').textContent = formatNum(state.contentment);
  document.getElementById('cpc-display').textContent  = `${formatNum(state.cpc)} per click`;
  document.getElementById('cps-display').textContent  = `${state.cps.toFixed(1)} per sec`;
  document.getElementById('happiness-level').textContent = happinessLabel(state.totalContentment);
}

// ─── Draw ─────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, CW, CH);
  drawFartCloud();          // behind granny
  drawGrandma(state.clickAnim, state.rubPhase);
  drawSteam();
  drawBurpBubble();         // in front, near mouth
  drawFloaters();
}

// ─── Grandma drawing ──────────────────────────────────
function drawGrandma(ca, rubPhase) {
  const cx  = CW / 2;
  const headY = 95;
  const bodyY = 215;

  // Armchair back
  ctx.fillStyle = '#3e2510';
  rrFill(cx - 88, headY + 5, 176, 175, 20);
  ctx.fillStyle = '#4e2f14';
  rrFill(cx - 82, headY + 12, 164, 166, 16);

  // Chair armrests
  ctx.fillStyle = '#3e2510';
  rrFill(cx - 90, bodyY + 28, 26, 58, 8);
  rrFill(cx + 64, bodyY + 28, 26, 58, 8);

  // Chair seat
  ctx.fillStyle = '#4e2f14';
  rrFill(cx - 78, bodyY + 56, 156, 42, 10);

  // Dress/body
  ctx.fillStyle = '#8866aa';
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, 56, 66, 0, 0, Math.PI * 2);
  ctx.fill();

  // Apron
  ctx.fillStyle = '#e0d8c8';
  ctx.beginPath();
  ctx.ellipse(cx, bodyY + 10, 34, 46, 0, 0, Math.PI * 2);
  ctx.fill();

  // Left arm — tummy rub (circular motion)
  const rX = cx - 6 + Math.cos(rubPhase) * 13;
  const rY = bodyY + 12 + Math.sin(rubPhase) * 10;

  ctx.fillStyle = '#e8b46a';
  ctx.beginPath();
  ctx.ellipse(cx - 44, bodyY - 12, 13, 22, -0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - 32, bodyY + 8, 11, 17, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(rX - 16, rY, 9, 0, Math.PI * 2);
  ctx.fill();

  // Right arm — holding mug, lifts on click
  const mugLift = ca * 28;
  ctx.fillStyle = '#e8b46a';
  ctx.beginPath();
  ctx.ellipse(cx + 44, bodyY - 18 - mugLift * 0.25, 12, 22, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 56, bodyY - 30 - mugLift * 0.5, 10, 16, 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Mug
  drawMug(cx + 60, bodyY - 42 - mugLift);

  // Legs
  ctx.fillStyle = '#8866aa';
  ctx.beginPath();
  ctx.ellipse(cx - 22, bodyY + 78, 17, 22, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 22, bodyY + 78, 17, 22, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Shoes
  ctx.fillStyle = '#2a2020';
  ctx.beginPath();
  ctx.ellipse(cx - 24, bodyY + 97, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 24, bodyY + 97, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#e8b46a';
  ctx.beginPath();
  ctx.arc(cx, headY, 38, 0, Math.PI * 2);
  ctx.fill();

  // Hair (gray, sides first then bun on top)
  ctx.fillStyle = '#bebebe';
  ctx.beginPath();
  ctx.ellipse(cx - 30, headY - 14, 14, 23, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 30, headY - 14, 14, 23, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8c8c8';
  ctx.beginPath();
  ctx.ellipse(cx, headY - 29, 24, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b8b8b8';
  ctx.beginPath();
  ctx.ellipse(cx + 4, headY - 31, 15, 11, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Glasses
  const eyeY = headY - 4;
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(cx - 13, eyeY, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 13, eyeY, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 4, eyeY); ctx.lineTo(cx + 4, eyeY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 22, eyeY - 2); ctx.lineTo(cx - 36, eyeY - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 22, eyeY - 2); ctx.lineTo(cx + 36, eyeY - 6); ctx.stroke();

  // Eyes — close happily when sipping
  ctx.fillStyle = '#3a2a1a';
  if (ca > 0.45) {
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx - 13, eyeY, 4, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 13, eyeY, 4, Math.PI, 0); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx - 13, eyeY, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 13, eyeY, 3.5, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - 11, eyeY - 2, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 15, eyeY - 2, 1.2, 0, Math.PI * 2); ctx.fill();
  }

  // Mouth — wide-open O when burping, big smile otherwise
  if (state.burpAnim > 0.1) {
    // Open "O" mouth
    ctx.fillStyle = '#5a1800';
    ctx.beginPath();
    ctx.ellipse(cx, headY + 17, 10 + state.burpAnim * 5, 9 + state.burpAnim * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b85030';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const smileR = 11 + ca * 7;
    ctx.strokeStyle = '#b85030';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, headY + 15, smileR, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  // Cheeks
  ctx.fillStyle = `rgba(230,80,60,${0.18 + ca * 0.18})`;
  ctx.beginPath(); ctx.arc(cx - 24, headY + 9, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 24, headY + 9, 9, 0, Math.PI * 2); ctx.fill();

  // Subtle wrinkles
  ctx.strokeStyle = 'rgba(160,110,50,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx - 27, headY + 6, 5, -0.4, 0.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 27, headY + 6, 5, Math.PI - 0.4, Math.PI + 0.4); ctx.stroke();
}

function drawMug(x, y) {
  // Body
  ctx.fillStyle = '#f5f0e8';
  rrFill(x - 13, y - 20, 26, 32, 4);
  ctx.strokeStyle = '#ddd6cc';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 13, y - 20, 26, 32);

  // Coffee surface
  ctx.fillStyle = '#6a3c18';
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 10, 4, 0, 0, Math.PI);
  ctx.fill();

  // Handle
  ctx.strokeStyle = '#ddd6cc';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x + 17, y - 4, 9, -Math.PI * 0.45, Math.PI * 0.45);
  ctx.stroke();

  // Decorative stripe (mauve)
  ctx.strokeStyle = '#9977aa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 13, y + 2);
  ctx.lineTo(x + 13, y + 2);
  ctx.stroke();
}

// ─── Burp bubble ──────────────────────────────────────
function drawBurpBubble() {
  if (state.burpAnim <= 0) return;
  const cx  = CW / 2;
  const headY = 95;
  const alpha = Math.min(1, state.burpAnim * 4); // quick fade-out at end

  ctx.save();
  ctx.globalAlpha = alpha;

  const bx = cx + 18, by = headY - 72, bw = 90, bh = 40;

  // Bubble body
  ctx.fillStyle = '#fffaf2';
  ctx.strokeStyle = '#c07030';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 10);
  ctx.fill();
  ctx.stroke();

  // Tail toward mouth
  ctx.fillStyle = '#fffaf2';
  ctx.beginPath();
  ctx.moveTo(bx + 10, by + bh - 1);
  ctx.lineTo(bx - 4,  by + bh + 14);
  ctx.lineTo(bx + 22, by + bh - 1);
  ctx.fill();
  ctx.strokeStyle = '#c07030';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx + 10, by + bh + 1);
  ctx.lineTo(bx - 5,  by + bh + 14);
  ctx.moveTo(bx + 22, by + bh + 1);
  ctx.lineTo(bx - 5,  by + bh + 14);
  ctx.stroke();

  // "BURP!" text
  ctx.fillStyle = '#8b3a00';
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('BURP! 🫧', bx + bw / 2, by + bh / 2 + 6);

  ctx.restore();
}

// ─── Fart cloud ───────────────────────────────────────
function drawFartCloud() {
  if (state.fartAnim <= 0) return;
  const cx = CW / 2;
  const baseY = 298;
  const drift = (1 - state.fartAnim) * 38; // cloud drifts upward as anim fades
  const alpha = Math.min(1, state.fartAnim * 3.5);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Green-yellow cloud puffs
  const puffs = [
    { x: cx - 18, y: baseY - drift,       r: 20, c: '#5a9a20' },
    { x: cx + 12, y: baseY - drift - 8,   r: 17, c: '#72b828' },
    { x: cx - 2,  y: baseY - drift + 4,   r: 15, c: '#4a8818' },
    { x: cx + 28, y: baseY - drift - 2,   r: 13, c: '#88cc40' },
    { x: cx - 32, y: baseY - drift - 4,   r: 11, c: '#66aa28' },
  ];
  for (const p of puffs) {
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wavy stink lines rising above cloud
  ctx.strokeStyle = '#88cc40';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.globalAlpha = alpha * 0.7;
  const lineTop = baseY - drift - 38;
  for (let i = 0; i < 3; i++) {
    const lx = cx - 18 + i * 20;
    ctx.beginPath();
    ctx.moveTo(lx, lineTop);
    ctx.bezierCurveTo(lx + 7, lineTop - 14, lx - 7, lineTop - 28, lx, lineTop - 42);
    ctx.stroke();
  }

  // "💨 poot!" label
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#88cc40';
  ctx.font = 'bold 14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('💨 poot!', cx + 8, baseY - drift - 48);

  ctx.restore();
}

function drawSteam() {
  for (const s of state.steam) {
    ctx.globalAlpha = (s.life / s.maxLife) * 0.45;
    ctx.fillStyle = '#cce0f0';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    ctx.globalAlpha = f.life / f.maxLife;
    ctx.fillStyle = '#f0d060';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ─── Audio ────────────────────────────────────────────
let _actx = null;
function getAudioCtx() {
  if (!_actx) {
    try { _actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
}

function playBurp() {
  const ac = getAudioCtx();
  if (!ac) return;
  const t = ac.currentTime;

  // Sawtooth oscillator with FM wobble for a wet gurgling burp
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(250, t + 0.06);   // quick upward
  osc.frequency.exponentialRampToValueAtTime(95,  t + 0.35);   // drop
  osc.frequency.exponentialRampToValueAtTime(115, t + 0.46);   // small bounce
  osc.frequency.exponentialRampToValueAtTime(65,  t + 0.68);   // final drop

  // LFO → frequency for that wet wobble
  const lfo = ac.createOscillator();
  lfo.frequency.value = 14;
  const lfoG = ac.createGain();
  lfoG.gain.value = 22;
  lfo.connect(lfoG);
  lfoG.connect(osc.frequency);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0,   t);
  gain.gain.linearRampToValueAtTime(0.45, t + 0.04);
  gain.gain.setValueAtTime(0.45, t + 0.38);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.72);

  osc.connect(gain);
  gain.connect(ac.destination);
  lfo.start(t);  osc.start(t);
  lfo.stop(t + 0.72); osc.stop(t + 0.75);
}

function playFart() {
  const ac = getAudioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const dur = 1.05;

  // Resonant noise burst — shaped like a fart
  const bufLen = (ac.sampleRate * dur) | 0;
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buf;

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 10;
  lp.frequency.setValueAtTime(220, t);
  lp.frequency.exponentialRampToValueAtTime(90,  t + 0.4);
  lp.frequency.exponentialRampToValueAtTime(55,  t + dur);

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0,   t);
  noiseGain.gain.linearRampToValueAtTime(1.1, t + 0.05);
  noiseGain.gain.setValueAtTime(1.1, t + 0.55);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  // Low sawtooth for body/buzz
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(88, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + dur);

  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.35, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  noise.connect(lp); lp.connect(noiseGain); noiseGain.connect(ac.destination);
  osc.connect(oscGain); oscGain.connect(ac.destination);

  noise.start(t); noise.stop(t + dur);
  osc.start(t);   osc.stop(t + dur);
}

// ─── Helper ───────────────────────────────────────────
function rrFill(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// ─── Upgrades DOM ─────────────────────────────────────
function buildUpgradesUI() {
  const list = document.getElementById('upgrades-list');
  list.innerHTML = '';
  for (const upg of state.upgrades) {
    const div = document.createElement('div');
    div.className = 'upgrade-card';
    div.dataset.id = upg.id;
    div.innerHTML = `
      <span class="upg-icon">${upg.icon}</span>
      <div class="upg-info">
        <span class="upg-name">${upg.name}</span>
        <span class="upg-desc">${upg.desc}</span>
      </div>
      <div class="upg-right">
        <span class="upg-cost">${formatNum(upgradeCost(upg))}</span>
        <span class="upg-count"></span>
      </div>`;
    div.addEventListener('click', () => buyUpgrade(upg.id));
    list.appendChild(div);
  }
}

function updateUpgradesUI() {
  for (const upg of state.upgrades) {
    const div = document.querySelector(`.upgrade-card[data-id="${upg.id}"]`);
    if (!div) continue;
    div.querySelector('.upg-cost').textContent  = formatNum(upgradeCost(upg));
    div.querySelector('.upg-count').textContent = upg.count > 0 ? `×${upg.count}` : '';
  }
}

function updateUpgradesAffordability() {
  for (const upg of state.upgrades) {
    const div = document.querySelector(`.upgrade-card[data-id="${upg.id}"]`);
    if (!div) continue;
    const can = state.contentment >= upgradeCost(upg);
    div.classList.toggle('affordable',   can);
    div.classList.toggle('unaffordable', !can);
  }
}

function buyUpgrade(id) {
  const upg  = state.upgrades.find(u => u.id === id);
  if (!upg) return;
  const cost = upgradeCost(upg);
  if (state.contentment < cost) return;

  state.contentment -= cost;
  upg.count++;
  state.cpc += upg.cpc;
  state.cps += upg.cps;

  updateUpgradesUI();
}

// ─── Game loop ────────────────────────────────────────
function loop(ts) {
  const dt = Math.min((ts - state.lastTime) / 1000, 0.1);
  state.lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initState();
buildUpgradesUI();
updateUpgradesAffordability();
requestAnimationFrame(ts => { state.lastTime = ts; requestAnimationFrame(loop); });
