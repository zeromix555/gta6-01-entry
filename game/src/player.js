// SOLMAR HEAT — the player on foot: walking, shooting, stealing cars,
// getting busted, and getting killed.
//
// One rule governs the interact key (E): a single press does exactly one
// thing, with this priority — collect a mission package you are standing
// on, step out of the car you are driving, or climb into the nearest car.
// That priority is what makes the scripted self-test deterministic: exiting
// the car at the objective never accidentally collects the package in the
// same step, and collecting never accidentally re-enters the car.

import { PLAYER, COMBAT, ECONOMY, PLACES } from './config.js';
import { clamp, dist2d } from './random.js';
import { collideBuildings } from './city.js';
import { playerPos, onEvent, saveGame } from './world.js';
import { addWanted } from './police.js';
import { collectMissionPackage, missionStageAt } from './missions.js';

/** Walk the player for one step (only called when not in a car). */
export function updatePlayer(world, dt, input) {
  const p = world.player;
  const moveY = input.moveY || 0;
  const moveX = input.moveX || 0;
  const run = !!input.run;

  // A/D turn the body; W/S walk forward and back along the heading.
  p.heading += moveX * PLAYER.turnSpeed * dt;
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const nx = p.x + fx * moveY * speed * dt;
  const nz = p.z + fz * moveY * speed * dt;

  const fixed = collideBuildings(world.city.buildings, nx, nz, PLAYER.radius);
  p.x = fixed.x;
  p.z = fixed.z;
  if (moveY !== 0) p.walkPhase += dt * speed * 1.6;

  // Camera yaw follows the body unless the mouse has taken over recently.
  p.camYaw += (p.heading - p.camYaw) * Math.min(1, dt * 4);

  // Shooting and reloading.
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.hurtCooldown > 0) p.hurtCooldown -= dt;
  if (input.shoot) shoot(world);
  if (input.reload) reload(world);

  // Health trickles back after ten quiet seconds: Solmar lets you catch
  // your breath, but only once the shooting has actually stopped.
  if (p.health > 0 && p.health < PLAYER.maxHealth && world.time - p.lastHurtAt > 10) {
    p.health = Math.min(PLAYER.maxHealth, p.health + 3 * dt);
  }
}

/** Fire one pistol shot: costs a round, makes noise, raises heat. */
export function shoot(world) {
  const p = world.player;
  if (p.inCar) return; // no drive-bys: shoot on foot only
  if (p.fireCooldown > 0) return;
  if (p.magAmmo <= 0) {
    p.fireCooldown = 0.25; // dry click, then you may try again
    onEvent(world, 'dry-fire');
    return;
  }
  p.fireCooldown = COMBAT.fireInterval;
  p.magAmmo -= 1;
  world.stats.shotsFired += 1;
  onEvent(world, 'shot', { x: p.x, z: p.z, heading: p.heading });
  addWanted(world, COMBAT.shotWanted);

  // Hit scan: the nearest guard roughly in front of you, inside range.
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  let bestGuard = null;
  let bestDist = COMBAT.shotRange;
  for (const guard of world.guards) {
    if (guard.health <= 0) continue;
    const dx = guard.x - p.x;
    const dz = guard.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > bestDist) continue;
    const dot = (dx * fx + dz * fz) / (d || 1); // cos of the angle off aim
    if (dot < Math.cos(COMBAT.shotHalfAngle)) continue;
    bestGuard = guard;
    bestDist = d;
  }
  if (bestGuard) {
    bestGuard.health -= 1;
    onEvent(world, 'guard-hit', { guard: bestGuard.id, health: bestGuard.health });
    if (bestGuard.health <= 0) {
      onEvent(world, 'guard-down', { guard: bestGuard.id });
    }
  }

  // A pedestrian caught in front of you goes down (and stays down).
  let bestPed = null;
  let bestPedDist = 14;
  for (const ped of world.pedestrians) {
    if (ped.state === 'down') continue;
    const dx = ped.x - p.x;
    const dz = ped.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > bestPedDist) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.9) continue;
    bestPed = ped;
    bestPedDist = d;
  }
  if (bestPed) {
    bestPed.state = 'down';
    bestPed.downTimer = 6;
    world.stats.pedsDown += 1;
    onEvent(world, 'ped-down', { ped: bestPed.id });
  }
}

/** Move rounds from the reserve into the magazine. */
export function reload(world) {
  const p = world.player;
  if (p.magAmmo >= COMBAT.magSize) return;
  if (p.reserveAmmo <= 0) return;
  const need = COMBAT.magSize - p.magAmmo;
  const moved = Math.min(need, p.reserveAmmo);
  p.magAmmo += moved;
  p.reserveAmmo -= moved;
  onEvent(world, 'reload', { mag: p.magAmmo, reserve: p.reserveAmmo });
}

/**
 * The interact key. Priority: (1) collect a mission package underfoot,
 * (2) step out of the car, (3) climb into the nearest car. Exactly one
 * action per press.
 */
export function tryInteract(world) {
  const p = world.player;

  // In a car: step out beside it.
  if (p.inCar && p.car) {
    exitCar(world);
    return;
  }

  // On foot at the objective while the package is waiting: collect it.
  const pos = playerPos(world);
  if (world.missions.stage === 2 && missionStageAt(world) === 2) {
    const obj = world.objective;
    if (dist2d(pos.x, pos.z, obj.x, obj.z) < 10) {
      collectMissionPackage(world);
      return;
    }
  }

  // Otherwise: climb into the nearest car in range.
  let best = null;
  let bestDist = PLAYER.interactRange;
  for (const car of [world.homeCar, world.sportsCar, ...world.traffic]) {
    const d = dist2d(pos.x, pos.z, car.x, car.z);
    if (d < bestDist) {
      best = car;
      bestDist = d;
    }
  }
  if (best) enterCar(world, best);
}

/** Climb into a car. Anything that is not your sedan counts as stealing. */
export function enterCar(world, car) {
  const p = world.player;
  p.inCar = true;
  p.car = car;
  car.speed = Math.max(car.speed, 0);
  if (!car.isHome) {
    world.stats.carsStolen += 1;
    addWanted(world, COMBAT.stealWanted);
    onEvent(world, 'stole-car', { car: car.name });
  } else {
    onEvent(world, 'entered-car', { car: car.name });
  }
}

/** Step out of the car, beside it, facing the same way it faces. */
export function exitCar(world) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  // Step out on the driver's side: 2.2 m perpendicular to the heading.
  const sx = Math.cos(car.heading);
  const sz = -Math.sin(car.heading);
  p.x = car.x + sx * 2.2;
  p.z = car.z + sz * 2.2;
  p.heading = car.heading;
  p.camYaw = car.heading;
  p.inCar = false;
  p.car = null;
  car.speed *= 0.5;
  onEvent(world, 'exited-car', { car: car.name });
}

/** Hurt the player (cops, guards). At zero health the run is over. */
export function damagePlayer(world, amount, source) {
  const p = world.player;
  if (p.hurtCooldown > 0) return;
  if (world.gameOver || world.busted) return;
  p.hurtCooldown = PLAYER.hurtCooldown;
  p.lastHurtAt = world.time; // restarts the ten-second regen clock
  p.health = Math.max(0, p.health - amount);
  onEvent(world, 'hurt', { amount, source, health: p.health });
  if (p.health <= 0) {
    world.gameOver = true;
    world.screen = 'over';
    saveGame(world);
    onEvent(world, 'game-over');
  }
}

/**
 * Busted: the cops take 10% of your cash and dump you at Solmar General
 * with full health and a clean slate. The screen flips to 'busted'; the
 * OK button on that overlay sends you back to play.
 */
export function bustPlayer(world) {
  const p = world.player;
  const lost = Math.floor(world.money * ECONOMY.bustedLoss);
  world.money -= lost;
  p.health = PLAYER.maxHealth;
  p.x = PLACES.hospital.x;
  p.z = PLACES.hospital.z;
  p.heading = Math.PI / 2;
  p.camYaw = Math.PI / 2;
  p.inCar = false;
  p.car = null;
  p.bustTimer = 0;
  world.wanted.stars = 0;
  world.wanted.cops.length = 0;
  world.busted = true;
  world.screen = 'busted';
  saveGame(world);
  onEvent(world, 'busted', { lost, money: world.money });
}
