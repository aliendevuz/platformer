'use strict';

// ── Canvas & context ──────────────────────────────────────────────────────────
const canvas = document.getElementById('playground');
const ctx    = canvas.getContext('2d');
const btn    = document.getElementById('fullscreen-btn');

// ── Constants ─────────────────────────────────────────────────────────────────
const GRAVITY          = 0.45;
const MAX_FALL         = 17;
const MOVE_SPEED       = 3.5;
const JUMP_FORCE       = -11;
const SMALL_R_FACTOR   = 0.42;
const BIG_R_FACTOR     = 0.50;
const TOTAL_LEVELS     = 11;
const TOTAL_LIVES      = 3;
const VIEW_W           = 14;
const VIEW_H           = 11;

let TILE_SIZE  = 40;
let RESOLUTION = window.devicePixelRatio || 1;
let isReady    = false;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys  = {};
const touch = { left: false, right: false, jump: false, big: false };

window.addEventListener('keydown', e => { keys[e.key] = true; if ([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault(); });
window.addEventListener('keyup',   e => { keys[e.key] = false; });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// ── Assets ────────────────────────────────────────────────────────────────────
function loadImg(name) {
  const i = new Image();
  i.src   = `assets/image/${name}`;
  return i;
}
const imgBrick = loadImg('brick.svg');
const imgBall  = loadImg('big-ball.svg');

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = {
  x: 0, y: 0, scale: 1, vw: 400, vh: 300,
  resize(cw, ch, sc) { this.scale = sc; this.vw = cw / sc; this.vh = ch / sc; },
  snap(t)  { this.x = t.cx - this.vw / 2; this.y = t.cy - this.vh / 2; },
  track(t) {
    const tx = t.cx - this.vw / 2;
    const ty = t.cy - this.vh / 2;
    this.x += (tx - this.x) * 0.12;
    this.y += (ty - this.y) * 0.12;
  },
  sx(wx) { return (wx - this.x) * this.scale; },
  sy(wy) { return (wy - this.y) * this.scale; },
  ss(s)  { return s  * this.scale; },
};

// ── Game State ────────────────────────────────────────────────────────────────
const G = {
  lives: TOTAL_LIVES, score: 0, level: 1,
  rings: 0, totalRings: 0,
  status: 'loading',
  timer: 0, highScore: 0,
};

// ── Ball ──────────────────────────────────────────────────────────────────────
const ball = {
  x: 0, y: 0, vx: 0, vy: 0,
  r: 18, big: false, dead: false, inv: 0,
  onGround: false,
  get cx() { return this.x + this.r; },
  get cy() { return this.y + this.r; },
  reset(sx, sy, ts) {
    this.r = ts * SMALL_R_FACTOR;
    this.x = sx; this.y = sy;
    this.vx = 0; this.vy = 0;
    this.big = false; this.dead = false; this.inv = 70;
    this.onGround = false;
  },
  setSize(big, ts) {
    const pr = this.r;
    this.big = big;
    const nr = ts * (big ? BIG_R_FACTOR : SMALL_R_FACTOR);
    this.x += pr - nr; this.y += pr - nr; this.r = nr;
  },
  draw() {
    if (this.dead) return;
    if (this.inv > 0 && Math.floor(this.inv / 5) % 2 === 0) return;
    ctx.save();
    if (this.big) { ctx.shadowColor = '#3af'; ctx.shadowBlur = 12; }
    ctx.drawImage(imgBall,
      camera.sx(this.x), camera.sy(this.y),
      camera.ss(this.r * 2), camera.ss(this.r * 2));
    ctx.restore();
  },
};

// ── Tilemap & entities ────────────────────────────────────────────────────────
let tilemap = [];
let rings   = [];
let enemies = [];
let spawnX  = 0, spawnY = 0;

function tileAt(col, row) {
  if (row < 0 || row >= tilemap.length) return '.';
  const r = tilemap[row];
  if (!r || col < 0 || col >= r.length) return '.';
  return r[col];
}
const isSolid = c => c === 'v';
const isWTop  = c => c === 'w';
const isWBody = c => c === '~';
const isSpike = c => c === '^' || c === 'V';

function makeFoe(wx, wy, ts) {
  return {
    x: wx, y: wy, vx: 1.4, vy: 0,
    r: ts * 0.36, onGround: false,
    get cx() { return this.x + this.r; },
    get cy() { return this.y + this.r; },
  };
}

function parseTilemap(text, ts) {
  rings = []; enemies = [];
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const map = lines.map((line, row) =>
    line.split('').map((ch, col) => {
      const wx = col * ts + ts * 0.5;
      const wy = row * ts + ts * 0.5;
      if (ch === 'o') { rings.push({ x: wx, y: wy, r: ts * 0.27, anim: Math.random() * Math.PI * 2, got: false }); return '.'; }
      if (ch === 'e') { enemies.push(makeFoe(col * ts, row * ts - ts * 0.2, ts)); return '.'; }
      if (ch === 'p') { spawnX = col * ts; spawnY = row * ts; return '.'; }
      return ch;
    })
  );
  G.totalRings = rings.length;
  G.rings = 0;
  return map;
}

// ── Collision helpers ─────────────────────────────────────────────────────────
function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function resolveCircleRect(obj, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(obj.cx, rx + rw));
  const ny = Math.max(ry, Math.min(obj.cy, ry + rh));
  const dx = obj.cx - nx, dy = obj.cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0 || d2 >= obj.r * obj.r) return false;
  const d  = Math.sqrt(d2) || 0.001;
  const ex = dx / d, ey = dy / d;
  const pen = obj.r - d;
  obj.x += ex * pen; obj.y += ey * pen;
  const dot = obj.vx * ex + obj.vy * ey;
  if (dot < 0) { obj.vx -= 2 * dot * ex * 0.55; obj.vy -= 2 * dot * ey * 0.55; }
  if (ey < -0.5) { obj.onGround = true; obj.vy = Math.min(obj.vy, 0); }
  return true;
}

// ── Kill ──────────────────────────────────────────────────────────────────────
function killBall() {
  if (ball.dead || G.status !== 'playing') return;
  ball.dead = true;
  G.lives = Math.max(0, G.lives - 1);
  G.status = 'dying'; G.timer = 80;
}

// ── Update ball ───────────────────────────────────────────────────────────────
function updateBall(ts) {
  if (ball.dead) return;
  if (ball.inv > 0) ball.inv--;

  const goL     = keys['ArrowLeft']  || keys['a'] || touch.left;
  const goR     = keys['ArrowRight'] || keys['d'] || touch.right;
  const doJump  = (keys[' '] || keys['ArrowUp'] || keys['w'] || touch.jump) && ball.onGround;
  const wantBig = keys['f'] || touch.big;

  if (wantBig && !ball.big)  ball.setSize(true,  ts);
  if (!wantBig && ball.big)  ball.setSize(false, ts);

  if (goL)       ball.vx = -MOVE_SPEED;
  else if (goR)  ball.vx =  MOVE_SPEED;
  else           ball.vx *= 0.72;

  if (doJump) { ball.vy = JUMP_FORCE; ball.onGround = false; }

  ball.vy = Math.min(ball.vy + GRAVITY, MAX_FALL);
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.onGround = false;

  const col0 = Math.floor((ball.cx - ball.r) / ts) - 1;
  const col1 = Math.floor((ball.cx + ball.r) / ts) + 1;
  const row0 = Math.floor((ball.cy - ball.r) / ts) - 1;
  const row1 = Math.floor((ball.cy + ball.r) / ts) + 1;

  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const ch = tileAt(col, row);
      const tx = col * ts, ty = row * ts;
      if (isSolid(ch)) {
        resolveCircleRect(ball, tx, ty, ts, ts);
      } else if (isSpike(ch)) {
        if (circleRect(ball.cx, ball.cy, ball.r * 0.82, tx, ty, ts, ts) && ball.inv <= 0) killBall();
      } else if (isWTop(ch)) {
        if (ball.big) {
          if (ball.cy + ball.r * 0.4 > ty && ball.vy >= 0) {
            ball.y = ty - ball.r * 1.6; ball.vy = Math.min(ball.vy * -0.35, -0.5); ball.onGround = true;
          }
        } else if (circleRect(ball.cx, ball.cy, ball.r, tx, ty, ts, ts) && ball.inv <= 0) killBall();
      } else if (isWBody(ch)) {
        if (!ball.big) { if (ball.inv <= 0) killBall(); }
        else { ball.vy -= GRAVITY * 1.65; ball.vy *= 0.95; ball.vx *= 0.96; }
      } else if (ch === '+') { ball.setSize(true,  ts); tilemap[row][col] = '.'; }
        else if (ch === '-') { ball.setSize(false, ts); tilemap[row][col] = '.'; }
    }
  }

  // Rings
  for (const ring of rings) {
    if (ring.got) continue;
    const dx = ball.cx - ring.x, dy = ball.cy - ring.y;
    if (dx * dx + dy * dy < (ball.r + ring.r) ** 2) { ring.got = true; G.rings++; G.score += 100; }
  }

  // Enemy contact
  if (ball.inv <= 0) {
    for (const en of enemies) {
      const dx = ball.cx - en.cx, dy = ball.cy - en.cy;
      if (dx * dx + dy * dy < (ball.r + en.r) ** 2) { killBall(); break; }
    }
  }

  // Fall out of world
  if (ball.y > tilemap.length * ts + ts * 4) killBall();

  // Level complete
  if (G.totalRings > 0 && G.rings >= G.totalRings) { G.status = 'nextlevel'; G.timer = 100; }
}

// ── Update enemies ────────────────────────────────────────────────────────────
function updateEnemies(ts) {
  for (const en of enemies) {
    en.vy = Math.min(en.vy + GRAVITY, MAX_FALL);
    en.x += en.vx; en.y += en.vy;
    en.onGround = false;
    const col0 = Math.floor((en.cx - en.r) / ts) - 1;
    const col1 = Math.floor((en.cx + en.r) / ts) + 1;
    const row0 = Math.floor((en.cy - en.r) / ts) - 1;
    const row1 = Math.floor((en.cy + en.r) / ts) + 1;
    for (let row = row0; row <= row1; row++)
      for (let col = col0; col <= col1; col++) {
        const ch = tileAt(col, row);
        if (isSolid(ch) || isWTop(ch)) resolveCircleRect(en, col * ts, row * ts, ts, ts);
      }
    const dir  = Math.sign(en.vx) || 1;
    const wc   = Math.floor((en.cx + dir * (en.r + 2)) / ts);
    const mr   = Math.floor(en.cy / ts);
    const fr   = Math.floor((en.cy + en.r + 4) / ts);
    if (isSolid(tileAt(wc, mr)) || !(isSolid(tileAt(wc, fr)) || isWTop(tileAt(wc, fr)))) en.vx *= -1;
  }
}

// ── Draw tilemap ───────────────────────────────────────────────────────────────
function drawTilemap() {
  const ts = TILE_SIZE;
  for (let row = 0; row < tilemap.length; row++) {
    for (let col = 0; col < tilemap[row].length; col++) {
      const ch = tilemap[row][col]; if (ch === '.') continue;
      const sx = camera.sx(col * ts), sy = camera.sy(row * ts), sd = camera.ss(ts);
      if (sx + sd < 0 || sy + sd < 0 || sx > canvas.width || sy > canvas.height) continue;
      if (ch === 'v') {
        ctx.drawImage(imgBrick, sx, sy, sd, sd);
      } else if (ch === 'w') {
        ctx.fillStyle = 'rgba(30,130,210,0.88)'; ctx.fillRect(sx, sy, sd, sd);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx, sy, sd, sd * 0.22);
      } else if (ch === '~') {
        ctx.fillStyle = 'rgba(25,110,180,0.82)'; ctx.fillRect(sx, sy, sd, sd);
      } else if (ch === '^') {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.moveTo(sx + sd*.5, sy+2); ctx.lineTo(sx+sd*.08, sy+sd-2); ctx.lineTo(sx+sd*.92, sy+sd-2); ctx.closePath(); ctx.fill();
      } else if (ch === 'V') {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.moveTo(sx+sd*.5, sy+sd-2); ctx.lineTo(sx+sd*.08, sy+2); ctx.lineTo(sx+sd*.92, sy+2); ctx.closePath(); ctx.fill();
      } else if (ch === '+') {
        ctx.fillStyle = '#1abc9c'; ctx.beginPath(); ctx.arc(sx+sd/2, sy+sd/2, sd*.38, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(sd*.45)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B', sx+sd/2, sy+sd/2);
      } else if (ch === '-') {
        ctx.fillStyle = '#8e44ad'; ctx.beginPath(); ctx.arc(sx+sd/2, sy+sd/2, sd*.38, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(sd*.45)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', sx+sd/2, sy+sd/2);
      }
    }
  }
}

// ── Draw rings ─────────────────────────────────────────────────────────────────
function drawRings() {
  for (const ring of rings) {
    if (ring.got) continue;
    ring.anim += 0.055;
    const cx = ring.x, cy = ring.y + Math.sin(ring.anim) * 3;
    ctx.save();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = camera.ss(TILE_SIZE * 0.075);
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(camera.sx(cx), camera.sy(cy), camera.ss(ring.r), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// ── Draw enemies ───────────────────────────────────────────────────────────────
function drawEnemies() {
  for (const en of enemies) {
    const er = camera.ss(en.r);
    ctx.save();
    ctx.fillStyle = '#e74c3c'; ctx.shadowColor = '#c0392b'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(camera.sx(en.cx), camera.sy(en.cy), er, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(camera.sx(en.cx) - er*.28, camera.sy(en.cy) - er*.2, er*.22, 0, Math.PI*2);
    ctx.arc(camera.sx(en.cx) + er*.28, camera.sy(en.cy) - er*.2, er*.22, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#222';
    const po = en.vx > 0 ? er * .06 : -er * .06;
    ctx.beginPath();
    ctx.arc(camera.sx(en.cx) - er*.28 + po, camera.sy(en.cy) - er*.2, er*.1, 0, Math.PI*2);
    ctx.arc(camera.sx(en.cx) + er*.28 + po, camera.sy(en.cy) - er*.2, er*.1, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD() {
  const p = 10 * RESOLUTION, fs = Math.round(18 * RESOLUTION);
  ctx.save();
  ctx.font = `bold ${fs}px sans-serif`; ctx.textBaseline = 'top'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.fillStyle = '#e74c3c'; ctx.textAlign = 'left';  ctx.fillText(`♥ ${G.lives}`, p, p);
  ctx.fillStyle = '#f1c40f'; ctx.textAlign = 'right'; ctx.fillText(`${G.score}`, canvas.width - p, p);
  ctx.fillStyle = '#FFD700'; ctx.textAlign = 'left';  ctx.fillText(`⭕ ${G.rings}/${G.totalRings}`, p, p + fs * 1.4);
  ctx.fillStyle = '#ecf0f1'; ctx.textAlign = 'right'; ctx.fillText(`LVL ${G.level}`, canvas.width - p, p + fs * 1.4);
  ctx.fillStyle = ball.big ? '#1abc9c' : '#bdc3c7';
  ctx.textAlign = 'left'; ctx.font = `${Math.round(13 * RESOLUTION)}px sans-serif`;
  ctx.fillText(ball.big ? '● BIG (F)' : '○ small (F=big)', p, p + fs * 2.9);
  ctx.restore();
}

// ── Overlays ──────────────────────────────────────────────────────────────────
function drawOverlay(msg, sub, color) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const fs = Math.round(36 * RESOLUTION);
  ctx.font = `bold ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillStyle = color;
  ctx.fillText(msg, canvas.width/2, canvas.height/2 - fs*.55);
  if (sub) {
    ctx.font = `${Math.round(19 * RESOLUTION)}px sans-serif`; ctx.fillStyle = '#ecf0f1';
    ctx.fillText(sub, canvas.width/2, canvas.height/2 + fs*.55);
  }
  ctx.restore();
}

// ── Touch controls ────────────────────────────────────────────────────────────
function setupTouchControls() {
  const container = document.getElementById('touch-controls');
  if (!container) return;
  function makeBtn(label, cls, prop) {
    const b = document.createElement('button');
    b.className = 'touch-btn ' + cls; b.innerHTML = label;
    const down = e => { e.preventDefault(); touch[prop] = true; };
    const up   = e => { e.preventDefault(); touch[prop] = false; };
    b.addEventListener('touchstart', down, { passive: false });
    b.addEventListener('touchend',   up,   { passive: false });
    b.addEventListener('touchcancel',up,   { passive: false });
    b.addEventListener('mousedown',  down);
    b.addEventListener('mouseup',    up);
    b.addEventListener('mouseleave', up);
    container.appendChild(b);
  }
  makeBtn('◀', 'btn-left',  'left');
  makeBtn('▶', 'btn-right', 'right');
  makeBtn('▲', 'btn-jump',  'jump');
  makeBtn('B', 'btn-big',   'big');
}

// ── Level loading ─────────────────────────────────────────────────────────────
async function loadLevel(n, ts) {
  try {
    const text = await (await fetch(`assets/tilemaps/level${n}.lvl`)).text();
    tilemap = parseTilemap(text, ts);
    ball.reset(spawnX, spawnY, ts);
    camera.snap(ball);
  } catch(e) { console.error('Level load failed', e); }
}

// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
  RESOLUTION = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  TILE_SIZE = Math.min(W / VIEW_W, H / VIEW_H);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * RESOLUTION);
  canvas.height = Math.round(H * RESOLUTION);
  camera.resize(canvas.width, canvas.height, RESOLUTION);
  if (isReady) {
    loadLevel(G.level, TILE_SIZE);
  } else {
    loadLevel(G.level, TILE_SIZE).then(() => {
      G.status = 'playing';
      setTimeout(() => { isReady = true; document.body.style.opacity = 1; }, 250);
    });
  }
}

window.addEventListener('resize', () => resize());
window.addEventListener('orientationchange', () => resize());
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => resize());

btn.addEventListener('click', () => {
  (document.documentElement.requestFullscreen?.() ||
   document.documentElement.webkitRequestFullscreen?.())?.then?.(() => { btn.style.display = 'none'; resize(); });
});

// ── Game loop ─────────────────────────────────────────────────────────────────
function update() {
  if (!isReady) return;
  if (G.status === 'playing') {
    updateBall(TILE_SIZE);
    updateEnemies(TILE_SIZE);
  } else if (G.status === 'dying' || G.status === 'nextlevel') {
    G.timer--;
    if (G.timer <= 0) {
      if (G.status === 'dying') {
        if (G.lives <= 0) { G.status = 'gameover'; }
        else { G.status = 'reloading'; loadLevel(G.level, TILE_SIZE).then(() => { ball.dead = false; G.status = 'playing'; }); }
      } else {
        if (G.level >= TOTAL_LEVELS) { G.highScore = Math.max(G.highScore, G.score); G.status = 'win'; }
        else { G.status = 'reloading'; G.level++; loadLevel(G.level, TILE_SIZE).then(() => { G.status = 'playing'; }); }
      }
    }
  } else if (G.status === 'gameover' || G.status === 'win') {
    if (keys['Enter'] || keys[' '] || touch.jump) {
      G.highScore = Math.max(G.highScore, G.score);
      G.lives = TOTAL_LIVES; G.score = 0; G.level = 1;
      G.status = 'reloading';
      loadLevel(1, TILE_SIZE).then(() => { ball.dead = false; G.status = 'playing'; });
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!isReady) return;
  camera.track(ball);
  drawTilemap(); drawRings(); drawEnemies(); ball.draw(); drawHUD();
  if (G.status === 'dying')     drawOverlay('OOPS! 💥',        `Lives left: ${G.lives}`, '#e74c3c');
  if (G.status === 'nextlevel') drawOverlay('LEVEL CLEAR! 🎉', `Score: ${G.score}`, '#2ecc71');
  if (G.status === 'gameover')  drawOverlay('GAME OVER',       'Press SPACE / Jump to restart', '#e74c3c');
  if (G.status === 'win')       drawOverlay('YOU WIN! 🏆',     `Score: ${G.score} — SPACE to replay`, '#f1c40f');
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

// ── Boot ──────────────────────────────────────────────────────────────────────
setupTouchControls();
resize();
loop();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}
