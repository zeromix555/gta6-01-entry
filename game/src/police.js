// SOLMAR HEAT — the wanted system and the police who answer it.
//
// Stars go up when you shoot (one per shot) or steal a car, and fade one at
// a time after 25 quiet seconds with no cruiser nearby. The number of
// cruisers on the street always equals the star count: they spawn the
// moment a star is earned, up to five, and despawn as stars fade. Cruisers
// chase in the open — they cut across blocks, not just roads — ram your car
// when they catch it, and bust you on foot if one sits on top of you for
// just over a second.

import { COMBAT, WORLD, COLORS } from './config.js';
import { clamp, angleDelta, dist2d } from './random.js';
import { collideBuildings, randomRoadPoint } from './city.js';
import { makeCar, carsOverlap, pushApart } from './vehicles.js';
import { playerPos, onEvent } from './world.js';
import { damagePlayer, bustPlayer } from './player.js';

/** Add stars (capped at 5) and make sure the cruisers match. */
export function addWanted(world, stars) {
  const wanted = world.wanted;
  const before = wanted.stars;
  wanted.stars = Math.min(COMBAT.maxWanted, wanted.stars + stars);
  wanted.lastCrimeAt = world.time;
  if (wanted.stars !== before) {
    syncCops(world);
    onEvent(world, 'wanted', { stars: wanted.stars });
  }
}

/** Spawn or remove cruisers until their count equals the star count. */
export function syncCops(world) {
  const wanted = world.wanted;
  while (wanted.cops.length < wanted.stars) {
    wanted.cops.push(spawnCop(world, wanted.cops.length));
  }
  while (wanted.cops.length > wanted.stars) {
    wanted.cops.pop();
  }
}

/** One cruiser, placed on a road 35–55 m from the player. */
function spawnCop(world, n) {
  const pos = playerPos(world);
  let point = randomRoadPoint(world.rng);
  let guard = 0;
  while ((dist2d(point.x, point.z, pos.x, pos.z) < 35 || dist2d(point.x, point.z, pos.x, pos.z) > 55) && guard++ < 30) {
    point = randomRoadPoint(world.rng);
  }
  return spawnCopAt(world, point.x, point.z, world.rng.range(0, Math.PI * 2), 12, n);
}

/** One cruiser at an exact spot (the staged shots place their own). */
export function spawnCopAt(world, x, z, heading, speed, n) {
  const cop = makeCar(`cop-${Date.now() % 100000}-${n ?? 0}`, 'cop', 'Cruiser', x, z, heading, COLORS.copCar, false);
  cop.speed = speed;
  cop.targetSpeed = COMBAT.copTopSpeed;
  cop.ramCooldown = 0;
  return cop;
}

/** Chase, ram, and bust logic, one step. */
export function updatePolice(world, dt) {
  const wanted = world.wanted;
  const pos = playerPos(world);
  const p = world.player;

  // No stars, no cruisers: make sure none linger.
  if (wanted.stars <= 0) {
    if (wanted.cops.length > 0) wanted.cops.length = 0;
    return;
  }

  // A cruiser that fell too far behind respawns closer (keeps pressure on).
  for (let i = 0; i < wanted.cops.length; i++) {
    const cop = wanted.cops[i];
    if (dist2d(cop.x, cop.z, pos.x, pos.z) > 130) {
      wanted.cops[i] = spawnCop(world, i);
    }
  }

  // At four stars and up the police stop chasing only from behind: they
  // throw a roadblock ahead of your direction of travel, so the escape
  // route closes in front of you as well. The farthest cruiser is the one
  // that gets moved — the ones already on your tail stay on your tail.
  if (wanted.stars >= 4 && wanted.cops.length > 0) {
    const heading = world.player.heading;
    const aheadX = pos.x + Math.sin(heading) * 45;
    const aheadZ = pos.z + Math.cos(heading) * 45;
    const anyAhead = wanted.cops.some((cop) => {
      const dx = cop.x - pos.x;
      const dz = cop.z - pos.z;
      const forward = dx * Math.sin(heading) + dz * Math.cos(heading);
      return forward > 20 && dist2d(cop.x, cop.z, pos.x, pos.z) < 70;
    });
    if (!anyAhead) {
      let far = wanted.cops[0];
      let farD = -1;
      for (const cop of wanted.cops) {
        const d = dist2d(cop.x, cop.z, pos.x, pos.z);
        if (d > farD) {
          farD = d;
          far = cop;
        }
      }
      let point = randomRoadPoint(world.rng);
      let guard = 0;
      while (dist2d(point.x, point.z, aheadX, aheadZ) > 25 && guard++ < 20) {
        point = randomRoadPoint(world.rng);
      }
      far.x = point.x;
      far.z = point.z;
      far.speed = 10;
    }
  }

  for (const cop of wanted.cops) {
    if (cop.ramCooldown > 0) cop.ramCooldown -= dt;

    // Steer towards the player: desired heading from the delta, turning at
    // a fixed rate so cruisers swing wide instead of snapping around.
    const dx = pos.x - cop.x;
    const dz = pos.z - cop.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
    const desired = Math.atan2(dx, dz);
    const turn = clamp(angleDelta(cop.heading, desired), -2.4 * dt, 2.4 * dt);
    cop.heading += turn;

    // Cruisers are fast, but they ease off when they are right on top of
    // you so they ram instead of orbiting through you.
    const wantSpeed = dist > 12 ? COMBAT.copTopSpeed : Math.max(6, COMBAT.copTopSpeed * 0.6);
    cop.speed += clamp(wantSpeed - cop.speed, -10 * dt, 8 * dt);

    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    const fixed = collideBuildings(world.city.buildings, cop.x, cop.z, 2.1);
    if (fixed.hit) {
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.speed *= 0.6;
    }

    // Do not stack cruisers on the same spot.
    for (const other of wanted.cops) {
      if (other === cop) continue;
      if (carsOverlap(cop, other)) pushApart(cop, other, 0.5);
    }

    if (p.inCar) {
      // Ramming: contact with your car hurts you, with a per-cruiser delay.
      if (dist < 4.2 && cop.ramCooldown <= 0) {
        cop.ramCooldown = 1;
        cop.speed *= 0.6;
        damagePlayer(world, COMBAT.copRamDamage, 'cop-ram');
        onEvent(world, 'rammed', { cop: cop.id });
      }
      p.bustTimer = 0;
    } else {
      // On foot: a cruiser parked on you starts the bust clock.
      if (dist < COMBAT.copBustRange) {
        p.bustTimer += dt;
        if (p.bustTimer >= COMBAT.copBustTime) {
          p.bustTimer = 0;
          bustPlayer(world);
          return;
        }
      } else {
        p.bustTimer = Math.max(0, p.bustTimer - dt * 2);
      }
    }
  }
}
