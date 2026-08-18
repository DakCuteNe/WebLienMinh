import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the main enrichment first. This wrapper exists so a malformed wiki-link cleanup
// can never leak a trailing bracket into public player/team metadata.
await import('./update-esports-media.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '..', 'data', 'esports-directory.json');
const directory = JSON.parse(await fs.readFile(file, 'utf8'));

function cleanText(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\]+(?=\s*(?:,|$))/g, '').replace(/^\[+/, '').trim();
}

for (const player of directory.players || []) {
  for (const field of ['name', 'nativeName', 'country', 'nationality', 'residency', 'currentTeamName', 'contract', 'soloqueueIds']) {
    if (player[field]) player[field] = cleanText(player[field]);
  }
  if (player.socials) {
    for (const key of Object.keys(player.socials)) player.socials[key] = cleanText(player.socials[key]);
  }
}

for (const team of directory.teams || []) {
  for (const field of ['name', 'short', 'region', 'location']) if (team[field]) team[field] = cleanText(team[field]);
}

directory.countries = [...new Set((directory.players || []).map(p => p.country || p.nationality).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b));
directory.mediaSanitizedAt = new Date().toISOString();

await fs.writeFile(file, JSON.stringify(directory, null, 2));
console.log('Esports media safety cleanup xong.');
