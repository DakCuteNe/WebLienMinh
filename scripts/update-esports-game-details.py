#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import gdown
except ImportError as exc:
    raise SystemExit('gdown is required: pip install gdown') from exc

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'data' / 'esports-game-details.json'
TEMP = ROOT / '.oracle-elixir-2026.csv'
FOLDER_ID = '1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH'
YEAR = datetime.now(timezone.utc).year
FILENAME = f'{YEAR}_LoL_esports_match_data_from_OraclesElixir.csv'
KEEP_DAYS = 70


def compact(value: object) -> str:
    return re.sub(r'[^a-z0-9]+', '', str(value or '').lower())


def number(value: object):
    raw = str(value or '').strip()
    if not raw or raw.lower() in {'nan', 'na', 'null', 'none'}:
        return None
    try:
        val = float(raw)
    except ValueError:
        return None
    return int(val) if val.is_integer() else val


def parse_date(value: str):
    raw = str(value or '').strip().replace('Z', '+00:00')
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
            try:
                parsed = datetime.strptime(raw, fmt)
                break
            except ValueError:
                parsed = None
        if parsed is None:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def fetch_json(url: str):
    request = urllib.request.Request(url, headers={'User-Agent': 'WebLienMinh/3.20 oracle-cache'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def champion_index():
    versions = fetch_json('https://ddragon.leagueoflegends.com/api/versions.json')
    version = versions[0]
    body = fetch_json(f'https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json')
    mapping = {}
    for champion in body.get('data', {}).values():
        key = int(champion.get('key') or 0)
        if not key:
            continue
        for alias in (champion.get('name'), champion.get('id')):
            normalized = compact(alias)
            if normalized:
                mapping[normalized] = key
    return mapping, version


def champion_ref(value: object, mapping: dict[str, int]):
    raw = str(value or '').strip()
    if not raw or raw.lower() in {'nan', 'na', 'null', 'none'}:
        return None
    if raw.isdigit():
        return int(raw)
    return mapping.get(compact(raw))


def download_oracle_csv():
    items = gdown.download_folder(id=FOLDER_ID, skip_download=True, quiet=True)
    files = {Path(item.path).name: item.id for item in items}
    file_id = files.get(FILENAME)
    if not file_id:
        available = ', '.join(sorted(files)[-8:])
        raise RuntimeError(f'{FILENAME} not found in Oracle folder. Available tail: {available}')
    if TEMP.exists():
        TEMP.unlink()
    gdown.download(id=file_id, output=str(TEMP), quiet=False, fuzzy=True)
    if not TEMP.exists() or TEMP.stat().st_size < 1024:
        raise RuntimeError('Oracle CSV download failed or is unexpectedly small')


def team_row(row: dict[str, str]) -> bool:
    participant = str(row.get('participantid') or '').strip()
    position = str(row.get('position') or '').strip().lower()
    return participant in {'100', '200'} or position == 'team'


def game_record(row: dict[str, str], champions: dict[str, int]):
    bans = [champion_ref(row.get(f'ban{i}'), champions) for i in range(1, 6)]
    picks = [champion_ref(row.get(f'pick{i}'), champions) for i in range(1, 6)]
    bans = [value for value in bans if value is not None]
    picks = [value for value in picks if value is not None]
    dragon_types = []
    for column, label in (
        ('infernals', 'infernal'), ('mountains', 'mountain'), ('clouds', 'cloud'),
        ('oceans', 'ocean'), ('chemtechs', 'chemtech'), ('hextechs', 'hextech'), ('elders', 'elder')
    ):
        count = int(number(row.get(column)) or 0)
        dragon_types.extend([label] * max(0, count))
    return {
        'teamId': str(row.get('teamid') or '').strip() or None,
        'teamName': str(row.get('teamname') or '').strip() or None,
        'side': str(row.get('side') or '').strip().lower() or None,
        'result': number(row.get('result')),
        'bans': bans,
        'picks': picks,
        'stats': {
            'kills': number(row.get('kills')),
            'gold': number(row.get('totalgold')),
            'towers': number(row.get('towers')),
            'inhibitors': number(row.get('inhibitors')),
            'dragons': number(row.get('dragons')),
            'dragonTypes': dragon_types,
            'voidGrubs': number(row.get('void_grubs')),
            'riftHeralds': number(row.get('heralds')),
            'barons': number(row.get('barons')),
            'atakhans': number(row.get('atakhans')),
        }
    }


def main():
    champions, ddragon_version = champion_index()
    download_oracle_csv()
    cutoff = datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)
    grouped: dict[str, dict] = {}
    scanned = kept_rows = 0

    with TEMP.open('r', encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        required = {'gameid', 'date', 'game', 'teamname', 'side', 'ban1', 'ban5', 'heralds', 'void_grubs'}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise RuntimeError(f'Oracle CSV schema missing fields: {sorted(missing)}')
        for row in reader:
            scanned += 1
            if not team_row(row):
                continue
            played_at = parse_date(row.get('date') or '')
            if not played_at or played_at < cutoff:
                continue
            game_id = str(row.get('gameid') or '').strip()
            game_number = int(number(row.get('game')) or 0)
            if not game_id or game_number <= 0:
                continue
            kept_rows += 1
            entry = grouped.setdefault(game_id, {
                'oracleGameId': game_id,
                'date': played_at.isoformat().replace('+00:00', 'Z'),
                'league': str(row.get('league') or '').strip() or None,
                'split': str(row.get('split') or '').strip() or None,
                'gameNumber': game_number,
                'patch': number(row.get('patch')),
                'teams': []
            })
            entry['teams'].append(game_record(row, champions))

    games = []
    for entry in grouped.values():
        if len(entry['teams']) != 2:
            continue
        if any(not team.get('teamName') for team in entry['teams']):
            continue
        entry['teamKey'] = '|'.join(sorted(compact(team['teamName']) for team in entry['teams']))
        games.append(entry)
    games.sort(key=lambda row: (row['date'], row['teamKey'], row['gameNumber']))

    output = {
        'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'source': {
            'name': "Oracle's Elixir",
            'folderId': FOLDER_ID,
            'file': FILENAME,
            'ddragonVersion': ddragon_version,
            'keepDays': KEEP_DAYS
        },
        'summary': {'scannedRows': scanned, 'teamRowsKept': kept_rows, 'games': len(games)},
        'games': games
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Oracle game detail cache written: {len(games)} games / {kept_rows} team rows -> {OUT}')
    TEMP.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Oracle cache update failed: {exc}', file=sys.stderr)
        raise
