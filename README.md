# SOLMAR HEAT

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeromix555/gta6-01-entry/rank.svg)](https://make.fun/competitions/gta6-01)
[![reward](https://make.fun/badge/gta6-01/zeromix555/gta6-01-entry/reward.svg)](https://make.fun/competitions/gta6-01)

An original open-world crime game set in the fictional city of **Solmar**.
You are a driver for hire with a fast car, a pistol, and three jobs to pull
before the heat catches you. No real places, people, cars or stories — the
city, the characters and the missions are all invented for this game.

## The game

- **A city to explore** — a seeded 5×5 road grid of avenues, streets,
  towers, shops and houses, fully determined by `?seed=`. Same seed, same
  Solmar.
- **On foot and by car** — walk the sidewalks or steal anything with four
  wheels. Your own blue Vireo sedan waits by the spawn; a red Falco GT is
  parked on the central avenue, if you are willing to pay the heat for it.
- **Traffic and pedestrians** — cars cruise the roads and turn at
  intersections; pedestrians amble the sidewalks and run from gunfire.
- **A wanted level** — shoot or steal and the stars climb to five. Police
  cruisers spawn to match, chase you across the city, ram your car, and
  bust you on foot. Lay low and the stars fade one at a time.
- **Three missions, one story** — the Marisol diner pickup, the harbor
  handoff, and the Solmar bank job, where four armed guards wait outside
  the vault. Finish all three and the city is yours.
- **Combat** — a pistol with a 12-round magazine, reloads, and guards who
  shoot back. Cash envelopes on the street are worth picking up.
- **HUD and minimap** — health, ammo, cash, wanted stars, mission text,
  and a live 180×180 minimap with the gold objective marker.
- **Sound, synthesized** — engine hum, gunshots, sirens and jingles, all
  made with WebAudio. No audio files. `M` mutes.
- **Save and continue** — money and mission progress save to localStorage;
  the title screen offers Continue when a save exists. Getting busted
  costs 10% of your cash and wakes you up at Solmar General hospital.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. No build step, no
network requests — every script is a file under `game/`.

## Controls

| Key | Action |
| --- | --- |
| W / A / S / D or arrows | Walk / drive (A/D steer and turn) |
| Shift | Run on foot |
| E | Enter or exit a car, collect a package |
| Mouse (hold) | Shoot |
| R | Reload |
| H | Horn (startles nearby traffic) |
| P or Esc | Pause |
| M | Mute |
| Enter | Start from the title screen |

## Tips

- **Clean getaways pay.** Finish a job with zero wanted stars and the crew
  adds a $100 bonus on top of the reward.
- **The horn is a tool, not a toy.** A blast slows the traffic around you
  for a second — enough to thread a gap or shake a tail at an intersection.
- **Lay low to cool off.** One star fades after 25 quiet seconds with no
  cruiser nearby; at four stars the police start throwing roadblocks ahead
  of you, not just behind.
- **Health comes back.** Ten seconds without taking damage and you start
  recovering — so break line of sight from the bank guards before the next
  push.
- **Pedestrians jump clear** of a speeding car, and traffic stops for you
  on foot — but only if it sees you in time. Cross at the crossroads.

Mouse drag orbits the chase camera; it drifts back behind you when you
let go.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game,
staged by `game/src/shots.js` with `?shot=<name>&seed=7`:

| File | Scene |
| --- | --- |
| `1-chase.jpg` | The Falco GT flat out down the avenue, three stars, cruisers behind |
| `2-street.jpg` | On foot downtown at the crossroads, mission 0 live |
| `3-mission.jpg` | The bank job: guards out, four stars, cruisers closing in |
| `4-start.jpg` | The title screen over a living city |

## Headless self-test

```sh
node serve.ts --port 8093
# then open http://localhost:8093/?selftest=1&seed=7
```

The page runs a scripted session (walk, enter the sedan, drive, shoot,
reach the diner objective, collect the package) and reports
`SELFTEST PASS` or `SELFTEST FAIL` in `#status`, `window.__selftest`
and the document title.

## Layout

```
game/
  index.html          the page: canvas, HUD, menu overlays
  vendor/three.min.js vendored Three.js (untouched)
  src/
    main.js           boot, game loop, screens, self-test
    world.js          world state and the fixed-step simulation
    config.js         tuning constants and fixed places
    random.js         seeded RNG (mulberry32)
    city.js           seeded city generation and building collision
    vehicles.js       car physics and traffic AI
    player.js         walking, shooting, stealing, busted, game over
    police.js         wanted stars and cruiser chases
    pedestrians.js    sidewalk walkers who flee gunfire
    missions.js       the three-mission stage machine and bank guards
    render.js         procedural Three.js city, cars, camera, particles
    hud.js            health/ammo/money/stars/mission text and minimap
    input.js          keyboard and mouse
    audio.js          synthesized WebAudio: engine, shots, sirens
    shots.js          the four staged screenshot scenes
main.ts               hand-in: copies game/ + screenshots/ and writes dossier.json
serve.ts              tiny static server for local play
```

## License

MIT — see `LICENSE`.
