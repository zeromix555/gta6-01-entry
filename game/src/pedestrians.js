// SOLMAR HEAT v3
// Pedestrians — sidewalk walkers who stroll the blocks, cross at corners,
// and flee when the player speeds at them or fires a shot.
import { ROAD_HALF, BLOCK, GRID, CITY_HALF } from './config.js';
import { pick, range } from './random.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

export function makePedMesh(shirt, skin) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 0.95; body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.6; head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), legMat);
  legL.position.set(-0.14, 0.28, 0); group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), legMat);
  legR.position.set(0.14, 0.28, 0); group.add(legR);
  return { group, legL, legR };
}

export function spawnPedestrians(random, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = makePedMesh(pick(random, SHIRTS), pick(random, SKINS));
    const x = range(random, -CITY_HALF, CITY_HALF);
    const z = range(random, -CITY_HALF, CITY_HALF);
    mesh.group.position.set(x, 0, z);
    peds.push({
      id: `ped-${i}`, x, z,
      heading: range(random, 0, Math.PI * 2),
      speed: range(random, 1.0, 1.8),
      mesh: mesh.group, legL: mesh.legL, legR: mesh.legR,
      flee: 0, target: null, walkPhase: random() * 6,
    });
  }
  return peds;
}

export function pedStep(ped, dt, random, playerPos, danger) {
  // Flee from danger (a speeding car or a gunshot near the player).
  if (danger) {
    const d = Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z);
    if (d < 14) ped.flee = 2.5;
  }
  if (ped.flee > 0) {
    ped.flee -= dt;
    const away = Math.atan2(ped.x - playerPos.x, ped.z - playerPos.z);
    ped.heading = away;
    ped.speed = 4.2;
  } else {
    ped.speed = 1.4;
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 3) {
      // New stroll target: a nearby sidewalk corner.
      const rx = Math.round(ped.x / BLOCK) * BLOCK + (random() < 0.5 ? ROAD_HALF + 2 : -ROAD_HALF - 2);
      const rz = Math.round(ped.z / BLOCK) * BLOCK + (random() < 0.5 ? ROAD_HALF + 2 : -ROAD_HALF - 2);
      ped.target = { x: Math.max(-CITY_HALF, Math.min(CITY_HALF, rx)), z: Math.max(-CITY_HALF, Math.min(CITY_HALF, rz)) };
    }
    const desired = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
    let diff = desired - ped.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.heading += Math.max(-2.5 * dt, Math.min(2.5 * dt, diff));
  }
  ped.x += Math.sin(ped.heading) * ped.speed * dt;
  ped.z += Math.cos(ped.heading) * ped.speed * dt;
  ped.x = Math.max(-CITY_HALF - 8, Math.min(CITY_HALF + 8, ped.x));
  ped.z = Math.max(-CITY_HALF - 8, Math.min(CITY_HALF + 8, ped.z));
  ped.walkPhase += dt * ped.speed * 3;
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.heading;
  ped.legL.rotation.x = Math.sin(ped.walkPhase) * 0.5;
  ped.legR.rotation.x = -Math.sin(ped.walkPhase) * 0.5;
}
