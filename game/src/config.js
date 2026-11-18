// SOLMAR HEAT v3
// SOLMAR HEAT — configuration and world data.
// Original sun-soaked coastal city "Solmar City", original characters and story.
// Nothing here comes from any commercial game.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-heat-save-v1';
export const BEST_KEY = 'solmar-heat-best-v1';

// City grid: roads run at multiples of BLOCK, blocks sit between them.
export const BLOCK = 58;
export const ROAD_HALF = 7;
export const GRID = 3; // road indices -3..3, city spans about +/-203 m
export const CITY_HALF = GRID * BLOCK + ROAD_HALF; // 181
export const BEACH_X = 205; // sand + sea east of the city

export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 8.4,
  radius: 0.55,
  healthMax: 100,
  pistolMag: 12,
  pistolDamage: 34,
  pistolRange: 55,
  fireInterval: 0.22,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 38,
  maxReverse: 10,
  steerMax: 0.55,
  grip: 6.5,
  healthMax: 100,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 7, // seconds with no cop near before a star drops
  bustDistance: 2.4,
  bustTime: 1.6,
  copChaseRange: 120,
};

// Traffic / crowd counts (kept modest so headless SwiftShader stays smooth).
export const TRAFFIC_CARS = 14;
export const PEDESTRIANS = 22;
export const MAX_COPS = 6;

// Named places in Solmar City (all invented). Each place with a building has
// an `approach` point on the nearest road — that is where missions point,
// so a car can always drive up to it and a player on foot can reach its door.
export const PLACES = {
  diner: { x: -40, z: -100, approach: { x: -54.5, z: -100 }, name: "Maribel's Diner" },
  docks: { x: 174, z: 174, approach: { x: 174, z: 174 }, name: 'Solmar Docks' },
  showroom: { x: 145, z: -29, approach: { x: 120, z: -29 }, name: 'Solmar Motors' },
  chopShop: { x: -145, z: 145, approach: { x: -170, z: 145 }, name: "Rico's Chop Shop" },
  bank: { x: 29, z: 87, approach: { x: 4, z: 87 }, name: 'Solmar Trust Bank' },
  hideout: { x: -116, z: 174, approach: { x: -116, z: 174 }, name: 'Hideout — Pier 9' },
  hospital: { x: 58, z: 174, approach: { x: 58, z: 174 }, name: 'Solmar General' },
  home: { x: -29, z: -29, name: "Dario's Apartment" },
};

// Mission definitions: each stage has a kind, a target and HUD text.
export const MISSIONS = [
  {
    id: 'm1',
    title: 'MISSION 1 — FIRST FARE',
    brief:
      "Dario owes Maribel $500. She has a package job: pick it up at her diner and run it to the docks. Your sedan is parked outside your apartment.",
    reward: 500,
    stages: [
      { kind: 'enterCar', target: 'homeCar', text: 'Get in your sedan (E)' },
      { kind: 'reach', target: 'diner', radius: 10, text: "Drive to Maribel's Diner" },
      { kind: 'collect', target: 'diner', radius: 6, text: 'Pick up the package — walk to the door (E)' },
      { kind: 'reach', target: 'docks', radius: 11, text: 'Deliver the package to the Solmar Docks' },
    ],
  },
  {
    id: 'm2',
    title: 'MISSION 2 — HOT WHEELS',
    brief:
      "A buyer at Rico's Chop Shop wants the Comet GT from Solmar Motors — tonight. Steal it, lose the cops, bring it in. Stealing in front of the law draws heat.",
    reward: 1200,
    stages: [
      { kind: 'reach', target: 'showroom', radius: 12, text: 'Go to Solmar Motors showroom' },
      { kind: 'stealCar', target: 'comet', text: 'Steal the Comet GT (E)' },
      { kind: 'loseCops', text: 'Lose the cops — get your wanted level to zero' },
      { kind: 'reach', target: 'chopShop', radius: 11, text: "Deliver the Comet GT to Rico's Chop Shop" },
    ],
  },
  {
    id: 'm3',
    title: 'MISSION 3 — THE GETAWAY',
    brief:
      "The big one: Solmar Trust Bank. Grab the cash, fight your way out past the guards, and outrun a four-star response to the Pier 9 hideout. Good luck, Dario.",
    reward: 3000,
    stages: [
      { kind: 'reach', target: 'bank', radius: 12, text: 'Go to Solmar Trust Bank' },
      { kind: 'grabCash', target: 'bank', radius: 6, text: 'Grab the cash (E) — expect trouble' },
      { kind: 'escape', target: 'hideout', radius: 12, text: 'Escape to the Pier 9 hideout — wanted level 4!' },
    ],
  },
];

// Cash pickups scattered around the city (free-roam side activity).
export const CASH_DROPS = [
  { x: -145, z: -145, amount: 100 },
  { x: 145, z: -145, amount: 100 },
  { x: -145, z: 29, amount: 150 },
  { x: 87, z: 145, amount: 150 },
  { x: 29, z: -174, amount: 100 },
  { x: -87, z: 87, amount: 200 },
];

// Car paint palette (hex numbers).
export const PAINTS = [
  0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x2c3e50,
  0x16a085, 0xd35400, 0x7f8c8d, 0xb03a2e,
];
