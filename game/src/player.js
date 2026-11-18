// SOLMAR HEAT v2
// The player — Dario Cruz. On foot (WASD + mouse orbit, Shift to run,
// click to fire the pistol) and behind the wheel (W/S throttle, A/D steer,
// Space handbrake, E to get in/out and to steal).
import { PLAYER, CAR } from './config.js';
import { resolveCollisions } from './city.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1e7a5a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36), jacket);
  body.position.y = 1.05; body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.68; head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 12),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  cap.position.y = 1.88; group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), jeans);
  legL.position.set(-0.16, 0.32, 0); group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), jeans);
  legR.position.set(0.16, 0.32, 0); group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), jacket);
  armL.position.set(-0.42, 1.05, 0); group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), jacket);
  armR.position.set(0.42, 1.05, 0); group.add(armR);
  return { group, legL, legR, armL, armR, body };
}

export function createPlayer(scene, x, z) {
  const mesh = makePlayerMesh();
  mesh.group.position.set(x, 0, z);
  scene.add(mesh.group);
  return {
    x, z, heading: 0,
    camYaw: Math.PI * 0.15, camPitch: 0.32,
    speed: 0,
    inCar: null,
    health: PLAYER.healthMax,
    magAmmo: PLAYER.pistolMag,
    reserveAmmo: 60,
    fireCooldown: 0,
    walkPhase: 0,
    mesh: mesh.group,
    legL: mesh.legL, legR: mesh.legR,
    armL: mesh.armL, armR: mesh.armR,
    damageFlash: 0,
  };
}

// Move on foot. `move` is {x, z} in camera space (-1..1). Returns distance moved.
export function playerWalkStep(player, dt, move, running, colliders) {
  const len = Math.hypot(move.x, move.z);
  let mx = 0; let mz = 0;
  if (len > 0.01) { mx = move.x / len; mz = move.z / len; }
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const targetHeading = len > 0.01 ? Math.atan2(mx, mz) : player.heading;
  let diff = targetHeading - player.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  player.heading += Math.max(-10 * dt, Math.min(10 * dt, diff));
  const vx = mx * speed * (len > 0.01 ? 1 : 0);
  const vz = mz * speed * (len > 0.01 ? 1 : 0);
  const fixed = resolveCollisions(player.x + vx * dt, player.z + vz * dt, PLAYER.radius, colliders);
  player.x = fixed.x; player.z = fixed.z;
  player.speed = Math.hypot(vx, vz);
  player.walkPhase += dt * player.speed * 1.6;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
  player.legL.rotation.x = Math.sin(player.walkPhase) * 0.7;
  player.legR.rotation.x = -Math.sin(player.walkPhase) * 0.7;
  player.armL.rotation.x = -Math.sin(player.walkPhase) * 0.5;
  player.armR.rotation.x = Math.sin(player.walkPhase) * 0.5;
}

// Arcade driving. `drive` is {throttle -1..1, steer -1..1, brake bool}.
export function playerDriveStep(player, car, dt, drive, colliders, others, onHitPed) {
  const forward = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
  if (drive.throttle > 0) {
    car.speed += CAR.accel * drive.throttle * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt; // brake while rolling forward
    else car.speed -= CAR.reverseAccel * dt; // reverse
  }
  if (drive.brake) car.speed -= Math.sign(car.speed) * CAR.brake * dt * 0.8;
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.35 * dt;
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.05 && drive.throttle === 0) car.speed = 0;
  const steerAmount = drive.steer * CAR.steerMax * (car.speed >= 0 ? 1 : -1);
  // Steer right (D) decreases heading: forward (sin h, cos h) rotates toward
  // camera-right (-cos h, sin h) as the heading falls.
  car.heading -= (steerAmount * car.speed * 0.09) * dt * 3.2;
  let nx = car.x + Math.sin(car.heading) * car.speed * dt;
  let nz = car.z + Math.cos(car.heading) * car.speed * dt;
  // Bounce off buildings.
  const before = { x: car.x, z: car.z };
  const fixed = resolveCollisions(nx, nz, 1.7, colliders);
  if (Math.hypot(fixed.x - nx, fixed.z - nz) > 0.01) {
    car.speed *= 0.45;
    car.health -= 2;
  }
  nx = fixed.x; nz = fixed.z;
  // Soft collision with other cars.
  for (const other of others) {
    if (other === car) continue;
    const dx = nx - other.x; const dz = nz - other.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      nx += (dx / d) * push; nz += (dz / d) * push;
      car.speed *= 0.7;
      if (Math.abs(car.speed) > 6) car.health -= 3;
    }
  }
  car.x = nx; car.z = nz;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.6;
  for (const w of car.wheels) w.rotation.x += spin;
  player.x = car.x; player.z = car.z;
  player.heading = car.heading;
  if (onHitPed) onHitPed(car);
  return car;
}

// Fire the pistol from the camera through the screen centre.
// `targets` are {x, z, y, radius, ref} hit spheres. Returns the hit ref or null.
export function playerShoot(player, camera, targets) {
  if (player.fireCooldown > 0 || player.magAmmo <= 0) return null;
  player.fireCooldown = PLAYER.fireInterval;
  player.magAmmo -= 1;
  const origin = new THREE.Vector3(player.x, 1.5, player.z);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let best = null; let bestT = PLAYER.pistolRange;
  for (const t of targets) {
    const to = new THREE.Vector3(t.x - origin.x, (t.y || 1.2) - origin.y, t.z - origin.z);
    const proj = to.dot(dir);
    if (proj < 0 || proj > bestT) continue;
    const closest = origin.clone().addScaledVector(dir, proj);
    const d = Math.hypot(closest.x - t.x, closest.y - (t.y || 1.2), closest.z - t.z);
    if (d < (t.radius || 1.0)) { best = t.ref; bestT = proj; }
  }
  return best;
}

export function nearestCar(player, cars, maxDist) {
  let best = null; let bestD = maxDist;
  for (const car of cars) {
    if (car.police) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
