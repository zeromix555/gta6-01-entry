// SOLMAR HEAT — the world: state, creation, and the fixed-step simulation.
//
// The world is one plain object. Everything the game needs to simulate —
// the player, the cars, traffic, pedestrians, missions, the wanted level,
// cash, guards, the clock — lives on it, and `worldStep` advances it by one
// fixed 1/60 s step. The renderer, HUD and audio only read the world; they
// never mutate it, so the self-test can drive the simulation headlessly
// without a canvas at all.
//
// Player position: when the player is in a car, `playerPos(world)` returns
// the car's position; otherwise the player's own. Every system (missions,
// police, camera, HUD) uses that helper so "where is the player" always
// has one answer.

import { STEP, WORLD, PLAYER, COMBAT, ECONOMY, PLACES, MISSIONS, COLORS } from './config.js';
import { createRng, clamp, dist2d } from './random.js';
import { generateCity, randomRoadPoint } from './city.js';
import { makeCar, updatePlayerCar, updateTraffic } from './vehicles.js';
import { updatePlayer, tryInteract } from './player.js';
import { updatePolice } from './police.js';
import { makePed, updatePedestrians } from './pedestrians.js';
import { createMissions, updateMissions, objectiveTarget } from './missions.js';

/** Position of the player in the world (the car, when driving). */
export function playerPos(world) {
  if (world.player.inCar && world.player.car) {
    return { x: world.player.car.x, z: world.player.car.z };
  }
  return { x: world.player.x, z: world.player.z };
}

/** Create a fresh world for a seed. Nothing here touches the DOM. */
export function createWorld(seed) {
  const rng = createRng(seed);
  const city = generateCity(rng);

  const world = {
    seed,
    rng,
    city,
    time: 0,
    screen: 'title', // title | play | paused | busted | over | win
    money: ECONOMY.startMoney,
    busted: false,
    gameOver: false,
    winShown: false,
    events: [], // { name, detail, t } — the HUD/audio drain these
    stats: { shotsFired: 0, carsStolen: 0, missionsDone: 0, pedsDown: 0 },

    player: {
      x: PLACES.spawn.x,
      z: PLACES.spawn.z,
      heading: PLACES.spawn.heading,
      camYaw: PLACES.spawn.heading,
      camPitch: 0.32,
      mesh: null,
      health: PLAYER.maxHealth,
      magAmmo: COMBAT.magSize,
      reserveAmmo: COMBAT.startReserve,
      inCar: false,
      car: null,
      fireCooldown: 0,
      hurtCooldown: 0,
      lastHurtAt: -999, // world time of the last damage (drives health regen)
      bustTimer: 0,
      walkPhase: 0,
      muted: false,
    },

    // Your car: the blue Vireo sedan parked beside the spawn.
    homeCar: makeCar('home', 'sedan', 'Vireo Sedan', PLACES.homeCar.x, PLACES.homeCar.z, PLACES.homeCar.heading, COLORS.homeCar, true),
    // The fast one: a red Falco GT parked on the central avenue.
    sportsCar: makeCar('sport', 'sport', 'Falco GT', PLACES.sportsCar.x, PLACES.sportsCar.z, PLACES.sportsCar.heading, COLORS.sportsCar, false),

    traffic: [],
    pedestrians: [],
    cashDrops: [],
    guards: [],
    missions: createMissions(),
    wanted: { stars: 0, cops: [], lastCrimeAt: -999, decayAt: 0 },
    hornAt: -999, // world time of the last horn blast (traffic startles)
    objective: objectiveTarget(0),

    // Filled in by the renderer / audio at boot; null in headless runs.
    scene: null,
    camera: null,
    audio: null,
    renderer: null,
  };

  // Traffic: seeded cars spread over the roads, never near the spawn.
  for (let i = 0; i < 10; i++) {
    let point = randomRoadPoint(rng);
    let guard = 0;
    while (dist2d(point.x, point.z, PLACES.spawn.x, PLACES.spawn.z) < 30 && guard++ < 20) {
      point = randomRoadPoint(rng);
    }
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = axis === 'x' ? point.x : point.z;
    world.traffic.push(
      makeCar(`traffic-${i}`, 'traffic', rng.pick(['Comet', 'Bison', 'Pigeon', 'Dart', 'Mule']), point.x, point.z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), rng.pick(COLORS.trafficPalette), false),
    );
    const car = world.traffic[world.traffic.length - 1];
    car.axis = axis;
    car.line = axis === 'x' ? Math.round(point.x / 40) * 40 : Math.round(point.z / 40) * 40;
    car.lane = rng.chance(0.5) ? 3 : -3;
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.speed = rng.range(7, 12);
    car.targetSpeed = car.speed;
    // Snap the car onto its lane so it starts exactly on a road.
    if (axis === 'x') car.x = car.line + car.lane;
    else car.z = car.line + car.lane;
  }

  // Pedestrians on the sidewalks around the centre of town.
  for (let i = 0; i < 14; i++) {
    world.pedestrians.push(makePed(rng, world.city.buildings, i));
  }

  // Cash drops: eight envelopes of street money, on roads and sidewalks.
  // Small envelopes are common, big ones are rare (weighted, not uniform).
  for (let i = 0; i < 8; i++) {
    const point = randomRoadPoint(rng);
    world.cashDrops.push({
      id: i,
      x: point.x,
      z: point.z,
      amount: rng.weighted([[50, 5], [100, 3], [150, 2], [200, 1]]),
      taken: false,
      mesh: null,
      spin: rng.range(0, Math.PI * 2),
    });
  }

  return world;
}

/** Push an event for the HUD/audio. Cheap, and safe to call headlessly. */
export function onEvent(world, name, detail) {
  world.events.push({ name, detail: detail ?? null, t: world.time });
  if (world.events.length > 40) world.events.splice(0, world.events.length - 40);
}

/** Current mission objective point (the gold beacon target). */
export function currentObjective(world) {
  return world.objective;
}

/**
 * One fixed simulation step. `input` is:
 * { moveX, moveY, run, throttle, steer, brake, interact, shoot, reload,
 *   camDX, camDY } — all optional, all defaulting to neutral.
 * The title screen still runs an ambient city (traffic and pedestrians)
 * so the backdrop is alive; pause freezes everything.
 */
export function worldStep(world, dt, input) {
  const step = dt || STEP;
  const inp = input || {};
  world.time += step;

  if (world.screen === 'paused') return;

  if (world.screen !== 'play') {
    // Title / busted / over / win overlays: the city keeps breathing.
    updateTraffic(world, step, true);
    updatePedestrians(world, step);
    return;
  }

  // Camera orbit from the mouse, applied to the player's view yaw.
  if (inp.camDX) {
    world.player.camYaw -= inp.camDX * 0.0035;
  }
  if (inp.camDY) {
    world.player.camPitch = clamp(world.player.camPitch + inp.camDY * 0.002, -0.1, 0.9);
  }

  // Interact is an edge: one press, one action.
  if (inp.interact) {
    tryInteract(world);
  }

  if (world.player.inCar && world.player.car) {
    updatePlayerCar(world, step, inp);
  } else {
    updatePlayer(world, step, inp);
  }

  updateTraffic(world, step, false);
  updatePedestrians(world, step);
  updatePolice(world, step);
  updateMissions(world, step);
  updateCashDrops(world);
  updateWantedDecay(world);

  // Keep everyone inside the city and out of the buildings.
  clampToCity(world);
}

/** Cash pickups: walking or driving over an envelope banks it. */
function updateCashDrops(world) {
  const pos = playerPos(world);
  for (const drop of world.cashDrops) {
    if (drop.taken) continue;
    if (dist2d(pos.x, pos.z, drop.x, drop.z) < 2.5) {
      drop.taken = true;
      world.money += drop.amount;
      onEvent(world, 'cash', { amount: drop.amount, money: world.money });
    }
  }
}

/** Wanted stars fade one at a time when you keep your nose clean. */
function updateWantedDecay(world) {
  const wanted = world.wanted;
  if (wanted.stars <= 0) return;
  if (world.time - wanted.lastCrimeAt < COMBAT.wantedDecaySeconds) return;
  const nearCop = wanted.cops.some((cop) => {
    const pos = playerPos(world);
    return dist2d(pos.x, pos.z, cop.x, cop.z) < 30;
  });
  if (nearCop) return;
  wanted.stars -= 1;
  wanted.lastCrimeAt = world.time;
  onEvent(world, 'wanted-down', { stars: wanted.stars });
}

/** Clamp the player, their car and every cop inside the city bounds. */
function clampToCity(world) {
  const b = WORLD.bound;
  const p = world.player;
  p.x = clamp(p.x, -b, b);
  p.z = clamp(p.z, -b, b);
  for (const car of [world.homeCar, world.sportsCar, ...world.traffic, ...world.wanted.cops]) {
    if (!car) continue;
    car.x = clamp(car.x, -b, b);
    car.z = clamp(car.z, -b, b);
  }
}

/** Serialize the save: money, mission progress, taken cash drops. */
export function saveGame(world) {
  try {
    const data = {
      money: world.money,
      missionIndex: world.missions.index,
      missionStage: world.missions.stage,
      cashTaken: world.cashDrops.filter((d) => d.taken).map((d) => d.id),
      best: Math.max(world.money, loadBest()),
    };
    localStorage.setItem('solmar-heat-save-v1', JSON.stringify(data));
    localStorage.setItem('solmar-heat-best', String(data.best));
  } catch (e) {
    // Storage can be unavailable (private mode, file://) — the game plays on.
  }
}

/** Load a save if one exists, or null. Never throws. */
export function loadSave() {
  try {
    const raw = localStorage.getItem('solmar-heat-save-v1');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** Best money ever banked, or 0. Never throws. */
export function loadBest() {
  try {
    return Number(localStorage.getItem('solmar-heat-best') || 0) || 0;
  } catch (e) {
    return 0;
  }
}

/** Apply a loaded save to a fresh world. */
export function applySave(world, save) {
  if (!save) return;
  world.money = save.money ?? world.money;
  const savedIndex = save.missionIndex ?? 0;
  if ((save.missionStage ?? 1) === 3) {
    // A save taken at the moment of completion: that job is done and the
    // next one is already the current job (stage 3 only ever lasts two
    // steps in live play, so a stored 3 always means "just finished").
    world.missions.done[savedIndex] = true;
    world.missions.index = savedIndex + 1;
    world.missions.stage = 1;
  } else {
    world.missions.index = savedIndex;
    world.missions.stage = save.missionStage ?? 1;
  }
  world.missions.done = world.missions.done.map((_, i) => i < world.missions.index);
  world.objective = objectiveTarget(world.missions.index);
  const taken = new Set(save.cashTaken || []);
  for (const drop of world.cashDrops) {
    if (taken.has(drop.id)) drop.taken = true;
  }
}
