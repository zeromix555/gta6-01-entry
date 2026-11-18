// SOLMAR HEAT v2
// World — owns all game state and advances it one fixed step at a time:
// player, traffic, pedestrians, police, guards, missions, cash, wanted heat,
// busted/game-over, and the objective marker. Pure logic; rendering lives
// in render.js, the loop and screens in main.js.
import { STEP, PLAYER, CAR, PLACES, CASH_DROPS, TRAFFIC_CARS, PEDESTRIANS, BLOCK } from './config.js';
import { buildCity, resolveCollisions } from './city.js';
import { createPlayer, playerWalkStep, playerDriveStep, playerShoot, nearestCar } from './player.js';
import { spawnTraffic, spawnParked, trafficStep } from './vehicles.js';
import { spawnPedestrians, pedStep, makePedMesh } from './pedestrians.js';
import { createWanted, addWanted, wantedStep, copRamDamage } from './police.js';
import { createMissions, currentMission, currentStage, objectiveTarget, missionsStep, missionObjectiveText, setMessage } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_CRASH = 1;
export const EVENT_SHOT = 2;
export const EVENT_BUSTED = 4;
export const EVENT_MISSION_DONE = 8;

export function createWorld(scene, random) {
  const city = buildCity(scene, random);
  // Dario spawns on the sidewalk beside his sedan (parked at the road edge).
  const player = createPlayer(scene, -47.5, -20);
  const traffic = spawnTraffic(random, city.roadLines, city.colliders);
  for (const car of traffic) scene.add(car.mesh);
  const parked = spawnParked(random);
  for (const car of parked) scene.add(car.mesh);
  const peds = spawnPedestrians(random, PEDESTRIANS);
  for (const ped of peds) scene.add(ped.mesh);
  const cashDrops = CASH_DROPS.map((d, i) => {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71 }),
    );
    mesh.position.set(d.x, 1.2, d.z);
    scene.add(mesh);
    return { ...d, mesh, taken: false, spin: i };
  });

  const world = {
    random,
    scene,
    colliders: city.colliders,
    roadLines: city.roadLines,
    player,
    traffic,
    parked,
    peds,
    guards: [],
    cashDrops,
    homeCar: parked.find((c) => c.mission === 'homeCar'),
    comet: parked.find((c) => c.mission === 'comet'),
    wanted: createWanted(),
    missions: createMissions(),
    money: 0,
    time: 0,
    busted: false,
    gameOver: false,
    healthRegenTimer: 0,
    objectiveTarget: null,
    objectiveText: '',
    camera: null, // set by main.js (three camera, for shooting raycasts)
    audio: null, // set by main.js
    onEvent: null, // (name, detail) => void — HUD toasts, sounds
  };
  world.objectiveTarget = objectiveTarget(world.missions, world);
  world.objectiveText = missionObjectiveText(world.missions);
  world.spawnGuards = () => spawnGuards(world);
  return world;
}

export function spawnGuards(world) {
  const bank = PLACES.bank;
  for (let i = 0; i < 3; i += 1) {
    const mesh = makePedMesh(0x1a1a2e, 0xe0ac69);
    // Guards hold the street outside the bank's south face.
    const x = bank.x + (i - 1) * 6;
    const z = bank.z + 14;
    mesh.group.position.set(x, 0, z);
    world.scene.add(mesh.group);
    // A guard carries a visible rifle (dark box).
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.35, 1.1, 0.3);
    mesh.group.add(gun);
    world.guards.push({
      id: `guard-${i}`, x, z, heading: Math.PI, health: 100,
      mesh: mesh.group, legL: mesh.legL, legR: mesh.legR,
      fireTimer: 1 + i * 0.5, dead: false, fallTimer: 0,
    });
  }
}
export function guardStep(world, guard, dt) {
  const p = world.player;
  if (guard.dead) {
    guard.fallTimer += dt;
    guard.mesh.rotation.x = Math.min(Math.PI / 2, guard.fallTimer * 3);
    if (guard.fallTimer > 8) {
      world.scene.remove(guard.mesh);
      world.guards = world.guards.filter((g) => g !== guard);
    }
    return;
  }
  const dx = p.x - guard.x; const dz = p.z - guard.z;
  const dist = Math.hypot(dx, dz);
  guard.heading = Math.atan2(dx, dz);
  guard.mesh.rotation.y = guard.heading;
  // Guards hold their ground and shoot when the player is close.
  guard.fireTimer -= dt;
  if (dist < 42 && guard.fireTimer <= 0) {
    guard.fireTimer = 0.9 + world.random() * 0.7;
    if (world.random() < 0.55 && !p.inCar) {
      p.health -= 6 + world.random() * 6;
      p.damageFlash = 1;
      if (world.audio) world.audio.hit();
    }
    if (world.onEvent) world.onEvent('guardShot', { x: guard.x, z: guard.z });
  }
  if (p.health <= 0) {
    world.gameOver = true;
  }
}

function carHitsPed(world, car) {
  for (const ped of world.peds) {
    const d = Math.hypot(ped.x - car.x, ped.z - car.z);
    if (d < 2.2 && Math.abs(car.speed) > 3) {
      ped.flee = 5;
      car.speed *= 0.55;
      car.health -= 4;
      addWanted(world.wanted, 1, 'Hit a pedestrian');
      if (world.audio) world.audio.crash();
      if (world.onEvent) world.onEvent('pedHit', {});
    }
  }
}

export function worldStep(world, dt, input) {
  if (world.busted || world.gameOver) return EVENT_NONE;
  let events = EVENT_NONE;
  const p = world.player;
  world.time += dt;

  // --- Camera orbit from mouse drag.
  if (input.camDX) p.camYaw -= input.camDX * 0.005;
  if (input.camDY) p.camPitch = Math.max(0.05, Math.min(0.9, p.camPitch + input.camDY * 0.003));

  // --- Interact (E): enter/exit car, steal, collect, grab cash.
  let enteredCar = false; let stoleCar = false; let collected = false; let grabbedCash = false;
  if (input.interact) {
    if (p.inCar) {
      const car = p.inCar;
      p.inCar = null;
      p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 3;
      p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 3;
      const fixed = resolveCollisions(p.x, p.z, 0.55, world.colliders);
      p.x = fixed.x; p.z = fixed.z;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.visible = true;
      if (world.audio) world.audio.stopEngine();
    } else {
      const stage = currentStage(world.missions);
      const target = world.objectiveTarget;
      // Mission interactions take priority when standing on the marker.
      // The marker is the road approach (11 m), so the door is reachable
      // from outside the building's walls.
      if (stage && (stage.kind === 'collect' || stage.kind === 'grabCash') && target
        && Math.hypot(target.x - p.x, target.z - p.z) < 11) {
        if (stage.kind === 'collect') collected = true;
        if (stage.kind === 'grabCash') grabbedCash = true;
        if (world.audio) world.audio.pickup();
      } else {
        const car = nearestCar(p, [...world.parked, ...world.traffic.filter((c) => Math.abs(c.speed) < 1)], 3.6);
        if (car) {
          p.inCar = car;
          car.parked = false;
          p.mesh.visible = false;
          enteredCar = true;
          if (car.mission === 'comet') stoleCar = true;
          else if (car.mission !== 'homeCar') {
            addWanted(world.wanted, 1, 'Grand theft auto');
            if (world.onEvent) world.onEvent('stole', {});
          }
          if (world.audio) world.audio.startEngine();
        }
      }
    }
  }

  // --- Movement.
  if (p.inCar) {
    const car = p.inCar;
    const beforeHealth = car.health;
    playerDriveStep(p, car, dt, { throttle: input.throttle, steer: input.steer, brake: input.brake },
      world.colliders, [...world.traffic, ...world.parked, ...world.wanted.cops], (c) => carHitsPed(world, c));
    if (car.health < beforeHealth - 0.01) events |= EVENT_CRASH;
    // Auto-align the camera behind the car.
    let diff = car.heading - p.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.camYaw += diff * Math.min(1, dt * 1.1);
    // Cop rams damage the car; a wrecked car strands the player.
    const ram = copRamDamage(world.wanted, car, dt);
    car.health -= ram;
    if (car.health <= 0) {
      car.health = 0;
      car.speed = 0;
      p.inCar = null;
      p.x = car.x + 3; p.z = car.z + 3;
      p.mesh.visible = true;
      setMessage(world.missions, 'Your car is wrecked! Get out and run!', 4);
      if (world.audio) world.audio.crash();
    }
    if (world.audio) world.audio.setEngine(Math.abs(car.speed) / 38, true);
  } else {
    // Camera-relative walk: W = camera forward, D = camera right.
    const sy = Math.sin(p.camYaw); const cy = Math.cos(p.camYaw);
    const up = input.moveY; const right = input.moveX;
    const mx = sy * up + -cy * right;
    const mz = cy * up + sy * right;
    playerWalkStep(p, dt, { x: mx, z: mz }, input.run, world.colliders);
    // Shooting (click / hold to fire the pistol).
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (input.shoot && world.camera) {
      const targets = [];
      for (const g of world.guards) {
        if (!g.dead) targets.push({ x: g.x, z: g.z, y: 1.3, radius: 1.1, ref: { kind: 'guard', guard: g } });
      }
      for (const ped of world.peds) {
        targets.push({ x: ped.x, z: ped.z, y: 1.2, radius: 0.9, ref: { kind: 'ped', ped } });
      }
      for (const car of [...world.traffic, ...world.parked]) {
        targets.push({ x: car.x, z: car.z, y: 1.0, radius: 2.2, ref: { kind: 'car', car } });
      }
      const beforeAmmo = p.magAmmo;
      const hit = playerShoot(p, world.camera, targets);
      if (p.magAmmo < beforeAmmo) {
        // A round actually left the barrel.
        events |= EVENT_SHOT;
        if (world.audio) world.audio.gunshot();
        if (hit) {
          if (hit.kind === 'guard') {
            hit.guard.health -= 34;
            if (hit.guard.health <= 0 && !hit.guard.dead) {
              hit.guard.dead = true;
              world.money += 50;
              if (world.onEvent) world.onEvent('guardDown', {});
            }
          } else if (hit.kind === 'ped') {
            hit.ped.flee = 5;
            addWanted(world.wanted, 1, 'Shot a pedestrian');
          } else if (hit.kind === 'car') {
            hit.car.health -= 10;
          }
        } else {
          addWanted(world.wanted, 1, 'Discharged a firearm');
        }
      }
    }
    if (input.reload && p.reserveAmmo > 0 && p.magAmmo < 12) {
      const need = 12 - p.magAmmo;
      const take = Math.min(need, p.reserveAmmo);
      p.magAmmo += take; p.reserveAmmo -= take;
      if (world.audio) world.audio.click();
    }
  }

  // --- Traffic, pedestrians, guards.
  for (const car of world.traffic) trafficStep(car, dt, world.random, world.roadLines, [...world.traffic, ...world.parked, ...world.wanted.cops], world.colliders);
  const danger = input.shoot || (p.inCar && Math.abs(p.inCar.speed) > 12);
  for (const ped of world.peds) pedStep(ped, dt, world.random, { x: p.x, z: p.z }, danger);
  for (const guard of [...world.guards]) guardStep(world, guard, dt);

  // --- Cash drops.
  for (const drop of world.cashDrops) {
    if (drop.taken) continue;
    drop.mesh.rotation.y += dt * 2;
    drop.mesh.position.y = 1.2 + Math.sin(world.time * 3 + drop.spin) * 0.25;
    if (Math.hypot(drop.x - p.x, drop.z - p.z) < 2.2) {
      drop.taken = true;
      drop.mesh.visible = false;
      world.money += drop.amount;
      if (world.audio) world.audio.cash();
      if (world.onEvent) world.onEvent('cash', { amount: drop.amount });
    }
  }

  // --- Wanted + police.
  const { busted } = wantedStep(world.wanted, dt, world.scene, p, world.random);
  if (busted) {
    world.busted = true;
    events |= EVENT_BUSTED;
    if (world.audio) { world.audio.busted(); world.audio.stopEngine(); }
  }

  // --- Missions.
  const missionEvents = missionsStep(world.missions, world,
    { enteredCar, stoleCar, collected, grabbedCash, position: { x: p.x, z: p.z }, inCar: !!p.inCar },
    (w, stars, reason) => addWanted(w, stars, reason));
  if (missionEvents.includes('missionDone')) {
    events |= EVENT_MISSION_DONE;
    if (world.audio) world.audio.missionDone();
  }
  if (missionEvents.includes('alarm') && world.audio) world.audio.missionStart();
  world.objectiveTarget = objectiveTarget(world.missions, world);
  world.objectiveText = missionObjectiveText(world.missions);

  // --- Health regen out of combat.
  if (p.health > 0 && p.health < 100) {
    world.healthRegenTimer += dt;
    if (world.healthRegenTimer > 5) p.health = Math.min(100, p.health + 4 * dt);
  } else {
    world.healthRegenTimer = 0;
  }
  if (p.damageFlash > 0) p.damageFlash -= dt * 2;
  if (p.health <= 0 && !world.gameOver) world.gameOver = true;

  return events;
}
