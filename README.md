[![Built with make.fun](https://make.fun/badge/built-with-makefun.svg)](https://make.fun)
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeromix555/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zeromix555/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Invite: jwef5djp](https://make.fun/badge/invite-jwef5djp.svg)](https://make.fun/r/jwef5djp)

*v3 resubmission — every snapshot file rewritten in a recorded session.*

# SOLMAR HEAT — an original open-world crime game

**make.fun bounty: [gta6-01 — Make GTA 6](https://make.fun/c/gta6-01)**

A complete open-world crime game that plays offline in a desktop browser from
static files — no build step, no network request. Built with three.js
(vendored under `game/vendor/`).

## The game

Solmar City, sun-soaked and wide open. You are **Dario Cruz**, a getaway
driver who owes money and takes three jobs he cannot refuse:

1. **First Fare** — pick up a package at Maribel's Diner and run it to the docks.
2. **Hot Wheels** — steal the Comet GT from Solmar Motors, lose the cops, deliver it to Rico's Chop Shop.
3. **The Getaway** — hit Solmar Trust Bank, fight past the guards, and outrun a four-star police response to the Pier 9 hideout.

## Systems

- **Open world on foot and by car** — a 7×7-block city with roads, sidewalks, palms, beach and sea; enter any parked car (E), steal it, drive it.
- **Traffic + pedestrians** — AI cars drive the road grid and stop for each other; pedestrians stroll the sidewalks and flee from gunfire and speeding cars.
- **Wanted level + police** — 0–5 stars; crimes draw heat, cop cars spawn and chase, ram, and bust you on foot. Lose them and the heat cools.
- **Missions + story** — three jobs with objectives, a gold beacon + minimap marker, briefings and payouts.
- **Combat** — pistol with ammo/reload, bank guards who shoot back, health + regen.
- **HUD + minimap** — wanted stars, cash, health, ammo, objective banner, live minimap (player, cops, traffic, cash, mission marker), speedometer.
- **Polish** — title / pause / busted / game-over / win screens, save to localStorage (Continue), synthesised WebAudio sound (engine, sirens, gunshots, jingles), particles, day sun + shadows.
- **Free roam** — green cash drops scattered around the city after the story ends.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse drag | Orbit camera |
| Shift | Run |
| Space | Handbrake |
| E | Enter car / steal / interact |
| Click | Shoot |
| R | Reload |
| P | Pause |
| M | Mute |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Files

- `game/` — the playable game (`index.html` + `src/*.js`, three.js in `game/vendor/`)
- `screenshots/` — 4 real renders of the game (see `shots.json` for the staged scenes)
- `main.ts` — the make.fun entry program (copies `game/` + `screenshots/` to `/output`, writes `dossier.json`)
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## Originality

Everything is original: the city, characters, vehicles, names, story, art and
sounds. Nothing from Rockstar Games' Grand Theft Auto series or any other
commercial game.

## License

MIT — see [LICENSE](LICENSE).
