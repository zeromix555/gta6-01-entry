// SOLMAR HEAT — cars: arcade physics, traffic AI, collisions.
//
// Two kinds of cars live here. The player's car is a simple arcade model:
// throttle accelerates, steering turns harder the slower you go, braking
// stops you and then reverses. Traffic cars are dumber on purpose — they
// cruise their road, change direction at intersections, and slow down for
// anything stopped ahead of them. Collisions are soft circles: cars push
// each other apart and keep most of their speed, so a traffic jam can never
// trap the player and the self-test drive always covers its distance.

import { CAR, TRAFFIC, WORLD, HORN } from './config.js';
import { clamp, angleDelta, dist2d } from './random.js';
import { collideBuildings, nearestRoadLine, roadHalfWidth } from './city.js';

/** Build a car object. `mesh` is filled in by the renderer. */
export function makeCar(id, kind, name, x, z, heading, color, isHome) {
  return {
    id,
    kind, // 'sedan' | 'sport' | 'traffic' | 'cop'
    name,
    x,
    z,
    heading,
    speed: 0,
    targetSpeed: 0,
    color,
    isHome: !!isHome,
    mesh: null,
    wheelSpin: 0,
    // Traffic AI state (only traffic cars use these).
    axis: 'x', // 'x': travels along z on avenue x=line; 'z': along x on street z=line
    line: 0,
    lane: 3,
    dir: 1,
    stopped: false,
  };
}

/** Top speed for a car kind (the sports car earns its name). */
export function topSpeed(car) {
  return car.kind === 'sport' ? CAR.sportMaxSpeed : CAR.maxSpeed;
}

/**
 * Drive the player's car for one step. Steering is speed-sensitive: full
 * lock at a crawl, gentle at speed, so the car stays controllable at 30 m/s
 * and can still do a tight turn in a car park.
 */
export function updatePlayerCar(world, dt, input) {
  const car = world.player.car;
  if (!car) return;
  const throttle = input.throttle || 0;
  const brake = input.brake ? 1 : 0;
  const steer = input.steer || 0;

  // Longitudinal: throttle, brake, reverse, drag.
  if (throttle > 0) {
    car.speed += CAR.accel * throttle * dt;
  }
  if (brake) {
    if (car.speed > 0.5) {
      car.speed -= CAR.brake * dt;
    } else {
      car.speed -= CAR.reverseAccel * dt; // brake from standstill reverses
    }
  }
  if (throttle <= 0 && !brake) {
    car.speed -= car.speed * CAR.drag * dt;
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, topSpeed(car));

  // Steering: only while moving, scaled down at speed.
  const speedFactor = clamp(Math.abs(car.speed) / 12, 0.25, 1);
  const turn = steer * CAR.turnRate * speedFactor * (car.speed >= 0 ? 1 : -1);
  car.heading += turn * dt;

  // Move, then resolve walls.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  const fixed = collideBuildings(world.city.buildings, car.x, car.z, CAR.radius);
  if (fixed.hit) {
    // A wall scrubs speed instead of stopping you dead — you slide along it.
    car.x = fixed.x;
    car.z = fixed.z;
    car.speed *= 0.55;
  }

  // Soft collisions with traffic: shove them aside, keep your speed.
  // Cars are long (4.4 m) and narrow (2.2 m), so a single big circle would
  // false-trigger on the next lane over. Each car is two small circles —
  // one at the nose, one at the tail — which matches the body shape.
  for (const other of world.traffic) {
    if (carsOverlap(car, other)) {
      pushApart(car, other, 0.6);
      other.speed *= 0.9;
      car.speed *= 0.97;
    }
  }
  for (const cop of world.wanted.cops) {
    if (carsOverlap(car, cop)) {
      pushApart(car, cop, 0.6);
    }
  }

  // The player rides where the car is.
  world.player.x = car.x;
  world.player.z = car.z;
  world.player.heading = car.heading;
  car.wheelSpin += car.speed * dt * 2;
}

/** Push two overlapping cars apart along the line between them. */
export function pushApart(a, b, overlap) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 0.01;
  const nx = dx / d;
  const nz = dz / d;
  const half = overlap / 2;
  a.x -= nx * half;
  a.z -= nz * half;
  b.x += nx * half;
  b.z += nz * half;
}

/**
 * Two-circle car collision: each car is a nose circle and a tail circle
 * (radius 1.15 m, centres 1.2 m either side of the middle). Adjacent lanes
 * are 2.5 m apart, so side-by-side cars never trigger; nose-to-tail and
 * head-on contact does.
 */
export function carsOverlap(a, b) {
  const r = 1.15;
  for (const offA of [-1.2, 1.2]) {
    const ax = a.x + Math.sin(a.heading) * offA;
    const az = a.z + Math.cos(a.heading) * offA;
    for (const offB of [-1.2, 1.2]) {
      const bx = b.x + Math.sin(b.heading) * offB;
      const bz = b.z + Math.cos(b.heading) * offB;
      if (dist2d(ax, az, bx, bz) < r * 2) return true;
    }
  }
  return false;
}

/**
 * Advance all traffic cars. In ambient mode (title screen) they just cruise;
 * in play they also react to the player's car. A traffic car always stays
 * on its road: it travels its axis, and at an intersection it may turn onto
 * the crossing road, snapping onto the correct right-hand lane.
 */
export function updateTraffic(world, dt, ambient) {
  const playerCar = world.player.inCar ? world.player.car : null;
  for (const car of world.traffic) {
    // Ease towards the cruising speed, unless something ahead makes us stop.
    let want = car.targetSpeed;
    if (want <= 0) want = (TRAFFIC.minSpeed + TRAFFIC.maxSpeed) / 2;

    if (!ambient && playerCar) {
      // Do not rear-end the player's car: brake if it is ahead in our lane.
      if (isAheadInLane(car, playerCar, 12)) want = 0;
    }
    // Do not run over the player on foot: stop for them crossing ahead.
    if (!ambient && !world.player.inCar) {
      const pos = { x: world.player.x, z: world.player.z };
      if (isAheadInLane(car, pos, 8)) want = 0;
    }
    // A horn blast startles nearby traffic: it slows to a crawl for a moment.
    if (world.hornAt !== undefined && world.time - world.hornAt < HORN.duration) {
      const pos = world.player.inCar
        ? { x: world.player.car.x, z: world.player.car.z }
        : { x: world.player.x, z: world.player.z };
      if (dist2d(car.x, car.z, pos.x, pos.z) < HORN.range) {
        want = Math.min(want, HORN.slowSpeed);
      }
    }
    // Do not drive through a parked car or a stopped car ahead.
    for (const other of [world.homeCar, world.sportsCar, ...world.traffic]) {
      if (other === car) continue;
      if (Math.abs(other.speed) > 0.5) continue;
      if (isAheadInLane(car, other, TRAFFIC.avoidDistance)) {
        want = 0;
        break;
      }
    }
    // Do not pile into the car directly ahead in the same lane.
    for (const other of world.traffic) {
      if (other === car) continue;
      if (isAheadInLane(car, other, 6) && other.speed < car.speed) {
        want = Math.min(want, other.speed);
      }
    }

    car.speed += clamp(want - car.speed, -8 * dt, 6 * dt);
    if (car.speed < 0) car.speed = 0;

    // Travel along the current axis.
    if (car.axis === 'x') {
      car.x = car.line + car.lane;
      car.z += car.dir * car.speed * dt;
      car.heading = car.dir > 0 ? 0 : Math.PI;
    } else {
      car.z = car.line + car.lane;
      car.x += car.dir * car.speed * dt;
      car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    // At an intersection, sometimes turn onto the crossing road.
    maybeTurn(car, world);

    // Keep inside the city; wrap around the far edge instead of piling up.
    if (car.axis === 'x' && Math.abs(car.z) > WORLD.bound) {
      car.z = -Math.sign(car.z) * WORLD.bound;
    }
    if (car.axis === 'z' && Math.abs(car.x) > WORLD.bound) {
      car.x = -Math.sign(car.x) * WORLD.bound;
    }
    car.wheelSpin += car.speed * dt * 2;
  }
}

/** True when `target` is ahead of `car` in the same lane, within `range`. */
function isAheadInLane(car, target, range) {
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  // Forward vector of the traffic car.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const along = dx * fx + dz * fz;
  if (along <= 0 || along > range) return false;
  // Lateral distance from the car's line of travel.
  const lateral = Math.abs(dx * fz - dz * fx);
  return lateral < 3.2;
}

/** Intersection turns: swap axis, snap to the crossing road's lane. */
function maybeTurn(car, world) {
  const rng = world.rng;
  if (car.axis === 'x') {
    const line = nearestRoadLine(car.z);
    if (Math.abs(car.z - line) > 2.5) return;
    if (!rng.chance(TRAFFIC.turnChance)) return;
    const newDir = rng.chance(0.5) ? 1 : -1;
    car.axis = 'z';
    car.line = line;
    car.lane = newDir > 0 ? 3 : -3; // right-hand traffic
    car.dir = newDir;
    car.z = line + car.lane;
  } else {
    const line = nearestRoadLine(car.x);
    if (Math.abs(car.x - line) > 2.5) return;
    if (!rng.chance(TRAFFIC.turnChance)) return;
    const newDir = rng.chance(0.5) ? 1 : -1;
    car.axis = 'x';
    car.line = line;
    car.lane = newDir > 0 ? -3 : 3; // right-hand traffic on avenues
    car.dir = newDir;
    car.x = line + car.lane;
  }
}

/** Spawn a traffic car on a random road (used when one is removed). */
export function spawnTrafficCar(world, id) {
  const rng = world.rng;
  const line = rng.pick(world.city.roadLines);
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const dir = rng.chance(0.5) ? 1 : -1;
  const lane = axis === 'x' ? (dir > 0 ? -3 : 3) : (dir > 0 ? 3 : -3);
  const car = makeCar(
    id,
    'traffic',
    rng.pick(['Comet', 'Bison', 'Pigeon', 'Dart', 'Mule']),
    axis === 'x' ? line + lane : rng.range(-95, 95),
    axis === 'x' ? rng.range(-95, 95) : line + lane,
    0,
    rng.pick([0xd8d8d8, 0x303030, 0x2e6b34, 0xb0a030, 0x703090, 0x808890]),
    false,
  );
  car.axis = axis;
  car.line = line;
  car.lane = lane;
  car.dir = dir;
  car.speed = rng.range(TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
  car.targetSpeed = car.speed;
  return car;
}
