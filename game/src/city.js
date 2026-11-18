// Solmar City — builds the 3D city: ground, road grid, buildings with lit
// windows, palms, beach and sea, street props. Also owns the collision boxes
// (axis-aligned) and the road graph traffic drives on.
import { BLOCK, ROAD_HALF, GRID, CITY_HALF, BEACH_X, PLACES } from './config.js';
import { pick, range } from './random.js';

const ROAD_LINES = [];
for (let i = -GRID; i <= GRID; i += 1) ROAD_LINES.push(i * BLOCK);

function makeWindowTexture(random, baseColor, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor; g.fillRect(0, 0, 64, 128);
  const cols = 4; const rows = 9;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = random() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : (random() < 0.5 ? '#1d2b3a' : '#2c3e50');
      g.fillRect(4 + c * 15, 5 + r * 13, 10, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#33363b'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2b2e33';
  for (let i = 0; i < 200; i += 1) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.fillStyle = '#e8c33a'; g.fillRect(62, 8, 4, 34); g.fillRect(62, 86, 4, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e8d5a3'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#dcc78f';
  for (let i = 0; i < 120; i += 1) g.fillRect(Math.random() * 64, Math.random() * 64, 2, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BUILDING_COLORS = ['#e8dcc8', '#d9c2a3', '#c9b8a8', '#b8c4cc', '#e0b48f', '#a8b8a0', '#d8a0a0', '#9fb8c8', '#e6d3b3'];

export function buildCity(scene, random) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const group = new THREE.Group();
  group.name = 'SolmarCity';

  // Sun-soaked sky, warm sun, soft ambient.
  scene.background = new THREE.Color(0x87b5d9);
  scene.fog = new THREE.Fog(0x9fc3dd, 260, 620);
  const sun = new THREE.DirectionalLight(0xffe7b8, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -230; sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230; sun.shadow.camera.bottom = -230;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9));

  // Ground: grass-green base under the whole map.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x7da05c }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(60, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Beach sand + sea to the east.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 560),
    new THREE.MeshLambertMaterial({ map: makeSandTexture() }),
  );
  sand.material.map.repeat.set(8, 30);
  sand.rotation.x = -Math.PI / 2; sand.position.set(BEACH_X + 55, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 900),
    new THREE.MeshPhongMaterial({ color: 0x1e7fa8, shininess: 120, specular: 0x99ccff }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(BEACH_X + 190, 0.0, 0);
  group.add(sea);

  // Road strips (asphalt) with dashed centre lines, both directions.
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const line of ROAD_LINES) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 14, ROAD_HALF * 2), roadMat.clone());
      road.material.map = roadTex.clone();
      road.material.map.needsUpdate = true;
      road.material.map.repeat.set((CITY_HALF * 2 + 14) / 16, 1);
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.position.set(0, 0.05, line); }
      else { road.rotation.z = Math.PI / 2; road.position.set(line, 0.05, 0); }
      road.receiveShadow = true;
      group.add(road);
    }
  }
  // Sidewalks: lighter strips along every road.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  for (const line of ROAD_LINES) {
    for (const horizontal of [true, false]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 14, 3), walkMat);
      walk.rotation.x = -Math.PI / 2;
      if (horizontal) { walk.position.set(0, 0.04, line + ROAD_HALF + 1.5); walk.scale.set(1, 1, 1); }
      else { walk.rotation.z = Math.PI / 2; walk.position.set(line + ROAD_HALF + 1.5, 0.04, 0); }
      walk.receiveShadow = true;
      group.add(walk);
    }
  }

  // Buildings: one or four per block, varied heights and warm colours.
  // Blocks holding a landmark (bank, diner, showroom, chop shop) or the docks
  // stay open — the landmark stands there instead, clear of the crossroads.
  const landmarkBlocks = [PLACES.bank, PLACES.diner, PLACES.showroom, PLACES.chopShop].map((lm) => ({
    x: Math.round((lm.x - BLOCK / 2) / BLOCK) * BLOCK + BLOCK / 2,
    z: Math.round((lm.z - BLOCK / 2) / BLOCK) * BLOCK + BLOCK / 2,
  }));
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5148 });
  for (let bx = -GRID; bx < GRID; bx += 1) {
    for (let bz = -GRID; bz < GRID; bz += 1) {
      const cx = bx * BLOCK + BLOCK / 2;
      const cz = bz * BLOCK + BLOCK / 2;
      const isDocks = Math.abs(cx - 174) < 30 && Math.abs(cz - 174) < 30;
      const isLandmark = landmarkBlocks.some((lb) => Math.abs(cx - lb.x) < 30 && Math.abs(cz - lb.z) < 30);
      if (isDocks || isLandmark) continue;
      const tall = random() < 0.3;
      const parts = tall ? 1 : 4;
      for (let p = 0; p < parts; p += 1) {
        const w = tall ? range(random, 26, 34) : range(random, 12, 15);
        const d = tall ? range(random, 26, 34) : range(random, 12, 15);
        const h = tall ? range(random, 34, 62) : range(random, 9, 22);
        const ox = parts === 1 ? 0 : (p % 2 === 0 ? -9 : 9);
        const oz = parts === 1 ? 0 : (p < 2 ? -9 : 9);
        const x = cx + ox; const z = cz + oz;
        const color = pick(random, BUILDING_COLORS);
        const mat = new THREE.MeshLambertMaterial({ map: makeWindowTexture(random, color, 0.25) });
        const building = new THREE.Mesh(buildingGeo, mat);
        building.scale.set(w, h, d);
        building.position.set(x, h / 2, z);
        building.castShadow = true; building.receiveShadow = true;
        group.add(building);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.6, d * 0.96), roofMat);
        roof.position.set(x, h + 0.3, z);
        group.add(roof);
        if (random() < 0.5) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), roofMat);
          ac.position.set(x + w * 0.2, h + 1.2, z - d * 0.2);
          group.add(ac);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // Landmark meshes: bank (marble block + columns), diner (low block + sign),
  // showroom (glass box), chop shop (warehouse), docks (containers + crane-ish).
  function landmark(x, z, w, h, d, color, name) {
    const mesh = new THREE.Mesh(buildingGeo, new THREE.MeshLambertMaterial({ map: makeWindowTexture(random, '#ffffff', 0.18) }));
    mesh.material.color.setHex(color);
    mesh.scale.set(w, h, d); mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name;
    group.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return mesh;
  }
  landmark(PLACES.bank.x, PLACES.bank.z, 30, 16, 22, 0xe8e2d0, 'SolmarTrustBank');
  landmark(PLACES.diner.x, PLACES.diner.z, 20, 8, 14, 0xd96a4a, 'MaribelsDiner');
  landmark(PLACES.showroom.x, PLACES.showroom.z, 30, 10, 20, 0x7fb3d5, 'SolmarMotors');
  landmark(PLACES.chopShop.x, PLACES.chopShop.z, 26, 11, 20, 0x8a7a5a, 'RicosChopShop');
  // Docks containers.
  for (let i = 0; i < 5; i += 1) {
    const c = new THREE.Mesh(buildingGeo, new THREE.MeshLambertMaterial({ color: pick(random, [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22]) }));
    c.scale.set(10, 3, 3); c.position.set(150 + i * 2, 1.5, 150 + (i % 2) * 12);
    c.castShadow = true; group.add(c);
    colliders.push({ minX: c.position.x - 5, maxX: c.position.x + 5, minZ: c.position.z - 1.5, maxZ: c.position.z + 1.5 });
  }

  // Palm trees along the beach avenue and main roads.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
  function palm(x, z) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3, z); trunk.castShadow = true; group.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(x, 7.2, z); leaves.castShadow = true; group.add(leaves);
  }
  for (let z = -174; z <= 174; z += 29) { palm(BEACH_X - 8, z); palm(-CITY_HALF + 10, z); }
  for (let i = 0; i < 40; i += 1) {
    palm(range(random, -CITY_HALF, CITY_HALF), pick(random, ROAD_LINES) + ROAD_HALF + 3.5);
  }

  // Street lights at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      if (random() < 0.5) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), poleMat);
      pole.position.set(x + ROAD_HALF + 1, 3.5, z + ROAD_HALF + 1);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x664411 }));
      lamp.position.set(x + ROAD_HALF + 1, 7.1, z + ROAD_HALF + 1);
      group.add(lamp);
    }
  }

  scene.add(group);
  return { group, colliders, roadLines: ROAD_LINES };
}

// Circle (x,z,r) vs building AABBs: push the circle out. Returns corrected x,z.
export function resolveCollisions(x, z, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx; const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pushL = x - c.minX + radius; const pushR = c.maxX - x + radius;
        const pushT = z - c.minZ + radius; const pushB = c.maxZ - z + radius;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) x = c.minX - radius;
        else if (m === pushR) x = c.maxX + radius;
        else if (m === pushT) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  // Keep inside the playable map (sea edge is a wall of water).
  x = Math.max(-CITY_HALF - 10, Math.min(BEACH_X - 4, x));
  z = Math.max(-CITY_HALF - 10, Math.min(CITY_HALF + 10, z));
  return { x, z };
}

export function nearestRoadPoint(x, z, roadLines) {
  let best = null; let bestD = Infinity;
  for (const line of roadLines) {
    const d1 = Math.abs(z - line); if (d1 < bestD) { bestD = d1; best = { x, z: line, along: 'x' }; }
    const d2 = Math.abs(x - line); if (d2 < bestD) { bestD = d2; best = { x: line, z, along: 'z' }; }
  }
  return best;
}
