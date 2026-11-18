// SOLMAR HEAT — the HUD: health, ammo, money, wanted stars, mission text,
// the minimap, the toast line, and the screen overlays.
//
// The HUD is plain DOM over the canvas. Values are cached and only written
// when they change, so a 60 fps game loop never thrashes the DOM. The
// minimap is a 180x180 canvas that draws the road grid, the buildings, the
// objective, cash, traffic, cops and the player arrow every few frames.

import { HUD, COLORS } from './config.js';
import { missionText } from './missions.js';
import { playerPos } from './world.js';
import { loadSave } from './world.js';

/** Grab every HUD element once. Missing elements are tolerated (headless). */
export function initHud() {
  const $ = (id) => document.getElementById(id);
  return {
    root: $('hud'),
    healthFill: $('hud-health-fill'),
    healthText: $('hud-health'),
    ammo: $('hud-ammo'),
    speed: $('hud-speed'),
    money: $('hud-money'),
    stars: $('hud-stars'),
    mission: $('hud-mission'),
    toast: $('hud-toast'),
    minimap: $('minimap'),
    titleBest: $('title-best'),
    bustedText: $('busted-text'),
    overText: $('over-text'),
    winText: $('win-text'),
    btnContinue: $('btn-continue'),
    cache: {},
    toastTimer: 0,
    frame: 0,
  };
}

/** Show one screen overlay and hide the rest. */
export function showScreen(hud, screen, world) {
  const screens = {
    title: 'screen-title',
    paused: 'screen-paused',
    busted: 'screen-busted',
    over: 'screen-over',
    win: 'screen-win',
  };
  for (const [name, id] of Object.entries(screens)) {
    const el = document.getElementById(id);
    if (el) el.style.display = name === screen ? 'flex' : 'none';
  }
  if (hud.root) hud.root.style.display = screen === 'play' ? 'block' : 'none';

  // The continue button only exists when a save exists.
  if (hud.btnContinue) {
    hud.btnContinue.style.display = loadSave() ? 'inline-block' : 'none';
  }
  if (hud.titleBest && screen === 'title') {
    const best = Number(localStorage.getItem('solmar-heat-best') || 0) || 0;
    hud.titleBest.textContent = best > 0 ? `Best haul so far: $${best.toLocaleString()}` : 'No haul banked yet — make Solmar yours.';
  }
  if (hud.bustedText && screen === 'busted') {
    hud.bustedText.textContent = `The cops took their cut. You wake up at Solmar General with $${world.money.toLocaleString()} left.`;
  }
  if (hud.overText && screen === 'over') {
    hud.overText.textContent = `Flatlined in Solmar with $${world.money.toLocaleString()} to your name.`;
  }
  if (hud.winText && screen === 'win') {
    hud.winText.textContent = `All three jobs done. The city is yours — $${world.money.toLocaleString()} banked. Keep roaming or start over.`;
  }
}

/** Write a value into the DOM only when it changed since last frame. */
function setText(hud, key, el, text) {
  if (!el) return;
  if (hud.cache[key] !== text) {
    hud.cache[key] = text;
    el.textContent = text;
  }
}

/** Refresh every HUD readout from the world (called each frame). */
export function updateHud(hud, world) {
  if (!hud) return;
  const p = world.player;

  setText(hud, 'health', hud.healthText, `${Math.ceil(p.health)}`);
  if (hud.healthFill) {
    const width = `${Math.max(0, Math.min(100, p.health))}%`;
    if (hud.cache.healthWidth !== width) {
      hud.cache.healthWidth = width;
      hud.healthFill.style.width = width;
      hud.healthFill.style.background = p.health > 50 ? '#37c978' : p.health > 25 ? '#e8a33c' : '#d83a2e';
    }
  }
  setText(hud, 'ammo', hud.ammo, `${p.magAmmo} / ${p.reserveAmmo}`);
  // Speed from frame-to-frame displacement (assumes ~60 fps): it reads
  // correctly on foot and in the car with no extra plumbing.
  const pos = playerPos(world);
  if (hud.lastPos) {
    const moved = Math.hypot(pos.x - hud.lastPos.x, pos.z - hud.lastPos.z);
    const kmh = Math.round(moved * 60 * 3.6);
    setText(hud, 'speed', hud.speed, `${kmh} km/h`);
  }
  hud.lastPos = { x: pos.x, z: pos.z };
  setText(hud, 'money', hud.money, `$${world.money.toLocaleString()}`);
  const stars = '★'.repeat(world.wanted.stars) + '☆'.repeat(5 - world.wanted.stars);
  setText(hud, 'stars', hud.stars, stars);
  setText(hud, 'mission', hud.mission, missionText(world));

  // The minimap redraws every third frame: cheap enough to stay smooth.
  hud.frame += 1;
  if (hud.frame % 3 === 0) drawMinimap(hud, world);

  // Toasts fade after a few seconds.
  if (hud.toastTimer > 0) {
    hud.toastTimer -= 1 / 60;
    if (hud.toastTimer <= 0 && hud.toast) hud.toast.style.opacity = '0';
  }
}

/** Flash a one-line message in the middle of the screen. */
export function toast(hud, text, seconds) {
  if (!hud || !hud.toast) return;
  hud.toast.textContent = text;
  hud.toast.style.opacity = '1';
  hud.toastTimer = seconds || 2.5;
}

/**
 * The minimap: the road grid, building blocks, the gold objective, cash
 * envelopes, traffic, cops and the player arrow. North is up; the player
 * stays centred and the map scrolls with them.
 */
export function drawMinimap(hud, world) {
  const canvas = hud.minimap;
  if (!canvas) return;
  const g = canvas.getContext('2d');
  if (!g) return;
  const size = HUD.minimapSize;
  const range = HUD.minimapRange;
  const pos = playerPos(world);
  const toMap = (x, z) => [
    ((x - pos.x) / range + 0.5) * size,
    ((z - pos.z) / range + 0.5) * size,
  ];

  g.clearRect(0, 0, size, size);
  g.fillStyle = 'rgba(12, 18, 12, 0.82)';
  g.fillRect(0, 0, size, size);

  // Roads: pale lines on the dark map.
  g.strokeStyle = '#5a6068';
  g.lineWidth = 5;
  for (const line of world.city.roadLines) {
    const [ax] = toMap(line, 0);
    g.beginPath();
    g.moveTo(ax, 0);
    g.lineTo(ax, size);
    g.stroke();
    const [, az] = toMap(0, line);
    g.beginPath();
    g.moveTo(0, az);
    g.lineTo(size, az);
    g.stroke();
  }

  // Buildings: faint blocks, so the map reads as a city.
  g.fillStyle = 'rgba(140, 150, 170, 0.5)';
  for (const b of world.city.buildings) {
    const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
    const w = (b.w / range) * size;
    const d = (b.d / range) * size;
    g.fillRect(x, z, w, d);
  }

  // Cash envelopes.
  g.fillStyle = '#37c978';
  for (const drop of world.cashDrops) {
    if (drop.taken) continue;
    const [x, z] = toMap(drop.x, drop.z);
    g.fillRect(x - 2, z - 2, 4, 4);
  }

  // Traffic: grey dots. Cops: flashing red/blue dots.
  g.fillStyle = '#b8bcc0';
  for (const car of world.traffic) {
    const [x, z] = toMap(car.x, car.z);
    g.fillRect(x - 2, z - 2, 4, 4);
  }
  const flash = Math.floor(world.time * 4) % 2 === 0;
  g.fillStyle = flash ? '#ff2020' : '#2080ff';
  for (const cop of world.wanted.cops) {
    const [x, z] = toMap(cop.x, cop.z);
    g.beginPath();
    g.arc(x, z, 3.5, 0, Math.PI * 2);
    g.fill();
  }

  // Guards: orange squares.
  g.fillStyle = '#ff8c1a';
  for (const guard of world.guards) {
    if (guard.health <= 0) continue;
    const [x, z] = toMap(guard.x, guard.z);
    g.fillRect(x - 2, z - 2, 4, 4);
  }

  // Objective: a pulsing gold ring.
  if (world.missions.index < 3) {
    const [x, z] = toMap(world.objective.x, world.objective.z);
    g.strokeStyle = '#ffc93c';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, z, 6 + Math.sin(world.time * 3) * 1.5, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffc93c';
    g.beginPath();
    g.arc(x, z, 2.5, 0, Math.PI * 2);
    g.fill();
  }

  // The player: a white arrow pointing along the heading.
  const heading = world.player.heading;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(size / 2 + Math.sin(heading) * 8, size / 2 + Math.cos(heading) * 8);
  g.lineTo(size / 2 + Math.sin(heading + 2.5) * 6, size / 2 + Math.cos(heading + 2.5) * 6);
  g.lineTo(size / 2 + Math.sin(heading - 2.5) * 6, size / 2 + Math.cos(heading - 2.5) * 6);
  g.closePath();
  g.fill();
}
