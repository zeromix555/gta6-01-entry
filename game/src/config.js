// SOLMAR HEAT — tuning constants and fixed world data.
//
// Everything tunable lives here so the rest of the game reads like rules,
// not magic numbers. Coordinates use a flat XZ plane: +X is east, +Z is
// south, and heading 0 faces +Z (south). Heading Math.PI faces -Z (north),
// which is the direction the home sedan points at spawn.
//
// The city is a 5x5 road grid. Roads sit at multiples of 40 m; the central
// avenue (x = 0) is wider than the side streets. Buildings live inside the
// blocks between roads, never on a road, so a car driving straight down an
// avenue never meets a wall.

export const STEP = 1 / 60;

// ---------------------------------------------------------------------------
// World geometry
// ---------------------------------------------------------------------------
export const WORLD = {
  bound: 105, // soft edge of the drivable city; cars and walkers clamp here
  groundSize: 420, // visual ground plane, larger than the bound
  roadCoords: [-80, -40, 0, 40, 80], // avenues (x) and streets (z)
  roadWidth: 12, // side streets
  avenueWidth: 16, // central avenue x = 0
  laneOffsetStreet: 3, // traffic lane centre from a street centre line
  laneOffsetAvenue: 5, // traffic lane centre from the avenue centre line
  blockMargin: 8, // buildings keep this far inside a block edge
};

// ---------------------------------------------------------------------------
// Player (on foot)
// ---------------------------------------------------------------------------
export const PLAYER = {
  walkSpeed: 5, // m/s, plain walking
  runSpeed: 7.5, // m/s while holding Shift
  turnSpeed: 2.6, // rad/s, A/D turn the body
  radius: 0.6, // collision circle
  maxHealth: 100,
  interactRange: 5.5, // metres: car entry, package pickup
  hurtCooldown: 0.6, // seconds between damage ticks
};

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------
export const CAR = {
  accel: 14, // m/s^2 at full throttle
  brake: 26, // m/s^2 braking / reversing against motion
  reverseAccel: 8, // m/s^2 when reversing from a standstill
  maxSpeed: 30, // m/s forward (~108 km/h, arcade)
  maxReverse: 10, // m/s backwards
  sportMaxSpeed: 38, // the Falco GT is meaningfully faster
  turnRate: 1.9, // rad/s at full lock and low speed
  drag: 0.35, // per-second speed decay while coasting
  radius: 2.1, // collision circle for car-vs-car and car-vs-wall
};

// ---------------------------------------------------------------------------
// Traffic and pedestrians
// ---------------------------------------------------------------------------
export const TRAFFIC = {
  count: 10,
  minSpeed: 7,
  maxSpeed: 12,
  turnChance: 0.008, // per step, while inside an intersection
  avoidDistance: 12, // slow down for a stopped car this far ahead
};

export const PEDS = {
  count: 14,
  walkSpeed: 1.4,
  fleeSpeed: 5.5,
  fleeRadius: 25, // a gunshot this close makes nearby peds run
};

// ---------------------------------------------------------------------------
// Combat and the wanted system
// ---------------------------------------------------------------------------
export const COMBAT = {
  magSize: 12, // pistol magazine
  reserveMax: 120, // spare rounds
  startReserve: 96,
  fireInterval: 0.1, // seconds between shots (10 shots/s)
  shotRange: 40, // metres a shot can hit a guard
  shotHalfAngle: 0.35, // radians off aim a guard may be and still be hit
  shotWanted: 1, // stars added per shot fired
  maxWanted: 5,
  stealWanted: 1, // stars added for stealing a car that is not yours
  copTopSpeed: 17, // police cruisers are faster than traffic, slower than you
  copRamDamage: 4, // health lost when a cruiser rams your car
  copBustRange: 3, // metres: a cruiser this close to you on foot starts a bust
  copBustTime: 1.2, // seconds inside bust range before you are busted
  guardHealth: 3, // pistol hits a bank guard can take
  guardDamage: 6, // health a guard shot costs you
  guardRange: 22, // metres at which guards open fire
  guardFireInterval: 1.1, // seconds between guard shots
  wantedDecaySeconds: 25, // one star fades after this long with no crime
};

// ---------------------------------------------------------------------------
// Money, missions and save data
// ---------------------------------------------------------------------------
export const ECONOMY = {
  startMoney: 250,
  bustedLoss: 0.1, // busted: lose 10% of your cash
  cleanBonus: 100, // finishing a job with zero wanted stars pays a bonus
};

// ---------------------------------------------------------------------------
// Chase camera and the car horn
// ---------------------------------------------------------------------------
export const CAMERA = {
  chaseDistCar: 11, // metres behind the car
  chaseHeightCar: 4.6,
  chaseDistFoot: 7.5, // metres behind the player on foot
  chaseHeightFoot: 3.4,
  lookAhead: 4, // metres in front of the player the camera aims at
};

export const HORN = {
  range: 18, // metres: traffic inside this hears the horn
  slowSpeed: 4, // m/s: startled traffic slows to this
  duration: 1.2, // seconds the startle lasts
};

export const SAVE_KEY = 'solmar-heat-save-v1';
export const BEST_KEY = 'solmar-heat-best';

// Fixed places. Every objective sits ON a road so it is drivable, and every
// landmark building sits inside a block facing its road.
export const PLACES = {
  spawn: { x: 2, z: 0, heading: Math.PI },
  homeCar: { x: 2.5, z: 4, heading: Math.PI },
  sportsCar: { x: -7.2, z: -60, heading: Math.PI },
  diner: { x: 44, z: -56 }, // mission 0 objective: the approach point
  dinerBuilding: { x: 58, z: -56 },
  hospital: { x: -44, z: 56 }, // busted respawn point
  hospitalBuilding: { x: -58, z: 56 },
  bank: { x: -44, z: -56 }, // mission 2 objective
  bankBuilding: { x: -58, z: -56 },
  harbor: { x: 80, z: 76 }, // mission 1 objective
};

// The three-mission story. Stage 1 is "drive to the objective", stage 2 is
// "collect the package" (arriving within 10 m promotes the stage), stage 3
// is "mission complete" (interact at the objective collects it).
export const MISSIONS = [
  {
    name: 'The Marisol Pickup',
    brief: 'Drive to the Marisol Diner and collect the package.',
    objective: { x: 44, z: -56 },
    reward: 500,
  },
  {
    name: 'Harbor Handoff',
    brief: 'Take the package to the old harbor crane at the east docks.',
    objective: { x: 80, z: 76 },
    reward: 1500,
  },
  {
    name: 'The Solmar Bank Job',
    brief: 'Hit the Solmar National Bank. Guards are armed. Grab the vault cash.',
    objective: { x: -44, z: -56 },
    reward: 5000,
  },
];

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------
export const COLORS = {
  sky: 0x87b5d6,
  fog: 0x9db8c8,
  ground: 0x3d4a3a,
  sidewalk: 0x8a8d90,
  road: 0x2c2f33,
  roadLine: 0xd8c95a,
  buildingPalette: [0x7d8aa0, 0x9a8a7a, 0x6a7d8a, 0xa08a6a, 0x8a7d9a, 0x5f7080],
  homeCar: 0x3a7bd5,
  sportsCar: 0xc0392b,
  trafficPalette: [0xd8d8d8, 0x303030, 0x2e6b34, 0xb0a030, 0x703090, 0x808890],
  copCar: 0x1a1a2e,
  copLightRed: 0xff2020,
  copLightBlue: 0x2080ff,
  playerJacket: 0x2e8b57,
  gold: 0xffc93c,
  cash: 0x37c978,
};

export const HUD = {
  minimapSize: 180, // px, square canvas in the corner
  minimapRange: 110, // metres of city shown across the minimap
};
