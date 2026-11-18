// SOLMAR HEAT — boot and the one loop.
// Input is read every frame, the world advances in fixed 1/60 s steps, and
// the renderer paints what is there. Screens: title, play, paused, busted,
// game over, and all-missions-done. Progress saves to localStorage.
//
// ?seed=N fixes the city. ?shot=chase|street|mission|start (with &seed=N)
// stages that scene instead of running the loop, paints it, and sets
// window.__shotReady for a screenshot. ?selftest=1 runs a scripted play
// session headlessly and reports the result in #status.
import { STEP, SAVE_KEY, BEST_KEY, PLACES } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_INTERACT, ACTION_PAUSE, ACTION_MUTE, ACTION_RELOAD, ACTION_CONFIRM } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_OVER, SCREEN_WIN } from './render.js';
import { createWorld, worldStep } from './world.js';
import { createHud, hudUpdate, hudSetStatus } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const world = createWorld(renderer.scene, createRandom(seed));
world.camera = renderer.camera;
const audio = createAudio();
world.audio = audio;
const hud = createHud();
const input = createInput(canvas);

world.onEvent = (name, detail) => {
  if (name === 'cash') setStatus(`Picked up $${detail.amount}`);
  if (name === 'guardDown') setStatus('Guard down — +$50');
  if (name === 'stole') setStatus('Car stolen — the cops noticed!');
  if (name === 'pedHit') setStatus('You hit a pedestrian — wanted level up!');
};

let screen = SCREEN_TITLE;
let best = readBest();
let save = readSave();
if (save) {
  world.money = save.money || 0;
  world.missions.index = Math.min(2, save.missionIndex || 0);
  world.missions.stage = 0;
  for (const drop of world.cashDrops) {
    if (save.cashTaken && save.cashTaken.includes(drop.x + ',' + drop.z)) {
      drop.taken = true; drop.mesh.visible = false;
    }
  }
}

function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}
function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); } catch { /* private mode */ }
}
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: world.money,
      missionIndex: world.missions.index,
      cashTaken: world.cashDrops.filter((d) => d.taken).map((d) => d.x + ',' + d.z),
      time: Math.round(world.time),
    }));
  } catch { /* private mode */ }
}

const overlay = {
  title: document.getElementById('screen-title'),
  paused: document.getElementById('screen-paused'),
  busted: document.getElementById('screen-busted'),
  over: document.getElementById('screen-over'),
  win: document.getElementById('screen-win'),
};
const overlayText = {
  titleBest: document.getElementById('title-best'),
  titleContinue: document.getElementById('btn-continue'),
  bustedText: document.getElementById('busted-text'),
  overText: document.getElementById('over-text'),
  winText: document.getElementById('win-text'),
};

function showOverlay(name) {
  for (const key of Object.keys(overlay)) {
    overlay[key].classList.toggle('hidden', key !== name);
  }
  if (name === 'title') {
    overlayText.titleBest.textContent = best > 0 ? `Best haul: $${best.toLocaleString()}` : 'A new driver in Solmar City';
    overlayText.titleContinue.style.display = save ? 'inline-block' : 'none';
  }
}

function setStatus(text) {
  hudSetStatus(hud, text);
}

function startGame(fresh) {
  if (fresh) {
    world.money = 0;
    world.missions.index = 0;
    world.missions.stage = 0;
    world.missions.done = false;
    for (const drop of world.cashDrops) { drop.taken = false; drop.mesh.visible = true; }
  }
  world.busted = false;
  world.gameOver = false;
  world.player.health = 100;
  world.player.magAmmo = 12;
  world.player.reserveAmmo = 60;
  world.wanted.stars = 0;
  world.wanted.cops = [];
  screen = SCREEN_PLAY;
  showOverlay(null);
  setStatus('Welcome to Solmar City. Follow the gold marker.');
  audio.unlock();
  audio.missionStart();
}

function respawnAfterBusted() {
  const fine = Math.floor(world.money * 0.1);
  world.money -= fine;
  world.player.x = PLACES.hospital.x;
  world.player.z = PLACES.hospital.z + 10;
  world.player.heading = 0;
  world.player.mesh.position.set(world.player.x, 0, world.player.z);
  world.player.mesh.visible = true;
  world.player.inCar = null;
  world.player.health = 100;
  world.wanted.stars = 0;
  world.wanted.bustTimer = 0;
  for (const cop of [...world.wanted.cops]) world.scene.remove(cop.mesh);
  world.wanted.cops = [];
  world.busted = false;
  screen = SCREEN_PLAY;
  showOverlay(null);
  setStatus(`Busted! You paid a $${fine} fine. The cops let you walk.`);
  writeSave();
}

function placeCamera() {
  const p = world.player;
  renderer.updateCamera(STEP, { x: p.x, y: 0, z: p.z }, p.camYaw, p.camPitch, !!p.inCar);
}

function readInput() {
  const drag = input.takeDrag();
  const held = input.held;
  return {
    moveX: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    moveY: (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
    run: held.has('run'),
    throttle: (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
    steer: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    brake: held.has('brake'),
    interact: input.takeAction(ACTION_INTERACT),
    shoot: input.mouseDown || input.takeClick(),
    reload: input.takeAction(ACTION_RELOAD),
    camDX: drag.x, camDY: drag.y,
  };
}

function draw() {
  renderer.updateParticles(STEP);
  renderer.setBeacon(
    world.objectiveTarget ? world.objectiveTarget.x : 0,
    world.objectiveTarget ? world.objectiveTarget.z : 0,
    !!world.objectiveTarget && screen === SCREEN_PLAY,
  );
  placeCamera();
  renderer.renderer.render(renderer.scene, renderer.camera);
  hudUpdate(hud, world);
}

function resize() {
  const w = window.innerWidth; const h = window.innerHeight;
  renderer.resize(w, h);
  hud.minimap.width = 180; hud.minimap.height = 180;
}
window.addEventListener('resize', resize);
resize();

function runShot(name) {
  const scene = stageShot(name, world, placeCamera);
  showOverlay(scene.screen === SCREEN_TITLE ? 'title' : null);
  let painted = 0;
  function paint() {
    draw();
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
  return scene;
}

// Headless self-test: drive the real rules through a scripted session and
// report pass/fail + state in #status and window.__selftest.
function runSelftest() {
  const report = { errors: [], checks: {} };
  window.addEventListener('error', (e) => report.errors.push(String(e.message || e.error)));
  const p = world.player;
  try {
    // 1. Walk on foot.
    const walkStartX = p.x; const walkStartZ = p.z;
    for (let i = 0; i < 120; i += 1) {
      worldStep(world, STEP, { moveX: 0, moveY: 1, run: false, throttle: 0, steer: 0, brake: false, interact: false, shoot: false, reload: false, camDX: 0, camDY: 0 });
    }
    report.checks.walked = Math.hypot(p.x - walkStartX, p.z - walkStartZ) > 3;
    // 2. Teleport next to the sedan and enter it.
    p.x = world.homeCar.x + 2; p.z = world.homeCar.z + 2;
    worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: true, shoot: false, reload: false, camDX: 0, camDY: 0 });
    report.checks.enteredCar = !!p.inCar;
    // 3. Drive forward for 5 s.
    const startX = p.x; const startZ = p.z;
    for (let i = 0; i < 300; i += 1) {
      worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 1, steer: 0, brake: false, interact: false, shoot: false, reload: false, camDX: 0, camDY: 0 });
    }
    report.checks.drove = Math.hypot(p.x - startX, p.z - startZ) > 20;
    report.checks.carSpeed = Math.abs(p.inCar ? p.inCar.speed : 0);
    // 4. Exit, shoot once, check ammo drops and wanted rises.
    worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: true, shoot: false, reload: false, camDX: 0, camDY: 0 });
    report.checks.exitedCar = !p.inCar;
    placeCamera();
    const ammoBefore = p.magAmmo;
    for (let i = 0; i < 30; i += 1) {
      worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: false, shoot: true, reload: false, camDX: 0, camDY: 0 });
    }
    report.checks.shotFired = p.magAmmo < ammoBefore;
    report.checks.wantedAfterShot = world.wanted.stars;
    report.checks.trafficMoving = world.traffic.some((c) => Math.abs(c.speed) > 2);
    // 5. Mission 1 stage advance: drive the car to the diner door
    // (just outside the diner walls, inside the 10 m objective radius).
    // Park the traffic far away first so a passing car cannot shove us out.
    if (p.inCar === null) {
      p.x = world.homeCar.x + 2; p.z = world.homeCar.z + 2;
      worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: true, shoot: false, reload: false, camDX: 0, camDY: 0 });
    }
    for (const car of world.traffic) { car.x = 170; car.z = 170; car.speed = 0; }
    // Teleport onto the diner's road approach (the mission marker itself).
    p.inCar.x = PLACES.diner.approach.x; p.inCar.z = PLACES.diner.approach.z; p.inCar.speed = 0;
    worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: false, shoot: false, reload: false, camDX: 0, camDY: 0 });
    report.checks.missionStage = world.missions.stage;
    // 6. Collect the package on foot at the diner door (stage 2 -> 3).
    worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: true, shoot: false, reload: false, camDX: 0, camDY: 0 });
    p.x = PLACES.diner.approach.x; p.z = PLACES.diner.approach.z;
    worldStep(world, STEP, { moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false, interact: true, shoot: false, reload: false, camDX: 0, camDY: 0 });
    report.checks.collectedStage = world.missions.stage;
    report.checks.copsSpawned = world.wanted.cops.length;
    report.checks.money = world.money;
    report.checks.playerPos = [Math.round(p.x), Math.round(p.z)];
    report.checks.wanted = world.wanted.stars;
  } catch (e) {
    report.errors.push(`selftest exception: ${e.message}`);
  }
  report.pass = report.errors.length === 0
    && report.checks.walked && report.checks.enteredCar && report.checks.drove
    && report.checks.exitedCar && report.checks.shotFired && report.checks.trafficMoving
    && report.checks.missionStage === 2 && report.checks.collectedStage === 3;
  window.__selftest = report;
  setStatus(`SELFTEST ${report.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(report.checks)} errors=${JSON.stringify(report.errors)}`);
  document.title = `SELFTEST ${report.pass ? 'PASS' : 'FAIL'}`;
  draw();
  window.__shotReady = true;
}

function runGame() {
  let last = performance.now();
  let accumulator = 0;
  let saveTimer = 0;
  screen = SCREEN_TITLE;
  showOverlay('title');
  setStatus('SOLMAR HEAT — an original open-world crime game. Press Enter to start.');

  document.getElementById('btn-start').addEventListener('click', () => startGame(true));
  document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
  document.getElementById('btn-resume').addEventListener('click', () => { screen = SCREEN_PLAY; showOverlay(null); });
  document.getElementById('btn-restart').addEventListener('click', () => startGame(true));
  document.getElementById('btn-busted-ok').addEventListener('click', respawnAfterBusted);
  document.getElementById('btn-over-retry').addEventListener('click', () => { world.gameOver = false; respawnAfterBusted(); });
  document.getElementById('btn-win-roam').addEventListener('click', () => { screen = SCREEN_PLAY; showOverlay(null); });

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    if (input.takeAction(ACTION_MUTE)) {
      const muted = audio.toggleMute();
      setStatus(muted ? 'Sound off' : 'Sound on');
    }
    if (screen === SCREEN_PLAY && input.takeAction(ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      showOverlay('paused');
      setStatus('Paused');
    } else if (screen === SCREEN_PAUSED && input.takeAction(ACTION_PAUSE)) {
      screen = SCREEN_PLAY;
      showOverlay(null);
    }
    if (screen === SCREEN_TITLE && input.takeAction(ACTION_CONFIRM)) startGame(!save);
    if (screen === SCREEN_BUSTED && input.takeAction(ACTION_CONFIRM)) respawnAfterBusted();
    if (screen === SCREEN_OVER && input.takeAction(ACTION_CONFIRM)) { world.gameOver = false; respawnAfterBusted(); }
    if (screen === SCREEN_WIN && input.takeAction(ACTION_CONFIRM)) { screen = SCREEN_PLAY; showOverlay(null); }

    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= STEP && steps < 8) {
        const gameInput = screen === SCREEN_PLAY ? readInput() : {
          moveX: 0, moveY: 0, run: false, throttle: 0, steer: 0, brake: false,
          interact: false, shoot: false, reload: false, camDX: 0, camDY: 0,
        };
        worldStep(world, STEP, gameInput);
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 8) accumulator = 0;
      if (screen === SCREEN_TITLE) {
        // Slow cinematic orbit behind the title screen.
        world.player.camYaw += elapsed * 0.05;
      }
      audio.updateSiren(elapsed, world.wanted.stars);
      if (world.busted) {
        screen = SCREEN_BUSTED;
        overlayText.bustedText.textContent = `The Solmar PD caught Dario. You lose 10% of your cash.`;
        showOverlay('busted');
        writeSave();
      } else if (world.gameOver) {
        screen = SCREEN_OVER;
        overlayText.overText.textContent = `Dario went down in Solmar City. Cash kept: $${world.money.toLocaleString()}.`;
        showOverlay('over');
        writeSave();
      } else if (world.missions.done && screen === SCREEN_PLAY && !world.winShown) {
        world.winShown = true;
        screen = SCREEN_WIN;
        overlayText.winText.textContent = `All three jobs done. Dario owns Solmar City — $${world.money.toLocaleString()} in the pocket.`;
        showOverlay('win');
        if (world.money > best) { best = world.money; saveBest(best); }
        writeSave();
      }
      saveTimer += elapsed;
      if (saveTimer > 10) { saveTimer = 0; writeSave(); }
    }
    draw();
  }
  requestAnimationFrame(frame);
}

// Debug handle for the headless play-test.
window.__game = {
  world,
  step: (input) => worldStep(world, STEP, input),
  get state() {
    return {
      screen,
      money: world.money,
      wanted: world.wanted.stars,
      mission: world.missions.index,
      stage: world.missions.stage,
      health: world.player.health,
      ammo: world.player.magAmmo,
      inCar: !!world.player.inCar,
      cops: world.wanted.cops.length,
      guards: world.guards.length,
      pos: [Math.round(world.player.x), Math.round(world.player.z)],
    };
  },
};

if (selftest) {
  runSelftest();
} else if (shot) {
  runShot(shot);
} else {
  runGame();
}
