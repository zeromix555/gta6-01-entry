// SOLMAR HEAT — the hand-in program (Node 22, standard library only).
//
// It copies game/ and screenshots/ from beside this file into the output
// directory (/output on the grader, MAKEFUN_OUTPUT_DIR anywhere else) and
// writes /output/dossier.json with the vendored make.fun library, under the
// competition's caps: at most 4 screenshots of 256 KiB, at most 993 game
// files totalling 48 MiB, paths under 1000 bytes.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// A clean output tree: the game, then the screenshots, then the dossier.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`SOLMAR HEAT: wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
