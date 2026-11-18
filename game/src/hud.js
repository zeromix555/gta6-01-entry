// HUD — DOM overlay: wanted stars, cash, health, ammo, objective banner,
// message feed, speed, and a live canvas minimap of Solmar City.
import { CITY_HALF, BLOCK, ROAD_HALF, GRID } from './config.js';

export function createHud() {
  const root = document.getElementById('hud');
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');
  const els = {
    stars: document.getElementById('hud-stars'),
    cash: document.getElementById('hud-cash'),
    health: document.getElementById('hud-health-fill'),
    healthText: document.getElementById('hud-health-text'),
    ammo: document.getElementById('hud-ammo'),
    objective: document.getElementById('hud-objective'),
    message: document.getElementById('hud-message'),
    speed: document.getElementById('hud-speed'),
    hint: document.getElementById('hud-hint'),
    status: document.getElementById('status'),
  };
  return { root, minimap, mctx, els };
}

function drawMinimap(hud, world) {
  const { mctx, minimap } = hud;
  const W = minimap.width; const H = minimap.height;
  const scale = W / (CITY_HALF * 2 + 40);
  const toX = (x) => (x + CITY_HALF + 20) * scale;
  const toY = (z) => (z + CITY_HALF + 20) * scale;
  mctx.fillStyle = '#0e1a12';
  mctx.fillRect(0, 0, W, H);
  // Blocks.
  mctx.fillStyle = '#2a2f28';
  for (let bx = -GRID; bx < GRID; bx += 1) {
    for (let bz = -GRID; bz < GRID; bz += 1) {
      const x = bx * BLOCK + ROAD_HALF;
      const z = bz * BLOCK + ROAD_HALF;
      mctx.fillRect(toX(x), toY(z), (BLOCK - ROAD_HALF * 2) * scale, (BLOCK - ROAD_HALF * 2) * scale);
    }
  }
  // Roads.
  mctx.strokeStyle = '#5a5f58'; mctx.lineWidth = Math.max(2, ROAD_HALF * 2 * scale);
  for (let i = -GRID; i <= GRID; i += 1) {
    mctx.beginPath(); mctx.moveTo(toX(i * BLOCK), 0); mctx.lineTo(toX(i * BLOCK), H); mctx.stroke();
    mctx.beginPath(); mctx.moveTo(0, toY(i * BLOCK)); mctx.lineTo(W, toY(i * BLOCK)); mctx.stroke();
  }
  // Sea.
  mctx.fillStyle = '#1e7fa8';
  mctx.fillRect(toX(205), 0, W - toX(205), H);
  // Cash drops.
  mctx.fillStyle = '#f1c40f';
  for (const drop of world.cashDrops) {
    if (drop.taken) continue;
    mctx.beginPath(); mctx.arc(toX(drop.x), toY(drop.z), 3, 0, Math.PI * 2); mctx.fill();
  }
  // Mission marker (pulsing yellow diamond).
  const target = world.objectiveTarget;
  if (target) {
    const pulse = 5 + Math.sin(performance.now() / 200) * 2;
    mctx.fillStyle = '#ffd700';
    mctx.beginPath();
    mctx.moveTo(toX(target.x), toY(target.z) - pulse);
    mctx.lineTo(toX(target.x) + pulse, toY(target.z));
    mctx.lineTo(toX(target.x), toY(target.z) + pulse);
    mctx.lineTo(toX(target.x) - pulse, toY(target.z));
    mctx.closePath(); mctx.fill();
  }
  // Traffic (white) and cops (flashing blue/red).
  mctx.fillStyle = '#ffffff';
  for (const car of world.traffic) {
    mctx.fillRect(toX(car.x) - 1.5, toY(car.z) - 1.5, 3, 3);
  }
  for (const cop of world.wanted.cops) {
    mctx.fillStyle = Math.floor(performance.now() / 300) % 2 === 0 ? '#ff3333' : '#3388ff';
    mctx.beginPath(); mctx.arc(toX(cop.x), toY(cop.z), 3.5, 0, Math.PI * 2); mctx.fill();
  }
  // Player arrow.
  const p = world.player;
  mctx.save();
  mctx.translate(toX(p.x), toY(p.z));
  mctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
  mctx.fillStyle = '#37e08a';
  mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath(); mctx.fill();
  mctx.restore();
}

export function hudUpdate(hud, world) {
  const { els } = hud;
  const wanted = world.wanted.stars;
  els.stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
  els.stars.style.color = wanted === 0 ? '#888888' : wanted < 3 ? '#ffd700' : '#ff4444';
  els.cash.textContent = `$${world.money.toLocaleString()}`;
  const hp = Math.max(0, Math.round(world.player.health));
  els.health.style.width = `${hp}%`;
  els.health.style.background = hp > 50 ? '#37e08a' : hp > 25 ? '#f1c40f' : '#e74c3c';
  els.healthText.textContent = `HP ${hp}`;
  els.ammo.textContent = world.player.inCar ? '—' : `AMMO ${world.player.magAmmo}/${world.player.reserveAmmo}`;
  els.objective.textContent = world.objectiveText;
  if (world.missions.messageTimer > 0) {
    els.message.textContent = world.missions.message;
    els.message.style.opacity = '1';
  } else {
    els.message.style.opacity = '0';
  }
  if (world.player.inCar) {
    const kmh = Math.round(Math.abs(world.player.inCar.speed) * 3.6);
    els.speed.textContent = `${kmh} km/h`;
    els.speed.style.opacity = '1';
    els.hint.textContent = 'W/S drive · A/D steer · Space handbrake · E exit car';
  } else {
    els.speed.style.opacity = '0';
    els.hint.textContent = 'WASD move · mouse drag camera · Shift run · E enter car / interact · Click shoot · R reload';
  }
  drawMinimap(hud, world);
}

export function hudSetStatus(hud, text) {
  hud.els.status.textContent = text;
}
