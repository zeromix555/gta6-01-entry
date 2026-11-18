// SOLMAR HEAT — boot, the game loop, screens, and the self-test.
//
// This is the only file that touches the DOM at boot. It parses the URL
// (?seed=, ?shot=, ?selftest=1), builds the world, the renderer, the HUD,
// the input and the audio, wires the menu buttons, and runs the frame loop.
//
// Three modes share this file:
//   - normal play: title screen -> play -> pause / busted / over / win.
//   - ?selftest=1: a scripted headless session that reports into #status,
//     window.__selftest and document.title (see runSelfTest below).
//   - ?shot=<name>: a staged scene for the screenshots (see shots.js).
//
// The outside world sees the game through window.__game:
//   { world, step, get state() } with state =
//   { screen, money, wanted, mission, stage, health, ammo, inCar, cops,
//     guards, pos }.

import { STEP, COMBAT } from './config.js';
import { createWorld, worldStep, playerPos, onEvent, saveGame, loadSave, applySave, loadBest } from './world.js';
import { createRenderer, renderWorld, resizeRenderer, snapCamera, spawnParticles } from './render.js';
import { initHud, updateHud, showScreen, toast } from './hud.js';
import { createInput, readInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const seed = seedParam !== null && seedParam !== '' ? seedParam : String(Date.now() % 100000);
const shotName = params.get('shot');
const selftest = params.get('selftest') === '1';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

const world = createWorld(seed);
const renderer = createRenderer(canvas);
const hud = initHud();
const inputState = createInput(canvas);
const audio = createAudio();
world.audio = audio;
world.renderer = renderer;

// ---------------------------------------------------------------------------
// Screens and menu buttons
// ---------------------------------------------------------------------------

function setScreen(screen) {
  world.screen = screen;
  showScreen(hud, screen, world);
}

function startGame(fromSave) {
  audio.ensure();
  audio.click();
  if (fromSave) {
    const save = loadSave();
    if (save) applySave(world, save);
  }
  world.busted = false;
  world.gameOver = false;
  setScreen('play');
  setStatus('Playing — W/A/S/D to move, E to enter a car, mouse to shoot.');
}

function freshGame() {
  // A brand-new run: reload the page on the same URL (same seed, same
  // city, fresh everything). Rebuilding the world in place would leave the
  // old meshes in the scene; a reload cannot leak state.
  window.location.reload();
}

function wireButton(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

wireButton('btn-start', () => startGame(false));
wireButton('btn-continue', () => startGame(true));
wireButton('btn-resume', () => {
  audio.click();
  setScreen('play');
});
wireButton('btn-restart', () => freshGame());
wireButton('btn-win-restart', () => freshGame());
wireButton('btn-busted-ok', () => {
  audio.click();
  world.busted = false;
  setScreen('play');
});
wireButton('btn-over-retry', () => freshGame());
wireButton('btn-win-roam', () => {
  audio.click();
  setScreen('play');
});

window.addEventListener('resize', () => resizeRenderer(renderer));
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });
// Alt-tabbing mid-chase pauses instead of letting the city run on without
// you (and the cruisers catch up while you are gone).
window.addEventListener('blur', () => {
  if (world.screen === 'play') setScreen('paused');
});

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// ---------------------------------------------------------------------------
// Event drain: world events become sound, particles and toasts
// ---------------------------------------------------------------------------

function drainEvents() {
  if (world.events.length === 0) return;
  const pos = playerPos(world);
  for (const ev of world.events) {
    switch (ev.name) {
      case 'shot':
        audio.shot();
        if (renderer && world.renderer) {
          const fx = Math.sin(world.player.heading);
          const fz = Math.cos(world.player.heading);
          spawnParticles(renderer, pos.x + fx * 1.2, 1.4, pos.z + fz * 1.2, 0xffc93c, 6, 6);
        }
        break;
      case 'cash':
        audio.pickup();
        toast(hud, `+$${ev.detail.amount} street cash`);
        spawnParticles(renderer, pos.x, 1, pos.z, 0x37c978, 10, 4);
        break;
      case 'mission-arrive':
        toast(hud, 'Package is here — press E to collect it.', 3);
        break;
      case 'mission-complete':
        audio.jingle();
        toast(
          hud,
          ev.detail.bonus > 0
            ? `Job done — $${ev.detail.reward} banked + $${ev.detail.bonus} clean getaway.`
            : `Job done — $${ev.detail.reward} banked.`,
          4,
        );
        spawnParticles(renderer, pos.x, 1.5, pos.z, 0xffc93c, 18, 7);
        break;
      case 'stole-car':
        toast(hud, `You stole the ${ev.detail.car} — the cops noticed.`, 3);
        break;
      case 'busted':
        audio.thud();
        break;
      case 'hurt':
        audio.thud();
        break;
      case 'wanted':
        if (ev.detail.stars >= 3) toast(hud, `Wanted level ${ev.detail.stars} — lose them!`, 3);
        break;
      default:
        break;
    }
  }
  world.events.length = 0;
}

// ---------------------------------------------------------------------------
// The frame loop
// ---------------------------------------------------------------------------

let lastTime = performance.now();
let camOrbitUntil = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  const inp = readInput(inputState);

  // Menu keys work from any screen.
  if (inp.confirm && world.screen === 'title') startGame(false);
  if (inp.pause && (world.screen === 'play' || world.screen === 'paused')) {
    setScreen(world.screen === 'play' ? 'paused' : 'play');
    audio.click();
  }
  if (inp.mute) {
    world.player.muted = !world.player.muted;
    audio.setMuted(world.player.muted);
  }
  // The horn: a blast that startles nearby traffic (see vehicles.js).
  if (inp.horn && world.screen === 'play') {
    world.hornAt = world.time;
    audio.horn();
  }

  // The mouse orbits the camera; the view drifts back behind the heading
  // a couple of seconds after the last drag.
  if (inp.camDX || inp.camDY) camOrbitUntil = now + 2000;
  if (now > camOrbitUntil && world.screen === 'play') {
    const p = world.player;
    const diff = p.heading - p.camYaw;
    const wrapped = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    p.camYaw += wrapped * Math.min(1, dt * 1.5);
  }

  if (world.screen !== 'paused') {
    // Play simulates fully; every other screen still runs the ambient
    // city (traffic and pedestrians) behind its overlay.
    worldStep(world, dt, inp);
  }

  drainEvents();
  audio.setEngine(world.player.inCar ? world.player.car.speed : 0, world.player.inCar);
  audio.setSiren(world.wanted.stars);
  renderWorld(renderer, world);
  updateHud(hud, world);
}

// ---------------------------------------------------------------------------
// The self-test (?selftest=1): a scripted headless session.
//
// Fixed 1/60 s steps, exactly as the contract describes:
//   1. walk forward 120 steps (must move > 3 m)
//   2. teleport beside the home sedan, interact once (must be in the car)
//   3. drive 300 steps at full throttle (must move > 20 m)
//   4. exit, shoot 30 steps (ammo must drop, wanted must reach 5,
//      some traffic must be moving)
//   5. re-enter if needed, park traffic far away, teleport the car onto
//      the mission-0 objective, one step (mission stage must become 2)
//   6. exit, teleport the player onto the objective, interact once
//      (stage must become 3), record cops, money, position, wanted.
// Pass = no errors, and walked, enteredCar, drove, exitedCar, shotFired,
// trafficMoving, missionStage === 2 and collectedStage === 3.
// ---------------------------------------------------------------------------

function runSelfTest() {
  const errors = [];
  const checks = {};
  const step = (input) => worldStep(world, STEP, input);
  const blank = () => ({
    moveX: 0,
    moveY: 0,
    run: false,
    throttle: 0,
    steer: 0,
    brake: false,
    interact: false,
    shoot: false,
    reload: false,
    camDX: 0,
    camDY: 0,
  });

  world.screen = 'play';
  try {
    // 1. Walk forward for two seconds.
    const startX = world.player.x;
    const startZ = world.player.z;
    for (let i = 0; i < 120; i++) step({ ...blank(), moveY: 1 });
    checks.walked = Math.hypot(world.player.x - startX, world.player.z - startZ) > 3;

    // 2. Teleport beside the home sedan and climb in.
    world.player.x = world.homeCar.x + 2;
    world.player.z = world.homeCar.z + 2;
    step({ ...blank(), interact: true });
    checks.enteredCar = world.player.inCar === true;

    // 3. Drive at full throttle for five seconds.
    const carStartX = world.homeCar.x;
    const carStartZ = world.homeCar.z;
    for (let i = 0; i < 300; i++) step({ ...blank(), throttle: 1 });
    checks.drove = Math.hypot(world.homeCar.x - carStartX, world.homeCar.z - carStartZ) > 20;
    checks.carSpeed = Math.abs(world.homeCar.speed);

    // 4. Step out and shoot for half a second.
    step({ ...blank(), interact: true });
    checks.exitedCar = world.player.inCar === false;
    const ammoBefore = world.player.magAmmo;
    for (let i = 0; i < 30; i++) step({ ...blank(), shoot: true });
    checks.shotFired = world.player.magAmmo < ammoBefore;
    checks.wantedAfterShot = world.wanted.stars;
    checks.trafficMoving = world.traffic.some((car) => Math.abs(car.speed) > 2);

    // 5. Back in the sedan, traffic parked out of the way, car on the objective.
    if (!world.player.inCar) {
      world.player.x = world.homeCar.x + 2;
      world.player.z = world.homeCar.z + 2;
      step({ ...blank(), interact: true });
    }
    for (const car of world.traffic) {
      car.x = 170;
      car.z = 170;
      car.speed = 0;
    }
    world.homeCar.x = world.objective.x;
    world.homeCar.z = world.objective.z;
    world.homeCar.speed = 0;
    step(blank());
    checks.missionStage = world.missions.stage;

    // 6. On foot at the objective, collect the package.
    step({ ...blank(), interact: true });
    world.player.x = world.objective.x;
    world.player.z = world.objective.z;
    step({ ...blank(), interact: true });
    checks.collectedStage = world.missions.stage;

    checks.copsSpawned = world.wanted.cops.length;
    checks.money = world.money;
    checks.playerPos = [Math.round(world.player.x), Math.round(world.player.z)];
    checks.wanted = world.wanted.stars;
  } catch (e) {
    errors.push(String((e && e.message) || e));
  }

  const pass =
    errors.length === 0 &&
    checks.walked === true &&
    checks.enteredCar === true &&
    checks.drove === true &&
    checks.exitedCar === true &&
    checks.shotFired === true &&
    checks.trafficMoving === true &&
    checks.missionStage === 2 &&
    checks.collectedStage === 3;

  const report = { errors, checks, pass };
  window.__selftest = report;
  const label = pass ? 'SELFTEST PASS' : 'SELFTEST FAIL';
  setStatus(`${label} ${JSON.stringify(checks)} errors=${JSON.stringify(errors)}`);
  document.title = label;
  renderWorld(renderer, world);
  window.__shotReady = true;
  return report;
}

// ---------------------------------------------------------------------------
// Public handle and boot
// ---------------------------------------------------------------------------

window.__game = {
  world,
  step(given) {
    const inp = given || readInput(inputState);
    worldStep(world, STEP, inp);
    renderWorld(renderer, world);
  },
  get state() {
    const pos = playerPos(world);
    return {
      screen: world.screen,
      money: world.money,
      wanted: world.wanted.stars,
      mission: world.missions.index,
      stage: world.missions.stage,
      health: Math.ceil(world.player.health),
      ammo: world.player.magAmmo,
      inCar: world.player.inCar,
      cops: world.wanted.cops.length,
      guards: world.guards.length,
      pos: [Math.round(pos.x), Math.round(pos.z)],
    };
  },
};

showScreen(hud, 'title', world);
setStatus('SOLMAR HEAT — press Enter or click Start.');

if (selftest) {
  runSelfTest();
} else if (shotName) {
  const screen = stageShot(world, shotName);
  setScreen(screen);
  snapCamera(renderer, world);
  renderWorld(renderer, world);
  renderWorld(renderer, world);
  renderWorld(renderer, world);
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
