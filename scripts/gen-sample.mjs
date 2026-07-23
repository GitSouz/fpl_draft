// Generates a realistic SAMPLE player dataset so the app can be exercised
// while the real FPL API is offline (e.g. between seasons). Output is written
// to src/sampleData.ts as a typed Player[]. Deterministic (seeded) so rebuilds
// are stable. Run: node scripts/gen-sample.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Seeded RNG (mulberry32) for reproducible output.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20242025);
const rand = (min, max) => min + rng() * (max - min);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const round1 = (n) => Math.round(n * 10) / 10;

// Real 2024/25 Premier League clubs with a rough strength weighting (0..1)
// used only to correlate generated stats — bigger clubs get better numbers.
const TEAMS = [
  ['Manchester City', 'MCI', 1.0],
  ['Arsenal', 'ARS', 0.97],
  ['Liverpool', 'LIV', 0.98],
  ['Chelsea', 'CHE', 0.85],
  ['Tottenham', 'TOT', 0.82],
  ['Manchester Utd', 'MUN', 0.8],
  ['Newcastle', 'NEW', 0.83],
  ['Aston Villa', 'AVL', 0.8],
  ['Brighton', 'BHA', 0.74],
  ['West Ham', 'WHU', 0.68],
  ['Brentford', 'BRE', 0.66],
  ['Fulham', 'FUL', 0.64],
  ['Crystal Palace', 'CRY', 0.65],
  ['Bournemouth', 'BOU', 0.66],
  ['Wolves', 'WOL', 0.58],
  ['Everton', 'EVE', 0.57],
  ['Nottingham Forest', 'NFO', 0.62],
  ['Leicester', 'LEI', 0.48],
  ['Ipswich', 'IPS', 0.42],
  ['Southampton', 'SOU', 0.4],
];

const FIRST = [
  'James', 'Jack', 'Harry', 'Tom', 'Callum', 'Marcus', 'Reece', 'Ollie',
  'Leon', 'Kai', 'Bruno', 'Diogo', 'João', 'Rúben', 'Pedro', 'Rodrigo',
  'Mateo', 'Lucas', 'Nico', 'Andreas', 'Mikkel', 'Anders', 'Kasper',
  'Pierre', 'Hugo', 'Théo', 'Youssef', 'Amadou', 'Ismaïla', 'Cheick',
  'Yunus', 'Emre', 'Kenan', 'Sergio', 'Álvaro', 'Dani', 'Pablo', 'Nathan',
  'Dominic', 'Conor', 'Aaron', 'Ezri', 'Morgan', 'Tyrick', 'Elliot',
  'Jarrod', 'Cole', 'Anthony', 'Solly', 'Rico',
];
const LAST = [
  'Walker', 'Reed', 'Hughes', 'Bailey', 'Thompson', 'Palmer', 'Sanders',
  'Wright', 'Clarke', 'Foster', 'Marsh', 'Nolan', 'Doyle', 'Byrne',
  'Silva', 'Costa', 'Fernandes', 'Nunes', 'Pereira', 'Ramos', 'Neto',
  'Torres', 'Moreno', 'Herrera', 'Vidal', 'Sørensen', 'Larsen', 'Andersen',
  'Berg', 'Lindqvist', 'Kovač', 'Marković', 'Petrov', 'Novak', 'Horvat',
  'Diallo', 'Traoré', 'Koné', 'Camara', 'Sané', 'Bakayoko', 'Öztürk',
  'Yılmaz', 'Demir', 'Kaya', 'Rossi', 'Bianchi', 'Greco', 'Mensah', 'Owusu',
];

const POSITIONS = [
  { pos: 'GKP', count: 3, roles: [1.0, 0.4, 0.15], basePts: 120, price: [4.0, 1.6] },
  { pos: 'DEF', count: 7, roles: [1.0, 0.95, 0.88, 0.78, 0.5, 0.3, 0.18], basePts: 115, price: [4.0, 3.6] },
  { pos: 'MID', count: 7, roles: [1.0, 0.92, 0.82, 0.68, 0.5, 0.32, 0.2], basePts: 140, price: [4.5, 8.8] },
  { pos: 'FWD', count: 3, roles: [1.0, 0.72, 0.42], basePts: 150, price: [5.5, 9.8] },
];

const usedNames = new Set();
function uniqueName() {
  for (let i = 0; i < 200; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const key = `${first} ${last}`;
    if (!usedNames.has(key)) {
      usedNames.add(key);
      return { first, last };
    }
  }
  // fall back to a numbered surname if we somehow exhaust combinations
  const first = pick(FIRST);
  const last = `${pick(LAST)}-${usedNames.size}`;
  usedNames.add(`${first} ${last}`);
  return { first, last };
}

const players = [];
let id = 900001; // high offset so demo ids never collide with real FPL ids
let teamId = 1;

for (const [teamName, teamShort, strength] of TEAMS) {
  for (const spec of POSITIONS) {
    for (let i = 0; i < spec.count; i++) {
      const role = spec.roles[i];
      const { first, last } = uniqueName();

      // points: base * strength * role, with noise; clamp at 0
      const pts = Math.max(
        0,
        Math.round(spec.basePts * (0.55 + 0.6 * strength) * role * rand(0.8, 1.2))
      );
      const ptsNorm = Math.min(1, pts / 230);

      const [pMin, pRange] = spec.price;
      const price = round1(
        Math.max(4.0, pMin + pRange * ptsNorm + rand(-0.2, 0.3))
      );

      const apps = Math.max(6, Math.round(role * 36 * rand(0.75, 1)));
      const ppg = round1(pts / apps);
      const form = round1(Math.min(9, Math.max(0, ppg * rand(0.6, 1.4))));
      const owned = round1(Math.min(72, Math.max(0, ptsNorm * 65 * rand(0.4, 1.3))));

      // occasional injury/doubt flags for realism
      let status = 'a';
      let news = '';
      const r = rng();
      if (role > 0.6) {
        if (r < 0.04) {
          status = 'i';
          news = 'Knock - expected back soon';
        } else if (r < 0.09) {
          status = 'd';
          news = '75% chance of playing';
        } else if (r < 0.1) {
          status = 's';
          news = 'Suspended (one match)';
        }
      }

      players.push({
        id: id++,
        name: last,
        fullName: `${first} ${last}`,
        teamId,
        teamShort,
        teamName,
        position: spec.pos,
        price,
        totalPoints: pts,
        form,
        pointsPerGame: ppg,
        selectedByPercent: owned,
        status,
        news,
      });
    }
  }
  teamId++;
}

const header = `// AUTO-GENERATED by scripts/gen-sample.mjs — do not edit by hand.
// Realistic *sample* data (not real players) for testing the draft when the
// live FPL API is unavailable. Regenerate with: node scripts/gen-sample.mjs
import type { Player } from './fpl';

export const SAMPLE_PLAYERS: Player[] = ${JSON.stringify(players, null, 0)};
`;

writeFileSync(join(__dirname, '..', 'src', 'sampleData.ts'), header);
console.log(`Wrote ${players.length} sample players to src/sampleData.ts`);
