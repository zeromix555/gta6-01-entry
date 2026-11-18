// SOLMAR HEAT — the four staged screenshots.
//
// Each shot builds a fresh world from the seed, arranges a real gameplay
// moment with the same rules the player lives under, then drives it forward
// with scripted inputs (an autopilot) for a few seconds. Nothing is posed
// by hand in the renderer: the chase shot really is the sports car doing
// 30 m/s down the avenue with cruisers behind it, and the mission shot
// really is the bank job with its guards out. After the autopilot the main
// loop paints three frames and the shot is ready.
//
// The queries in shots.json are `?shot=<name>&seed=7`; the same seed always
// produces the same frame.

import { STEP, PLACES, COMBAT } from './config.js';
import { worldStep, playerPos } from './world.js';
import { spawnCopAt } from './police.js';
import { spawnGuards } from './missions.js';

const BLANK = () => ({
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

/**
 * Stage one shot by name. `world` is fresh (seed 7). Returns the screen the
 * shot wants shown ('play' or 'title'). The caller renders three frames and
 * sets window.__shotReady.
 */
export function stageShot(world, name) {
  if (name === 'chase') return stageChase(world);
  if (name === 'street') return stageStreet(world);
  if (name === 'mission') return stageMission(world);
  if (name === 'start') return stageStart(world);
  return 'play';
}

/**
 * CHASE (the cover): the player in the red Falco GT, flat out down the
 * central avenue at speed, three wanted stars, three cruisers in pursuit
 * behind. Autopilot: full throttle with a gentle weave for 2.5 seconds.
 *
 * The camera is a front tracking shot (camYaw opposite the heading): the
 * sports car drives towards the lens with the cruisers trailing behind it
 * in the same frame. A normal chase camera would hide the pursuit behind
 * the lens, which is exactly what this cover must show.
 */
function stageChase(world) {
  world.screen = 'play';
  const car = world.sportsCar;
  car.x = 2;
  car.z = 30;
  car.heading = Math.PI;
  car.speed = 24;
  world.player.x = car.x;
  world.player.z = car.z;
  world.player.heading = Math.PI;
  world.player.camYaw = 0; // front tracking shot: camera ahead, looking back
  world.player.inCar = true;
  world.player.car = car;

  // Three stars, three cruisers stacked behind the sports car.
  world.wanted.stars = 3;
  world.wanted.lastCrimeAt = world.time;
  world.wanted.cops.length = 0;
  const offsets = [16, 28, 42];
  offsets.forEach((off, i) => {
    world.wanted.cops.push(spawnCopAt(world, 2, 30 + off, Math.PI, 22, i));
  });

  for (let i = 0; i < 150; i++) {
    const input = BLANK();
    input.throttle = 1;
    input.steer = Math.sin(i * 0.05) * 0.12; // a gentle weave, not a swerve
    worldStep(world, STEP, input);
  }
  return 'play';
}

/**
 * STREET: on foot downtown at the crossroads, mission 0 live, traffic
 * crossing in both directions, the gold marker ahead. Autopilot: walk
 * forward through the intersection for 1.5 seconds.
 *
 * One traffic car is placed on the crossing street so the frame always has
 * a car mid-intersection in front of the player, not just distant traffic.
 */
function stageStreet(world) {
  world.screen = 'play';
  world.player.x = 2;
  world.player.z = -34;
  world.player.heading = Math.PI;
  world.player.camYaw = Math.PI;
  world.missions.index = 0;
  world.missions.stage = 1;
  world.objective = { x: 44, z: -56 };

  // The crossing car: eastbound on street z = -40, about to enter the
  // crossroads the player is walking through.
  const crosser = world.traffic[0];
  if (crosser) {
    crosser.axis = 'z';
    crosser.line = -40;
    crosser.lane = 3;
    crosser.dir = 1;
    crosser.x = -30;
    crosser.z = -37;
    crosser.speed = 10;
    crosser.targetSpeed = 10;
  }

  for (let i = 0; i < 90; i++) {
    const input = BLANK();
    input.moveY = 1;
    worldStep(world, STEP, input);
  }
  return 'play';
}

/**
 * MISSION: the bank job. The player is on foot outside the Solmar National
 * Bank, the four guards are out, four wanted stars, cruisers closing in.
 * Autopilot: walk towards the bank doors for a second.
 */
function stageMission(world) {
  world.screen = 'play';
  world.missions.index = 2;
  world.missions.stage = 2;
  world.missions.guardsSpawned = false;
  world.objective = { x: -44, z: -56 };
  spawnGuards(world);

  world.player.x = -40;
  world.player.z = -48;
  world.player.heading = -Math.PI / 2; // facing the bank (west)
  world.player.camYaw = -Math.PI / 2;

  // Four stars, four cruisers coming down the surrounding roads.
  world.wanted.stars = 4;
  world.wanted.lastCrimeAt = world.time;
  world.wanted.cops.length = 0;
  const copSpots = [
    { x: -40, z: -10, heading: Math.PI },
    { x: 0, z: -56, heading: -Math.PI / 2 },
    { x: -80, z: -56, heading: Math.PI / 2 },
    { x: -40, z: -100, heading: 0 },
  ];
  copSpots.forEach((spot, i) => {
    world.wanted.cops.push(spawnCopAt(world, spot.x, spot.z, spot.heading, 16, i));
  });

  for (let i = 0; i < 60; i++) {
    const input = BLANK();
    input.moveY = 1;
    worldStep(world, STEP, input);
  }
  return 'play';
}

/**
 * START: the title screen over a living city. The player stands by the home
 * sedan while traffic rolls past. Autopilot: 2.5 seconds of ambient city —
 * traffic and pedestrians move, the player does not.
 */
function stageStart(world) {
  world.screen = 'title';
  world.player.x = PLACES.spawn.x;
  world.player.z = PLACES.spawn.z;
  world.player.heading = Math.PI;
  world.player.camYaw = Math.PI;

  for (let i = 0; i < 150; i++) {
    worldStep(world, STEP, BLANK());
  }
  return 'title';
}
