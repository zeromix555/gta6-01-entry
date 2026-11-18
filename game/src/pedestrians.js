// SOLMAR HEAT — pedestrians: the city walking around you.
//
// Pedestrians amble along the sidewalks, change direction at random, and
// turn away from walls instead of walking through them. A gunshot nearby
// sends them running: they sprint away from the sound for a few seconds,
// then settle back to a walk. One caught in your line of fire goes down
// for a while and later gets back up somewhere else in town — nobody stays
// down forever, and nobody is ever more than set dressing with a heartbeat.

import { PEDS, WORLD } from './config.js';
import { clamp, dist2d } from './random.js';
import { collideBuildings, randomRoadPoint, isOnRoad } from './city.js';
import { playerPos } from './world.js';

/** Build one pedestrian on a sidewalk, clear of the player and the roads. */
export function makePed(rng, buildings, id) {
  // Pick a road point, then step off the road onto the sidewalk beside it.
  const point = randomRoadPoint(rng);
  const onAvenue = Math.abs(point.x - Math.round(point.x / 40) * 40) < Math.abs(point.z - Math.round(point.z / 40) * 40);
  const side = rng.chance(0.5) ? 1 : -1;
  const x = onAvenue ? point.x + side * rng.range(8, 10) : point.x;
  const z = onAvenue ? point.z : point.z + side * rng.range(8, 10);
  const palette = [0xc96a3a, 0x3a6ac9, 0x7a3ac9, 0x3ac96a, 0xc9b83a, 0x888888];
  return {
    id: `ped-${id}`,
    x: clamp(x, -WORLD.bound, WORLD.bound),
    z: clamp(z, -WORLD.bound, WORLD.bound),
    heading: rng.range(0, Math.PI * 2),
    speed: rng.range(1.0, 1.8),
    state: 'walk', // 'walk' | 'flee' | 'down'
    fleeTimer: 0,
    downTimer: 0,
    color: rng.pick(palette),
    mesh: null,
    stepPhase: rng.range(0, Math.PI * 2),
  };
}

/** Advance every pedestrian one step. */
export function updatePedestrians(world, dt) {
  const pos = playerPos(world);
  const rng = world.rng;

  // A shot in the last half-second, close by, scares the neighbourhood.
  let recentShot = null;
  for (let i = world.events.length - 1; i >= 0; i--) {
    const ev = world.events[i];
    if (ev.name === 'shot' && world.time - ev.t < 0.5) {
      recentShot = ev.detail;
      break;
    }
    if (world.time - ev.t > 0.5) break;
  }

  for (const ped of world.pedestrians) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        // Get up somewhere else in town, clear of the player.
        const fresh = makePed(rng, world.city.buildings, ped.id.replace('ped-', ''));
        ped.x = fresh.x;
        ped.z = fresh.z;
        ped.heading = fresh.heading;
        ped.state = 'walk';
        ped.fleeTimer = 0;
      }
      continue;
    }

    if (recentShot && dist2d(ped.x, ped.z, recentShot.x, recentShot.z) < PEDS.fleeRadius) {
      ped.state = 'flee';
      ped.fleeTimer = 3;
      // Run directly away from the shot.
      ped.heading = Math.atan2(ped.x - recentShot.x, ped.z - recentShot.z);
    }

    // A car bearing down on you gets a sidestep: pedestrians jump clear of
    // the lane instead of trusting the driver to stop.
    if (world.player.inCar && world.player.car) {
      const car = world.player.car;
      const dCar = dist2d(ped.x, ped.z, car.x, car.z);
      if (dCar < 7 && Math.abs(car.speed) > 3) {
        const side =
          (ped.x - car.x) * Math.cos(car.heading) - (ped.z - car.z) * Math.sin(car.heading) >= 0 ? 1 : -1;
        ped.heading = car.heading + side * (Math.PI / 2);
        ped.state = 'flee';
        ped.fleeTimer = 1.2;
      }
    }

    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }

    const speed = ped.state === 'flee' ? PEDS.fleeSpeed : ped.speed;

    // Amblers change their mind at random; the fleeing keep a straight line.
    if (ped.state === 'walk' && rng.chance(0.004)) {
      ped.heading = rng.range(0, Math.PI * 2);
    }

    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    const fixed = collideBuildings(world.city.buildings, nx, nz, 0.5);
    if (fixed.hit) {
      // A wall means turn around instead of getting stuck on it.
      ped.heading += Math.PI / 2 + rng.range(-0.4, 0.4);
    } else {
      ped.x = fixed.x;
      ped.z = fixed.z;
    }
    ped.x = clamp(ped.x, -WORLD.bound, WORLD.bound);
    ped.z = clamp(ped.z, -WORLD.bound, WORLD.bound);
    ped.stepPhase += dt * speed * 3.2;
  }
}
