// SOLMAR HEAT v3
// Wanted system + police. Stars rise for crimes; police cars spawn at the
// map edge and chase the player, ramming on foot or in a car. Lose them and
// the heat cools off one star at a time. Get caught and you are BUSTED.
import { WANTED, CITY_HALF } from './config.js';
import { createCar } from './vehicles.js';
import { resolveCollisions } from './city.js';

export function createWanted() {
  return {
    stars: 0,
    heat: 0, // 0..1 progress toward the next star from repeated crimes
    calmTimer: 0,
    bustTimer: 0,
    cops: [],
    copId: 0,
  };
}

export function addWanted(wanted, stars, reason) {
  const before = wanted.stars;
  wanted.stars = Math.min(WANTED.maxStars, wanted.stars + stars);
  wanted.calmTimer = 0;
  return { raised: wanted.stars > before, reason };
}

export function spawnCop(wanted, scene, x, z) {
  const car = createCar(`cop-${wanted.copId}`, x, z, 0, 0xf5f5f5, { police: true });
  wanted.copId += 1;
  car.speed = 0;
  scene.add(car.mesh);
  wanted.cops.push(car);
  return car;
}

function nearestCopDistance(wanted, px, pz) {
  let best = Infinity;
  for (const cop of wanted.cops) best = Math.min(best, Math.hypot(cop.x - px, cop.z - pz));
  return best;
}

// Keep the number of active cops proportional to the wanted level.
export function wantedStep(wanted, dt, scene, player, random) {
  const px = player.x; const pz = player.z;
  const wantCops = wanted.stars === 0 ? 0 : Math.min(WANTED.maxStars, 1 + wanted.stars);
  while (wanted.cops.length < wantCops) {
    const edge = Math.floor(random() * 4);
    let x; let z;
    if (edge === 0) { x = px + 90; z = pz + (random() - 0.5) * 120; }
    else if (edge === 1) { x = px - 90; z = pz + (random() - 0.5) * 120; }
    else if (edge === 2) { x = px + (random() - 0.5) * 120; z = pz + 90; }
    else { x = px + (random() - 0.5) * 120; z = pz - 90; }
    x = Math.max(-CITY_HALF, Math.min(CITY_HALF, x));
    z = Math.max(-CITY_HALF, Math.min(CITY_HALF, z));
    spawnCop(wanted, scene, x, z);
  }
  while (wanted.cops.length > wantCops) {
    const cop = wanted.cops.pop();
    scene.remove(cop.mesh);
  }

  // Chase: steer toward the player, ram on contact.
  for (const cop of wanted.cops) {
    const dx = px - cop.x; const dz = pz - cop.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = desired - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const targetSpeed = Math.min(26 + wanted.stars * 2, dist < 8 ? 18 : 30);
    cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.5);
    cop.heading += Math.max(-1.9 * dt, Math.min(1.9 * dt, diff * 2.4 * dt * 3));
    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    const spin = cop.speed * dt * 2.6;
    for (const w of cop.wheels) w.rotation.x += spin;
    // Flashing light bar.
    if (cop.lightBar) {
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      cop.lightBar.red.material.emissive.setHex(phase ? 0xff0000 : 0x330000);
      cop.lightBar.blue.material.emissive.setHex(phase ? 0x000033 : 0x0000ff);
    }
  }

  // Heat cools when no cop is near.
  const near = nearestCopDistance(wanted, px, pz);
  if (wanted.stars > 0 && near > 55) {
    wanted.calmTimer += dt;
    if (wanted.calmTimer > WANTED.decayDelay) {
      wanted.stars -= 1;
      wanted.calmTimer = 0;
    }
  } else {
    wanted.calmTimer = 0;
  }

  // Busted: a cop sits on the player on foot.
  let busted = false;
  if (!player.inCar && wanted.stars > 0 && near < WANTED.bustDistance) {
    wanted.bustTimer += dt;
    if (wanted.bustTimer > WANTED.bustTime) busted = true;
  } else {
    wanted.bustTimer = 0;
  }
  return { busted, nearestCop: near };
}

// A police ram / hard hit on the player's car.
export function copRamDamage(wanted, playerCar, dt) {
  if (!playerCar) return 0;
  let damage = 0;
  for (const cop of wanted.cops) {
    const d = Math.hypot(cop.x - playerCar.x, cop.z - playerCar.z);
    if (d < 3.2 && Math.abs(cop.speed) > 8) damage += 14 * dt;
  }
  return damage;
}
