'use strict';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// ─── Constants ───────────────────────────────
const PLAYER_SPEED = 4;
const BULLET_SPEED = 9;
const SHOOT_COOLDOWN = 12; // frames
const PLAYER_SIZE = 18;
const INVINCIBLE_FRAMES = 90;

// ─── State ───────────────────────────────────
let state;

function initState() {
  state = {
    phase: 'start',   // 'start' | 'playing' | 'wave-clear' | 'game-over'
    score: 0,
    lives: 3,
    wave: 0,
    player: {
      x: W / 2,
      y: H - 60,
      vx: 0,
      vy: 0,
      shootTimer: 0,
      invincible: 0,
    },
    bullets: [],
    enemies: [],
    particles: [],
    waveBanner: 0,    // frames to show wave-clear banner
    waveStartDelay: 0,
  };
}

// ─── Input ───────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'Space' || e.code === 'Enter') && state.phase === 'start') startGame();
  if ((e.code === 'Space' || e.code === 'Enter') && state.phase === 'game-over') initState();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── Game flow ───────────────────────────────
function startGame() {
  state.phase = 'playing';
  state.wave = 0;
  spawnNextWave();
}

function spawnNextWave() {
  state.wave++;
  const count = 6 + (state.wave - 1) * 3;
  const speed = 0.6 + (state.wave - 1) * 0.15;
  const cols = Math.min(count, 10);
  const rows = Math.ceil(count / cols);

  state.enemies = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (state.enemies.length >= count) break;
      const type = pickEnemyType(state.wave, r);
      state.enemies.push(createEnemy(c, cols, r, speed, type));
    }
  }
  state.waveBanner = 0;
  state.waveStartDelay = 60;
}

function pickEnemyType(wave, row) {
  if (wave >= 4 && row === 0 && Math.random() < 0.4) return 'tank';
  if (wave >= 2 && Math.random() < 0.25) return 'fast';
  return 'basic';
}

function createEnemy(col, cols, row, baseSpeed, type) {
  const margin = 60;
  const spacing = (W - margin * 2) / cols;
  const x = margin + spacing * col + spacing / 2;
  const y = -30 - row * 48;

  const cfg = {
    basic: { r: 14, hp: 1, speed: baseSpeed,         color: '#8B4513', pts: 10 },
    fast:  { r: 10, hp: 1, speed: baseSpeed * 1.7,   color: '#A0522D', pts: 20 },
    tank:  { r: 18, hp: 2, speed: baseSpeed * 0.6,   color: '#4a1f00', pts: 40 },
  }[type];

  return { x, y, type, ...cfg, maxHp: cfg.hp, vx: 0 };
}

// ─── Update ──────────────────────────────────
function update() {
  if (state.phase !== 'playing') return;
  if (state.waveStartDelay > 0) { state.waveStartDelay--; return; }

  updatePlayer();
  updateBullets();
  updateEnemies();
  updateParticles();
  checkCollisions();
  checkWaveComplete();
}

function updatePlayer() {
  const p = state.player;
  p.vx = 0; p.vy = 0;
  if (keys['ArrowLeft']  || keys['KeyA']) p.vx = -PLAYER_SPEED;
  if (keys['ArrowRight'] || keys['KeyD']) p.vx =  PLAYER_SPEED;
  if (keys['ArrowUp']    || keys['KeyW']) p.vy = -PLAYER_SPEED;
  if (keys['ArrowDown']  || keys['KeyS']) p.vy =  PLAYER_SPEED;

  p.x = Math.max(PLAYER_SIZE, Math.min(W - PLAYER_SIZE, p.x + p.vx));
  p.y = Math.max(PLAYER_SIZE, Math.min(H - PLAYER_SIZE, p.y + p.vy));

  if (p.shootTimer > 0) p.shootTimer--;
  if (keys['Space'] && p.shootTimer === 0) {
    state.bullets.push({ x: p.x, y: p.y - PLAYER_SIZE, w: 3, h: 10 });
    p.shootTimer = SHOOT_COOLDOWN;
  }

  if (p.invincible > 0) p.invincible--;
}

function updateBullets() {
  for (const b of state.bullets) b.y -= BULLET_SPEED;
  state.bullets = state.bullets.filter(b => b.y + b.h > 0);
}

function updateEnemies() {
  const drift = Math.sin(Date.now() / 1200) * 0.4;
  for (const e of state.enemies) {
    e.y += e.speed;
    e.vx = drift * (state.wave * 0.3 + 1);
    e.x = Math.max(e.r, Math.min(W - e.r, e.x + e.vx));

    // enemy reaches bottom → lose a life
    if (e.y - e.r > H) {
      e.dead = true;
      loseLife();
    }
  }
  state.enemies = state.enemies.filter(e => !e.dead);
}

function updateParticles() {
  for (const p of state.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life--;
    p.alpha = p.life / p.maxLife;
  }
  state.particles = state.particles.filter(p => p.life > 0);
}

function checkCollisions() {
  const p = state.player;

  for (const b of state.bullets) {
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = b.x - e.x, dy = (b.y - b.h / 2) - e.y;
      if (Math.sqrt(dx*dx + dy*dy) < e.r + 2) {
        b.dead = true;
        e.hp--;
        spawnHitParticles(e.x, e.y, 3, '#888');
        if (e.hp <= 0) {
          e.dead = true;
          state.score += e.pts;
          spawnHitParticles(e.x, e.y, 12, e.color);
        }
      }
    }
  }
  state.bullets = state.bullets.filter(b => !b.dead);
  state.enemies = state.enemies.filter(e => !e.dead);

  // Player vs enemy
  if (p.invincible > 0) return;
  for (const e of state.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y;
    if (Math.sqrt(dx*dx + dy*dy) < e.r + PLAYER_SIZE * 0.8) {
      loseLife();
      break;
    }
  }
}

function loseLife() {
  state.lives--;
  state.player.invincible = INVINCIBLE_FRAMES;
  spawnHitParticles(state.player.x, state.player.y, 16, '#33ccff');
  if (state.lives <= 0) {
    state.phase = 'game-over';
  }
}

function spawnHitParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    const life = 20 + Math.random() * 20 | 0;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life, maxLife: life,
      alpha: 1, color, r: 2 + Math.random() * 2,
    });
  }
}

function checkWaveComplete() {
  if (state.enemies.length === 0 && state.phase === 'playing') {
    state.phase = 'wave-clear';
    state.score += state.wave * 50;
    state.waveBanner = 120; // frames
  }
}

// ─── Draw ────────────────────────────────────
function draw() {
  ctx.fillStyle = '#0a0a0e';
  ctx.fillRect(0, 0, W, H);

  drawStars();

  if (state.phase === 'start') {
    drawStartScreen();
    return;
  }

  drawParticles();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawHUD();

  if (state.phase === 'wave-clear') drawWaveClear();
  if (state.phase === 'game-over')  drawGameOver();
}

// Static star field
const STARS = Array.from({ length: 80 }, () => ({
  x: Math.random() * 700,
  y: Math.random() * 500,
  r: Math.random() * 1.2,
  a: 0.2 + Math.random() * 0.5,
}));

function drawStars() {
  for (const s of STARS) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const p = state.player;
  if (p.invincible > 0 && Math.floor(p.invincible / 5) % 2 === 0) return; // blink

  ctx.save();
  ctx.translate(p.x, p.y);

  // Engine flame (drawn behind ship)
  ctx.fillStyle = '#ff7722';
  ctx.beginPath();
  ctx.ellipse(0, PLAYER_SIZE * 0.55, 3.5, 3 + Math.random() * 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffdd44';
  ctx.beginPath();
  ctx.ellipse(0, PLAYER_SIZE * 0.5, 2, 2 + Math.random() * 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ship body — cyan
  ctx.shadowColor = '#33ccff';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#22aaee';
  ctx.strokeStyle = '#88eeff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -PLAYER_SIZE);
  ctx.lineTo(PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.8);
  ctx.lineTo(0, PLAYER_SIZE * 0.4);
  ctx.lineTo(-PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Cockpit
  ctx.fillStyle = '#aaeeff';
  ctx.beginPath();
  ctx.ellipse(0, -PLAYER_SIZE * 0.3, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBullets() {
  ctx.fillStyle = '#aaddff';
  for (const b of state.bullets) {
    ctx.shadowColor = '#6699ff';
    ctx.shadowBlur = 6;
    ctx.fillRect(b.x - b.w / 2, b.y - b.h, b.w, b.h);
  }
  ctx.shadowBlur = 0;
}

function drawPoop(r, shade, face) {
  // shade: base brown color string
  // face: 'normal' | 'scared' | 'angry'
  const dark  = shade;
  const mid   = shade === '#8B4513' ? '#a0521a' : shade === '#A0522D' ? '#b8622d' : '#6b2e00';
  const shine = shade === '#8B4513' ? '#c4783a' : shade === '#A0522D' ? '#cc8844' : '#8B4513';

  ctx.fillStyle = dark;

  // Base mound
  ctx.beginPath();
  ctx.ellipse(0, r * 0.45, r, r * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Middle mound
  ctx.fillStyle = mid;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.0, r * 0.68, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top mound
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.5, r * 0.44, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tip curl
  ctx.fillStyle = mid;
  ctx.beginPath();
  ctx.ellipse(r * 0.06, -r * 0.88, r * 0.18, r * 0.22, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Shine highlight
  ctx.fillStyle = shine;
  ctx.globalAlpha *= 0.5;
  ctx.beginPath();
  ctx.ellipse(-r * 0.18, -r * 0.62, r * 0.1, r * 0.14, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = ctx.globalAlpha / 0.5; // restore (will be set by caller)

  // Eyes (on middle mound)
  const eyeY = r * 0.05;
  const eyeX = r * 0.22;
  const eyeR = r * 0.13;

  // White sclera
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = ctx.globalAlpha; // no-op, just clarity
  ctx.beginPath();
  ctx.arc(-eyeX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc( eyeX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-eyeX + 1, eyeY + 1, eyeR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc( eyeX + 1, eyeY + 1, eyeR * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Angry eyebrows for tank
  if (face === 'angry') {
    ctx.strokeStyle = '#220000';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-eyeX - eyeR, eyeY - eyeR * 1.4);
    ctx.lineTo(-eyeX + eyeR * 0.5, eyeY - eyeR * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo( eyeX + eyeR, eyeY - eyeR * 1.4);
    ctx.lineTo( eyeX - eyeR * 0.5, eyeY - eyeR * 0.8);
    ctx.stroke();
  }

  // Mouth
  ctx.strokeStyle = '#3a1a00';
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face === 'scared') {
    // Open O mouth
    ctx.arc(0, eyeY + eyeR * 1.6, eyeR * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#3a1a00';
    ctx.fill();
  } else if (face === 'angry') {
    // Angry frown
    ctx.moveTo(-eyeX * 0.8, eyeY + eyeR * 1.5);
    ctx.quadraticCurveTo(0, eyeY + eyeR * 0.8, eyeX * 0.8, eyeY + eyeR * 1.5);
    ctx.stroke();
  } else {
    // Neutral smirk
    ctx.moveTo(-eyeX * 0.7, eyeY + eyeR * 1.4);
    ctx.quadraticCurveTo(0, eyeY + eyeR * 2.1, eyeX * 0.7, eyeY + eyeR * 1.4);
    ctx.stroke();
  }
}

function drawEnemies() {
  for (const e of state.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.globalAlpha = e.hp < e.maxHp ? 0.6 : 1;

    if (e.type === 'basic') {
      drawPoop(e.r, '#8B4513', 'normal');
    } else if (e.type === 'fast') {
      drawPoop(e.r, '#A0522D', 'scared');
    } else if (e.type === 'tank') {
      drawPoop(e.r, '#4a1f00', 'angry');
      // HP bar below
      ctx.fillStyle = '#1a1a22';
      ctx.fillRect(-e.r, e.r * 1.6, e.r * 2, 5);
      ctx.fillStyle = e.hp >= e.maxHp ? '#8B4513' : '#ff4455';
      ctx.fillRect(-e.r, e.r * 1.6, e.r * 2 * (e.hp / e.maxHp), 5);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  // Score
  ctx.fillStyle = '#e0e0e4';
  ctx.font = 'bold 16px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${state.score}`, 16, 28);

  // Wave
  ctx.textAlign = 'center';
  ctx.fillText(`Wave ${state.wave}`, W / 2, 28);

  // Lives
  ctx.textAlign = 'right';
  for (let i = 0; i < state.lives; i++) {
    drawMiniShip(W - 20 - i * 22, 18);
  }
}

function drawMiniShip(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.55, 0.55);
  ctx.fillStyle = '#22aaee';
  ctx.strokeStyle = '#88eeff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -PLAYER_SIZE);
  ctx.lineTo(PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.8);
  ctx.lineTo(0, PLAYER_SIZE * 0.4);
  ctx.lineTo(-PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawStartScreen() {
  ctx.fillStyle = 'rgba(10,10,14,0.85)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0f0f4';
  ctx.font = 'bold 42px system-ui';
  ctx.fillText("Tommi's Shooter", W / 2, H / 2 - 60);

  ctx.font = '18px system-ui';
  ctx.fillStyle = '#888892';
  ctx.fillText('Move: Arrow keys or WASD', W / 2, H / 2 - 10);
  ctx.fillText('Shoot: Hold Space', W / 2, H / 2 + 20);

  ctx.font = 'bold 20px system-ui';
  ctx.fillStyle = '#aaaaff';
  ctx.fillText('Press Space or Enter to start', W / 2, H / 2 + 70);
}

function drawWaveClear() {
  state.waveBanner--;

  const alpha = Math.min(1, state.waveBanner / 30, state.waveBanner > 30 ? 1 : state.waveBanner / 30);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(10,10,20,0.7)';
  ctx.fillRect(W / 2 - 180, H / 2 - 50, 360, 100);
  ctx.fillStyle = '#aaaaff';
  ctx.font = 'bold 28px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`Wave ${state.wave} cleared!`, W / 2, H / 2 - 8);
  ctx.font = '18px system-ui';
  ctx.fillStyle = '#888892';
  ctx.fillText(`+${state.wave * 50} bonus`, W / 2, H / 2 + 24);
  ctx.globalAlpha = 1;

  if (state.waveBanner <= 0) {
    state.phase = 'playing';
    spawnNextWave();
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(10,10,14,0.88)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0f0f4';
  ctx.font = 'bold 44px system-ui';
  ctx.fillText('Game Over', W / 2, H / 2 - 60);

  ctx.font = '22px system-ui';
  ctx.fillStyle = '#888892';
  ctx.fillText(`Final score: ${state.score}`, W / 2, H / 2 - 10);
  ctx.fillText(`Waves cleared: ${state.wave - 1}`, W / 2, H / 2 + 24);

  ctx.font = 'bold 20px system-ui';
  ctx.fillStyle = '#aaaaff';
  ctx.fillText('Press Space or Enter to play again', W / 2, H / 2 + 78);
}

// ─── Game loop ───────────────────────────────
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

initState();
loop();
