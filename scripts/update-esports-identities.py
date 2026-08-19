import json
import os
import re
import tempfile
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY_FILE = ROOT / 'data' / 'esports-directory.json'
OVERRIDES_FILE = ROOT / 'data' / 'esports-profile-overrides.json'
HF_BASE = 'https://huggingface.co/datasets/gptilt/lol-esports-entities/resolve/main'
FILES = {
    'figures': f'{HF_BASE}/public_figures/public_figures.parquet?download=true',
    'aliases': f'{HF_BASE}/entity_aliases/entity_aliases.parquet?download=true',
}


def norm(value):
    value = str(value or '').replace('&nbsp;', ' ')
    value = unicodedata.normalize('NFKD', value)
    value = ''.join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r'[_\s]+', ' ', value.strip().lower())


def page_key_from_url(value):
    value = str(value or '')
    marker = '/wiki/'
    if marker not in value:
        return None
    from urllib.parse import unquote
    return unquote(value.split(marker, 1)[1].split('?', 1)[0]).replace('_', ' ')


def download(url, path):
    request = urllib.request.Request(url, headers={'User-Agent': 'WebLienMinh/2.5.1 global-esports-identity-resolver'})
    with urllib.request.urlopen(request, timeout=90) as response, open(path, 'wb') as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    size = os.path.getsize(path)
    if size < 10_000:
        raise RuntimeError(f'Parquet tải về quá nhỏ ({size} bytes): {url}')
    return size


def rows_from_parquet(path):
    table = pq.read_table(path)
    return table.to_pylist()


def league_family(league):
    value = str(league or '').upper()
    if value in {'LCK', 'LCKC', 'LAS'}:
        return ['korea', 'kr']
    if value == 'LPL':
        return ['china', 'cn']
    if value in {'LEC', 'LFL', 'LIT', 'NLC', 'PRM', 'EBL', 'EM', 'HLL', 'TCL'}:
        return ['europe', 'emea', 'eu']
    if value in {'LCS', 'NACL'}:
        return ['north america', 'na']
    if value in {'CBLOL', 'CD'}:
        return ['brazil', 'br']
    if value in {'LCP', 'VCS', 'LJL', 'PCS'}:
        return ['asia', 'pacific', 'sea', 'vietnam', 'japan', 'taiwan']
    if value in {'LRN', 'LRS', 'LES'}:
        return ['latin america', 'latam']
    return []


def role_family(value):
    text = norm(value)
    if not text:
        return None
    if 'top' in text:
        return 'top'
    if 'jung' in text or text in {'jng', 'jg'}:
        return 'jungle'
    if 'mid' in text:
        return 'middle'
    if any(token in text for token in ['bottom', 'bot lan', 'adc', 'ad carry', 'marksman']):
        return 'bottom'
    if 'support' in text or text in {'sup', 'utility'}:
        return 'support'
    return None


def figure_is_retired(figure):
    for key in ('is_retired', 'retired'):
        if key not in figure:
            continue
        value = figure.get(key)
        if isinstance(value, bool):
            return value
        if str(value or '').strip().lower() in {'1', 'true', 'yes', 'y'}:
            return True
        if str(value or '').strip().lower() in {'0', 'false', 'no', 'n'}:
            return False
    return False


def load_identity_pins():
    if not OVERRIDES_FILE.exists():
        return []
    payload = json.loads(OVERRIDES_FILE.read_text(encoding='utf-8'))
    return [row for row in payload.get('players', []) if str(row.get('page') or '').strip()]


def pinned_page_for_player(player, pins):
    player_name = norm(player.get('id'))
    team_name = norm((player.get('team') or {}).get('name'))
    matches = []
    for target in pins:
        if norm(target.get('name')) != player_name:
            continue
        target_team = norm(target.get('team'))
        if target_team and target_team != team_name:
            continue
        page = str(target.get('page') or '').strip()
        if page:
            matches.append(page)
    unique = []
    seen = set()
    for page in matches:
        key = norm(page)
        if key and key not in seen:
            unique.append(page)
            seen.add(key)
    if len(unique) > 1:
        raise RuntimeError(f'Identity pin không duy nhất cho {player.get("id")} / {(player.get("team") or {}).get("name")}: {unique}')
    return unique[0] if unique else None


def choose_candidate(player, candidates, figures):
    entity_ids = []
    seen = set()
    for row in candidates:
        entity_id = str(row.get('entity_id') or '').strip()
        if entity_id and entity_id not in seen:
            entity_ids.append(entity_id)
            seen.add(entity_id)

    preferred = str(player.get('preferredPage') or '').strip()
    if preferred:
        exact = [entity_id for entity_id in entity_ids if norm(entity_id) == norm(preferred)]
        if len(exact) == 1:
            return exact[0], 'preferred-page'
        if preferred in figures:
            return preferred, 'preferred-page'

    if not entity_ids:
        return None, None
    if len(entity_ids) == 1:
        return entity_ids[0], 'unique-alias'

    raw_id = norm(player.get('id'))
    page_key_raw = page_key_from_url(player.get('sourcePage'))
    page_key = norm(page_key_raw)
    # A synthetic /wiki/Viper URL is not enough to resolve one of many people named Viper.
    # Only trust the URL when it is already a more specific canonical page key.
    if page_key and page_key != raw_id:
        exact = [entity_id for entity_id in entity_ids if norm(entity_id) == page_key]
        if len(exact) == 1:
            return exact[0], 'specific-source-page'

    overview = norm(player.get('overviewPage'))
    if overview and overview != raw_id:
        exact = [entity_id for entity_id in entity_ids if norm(entity_id) == overview]
        if len(exact) == 1:
            return exact[0], 'specific-overview-page'

    wanted_role = role_family(player.get('role'))
    if wanted_role:
        role_matches = [
            entity_id for entity_id in entity_ids
            if role_family((figures.get(entity_id) or {}).get('role')) == wanted_role
        ]
        if len(role_matches) == 1:
            return role_matches[0], 'role'

        active_role_matches = [
            entity_id for entity_id in role_matches
            if not figure_is_retired(figures.get(entity_id) or {})
        ]
        if len(active_role_matches) == 1:
            return active_role_matches[0], 'role-active'

    ign_ids = []
    seen_ign = set()
    for row in candidates:
        if str(row.get('alias_type') or '').lower() != 'ign':
            continue
        entity_id = str(row.get('entity_id') or '').strip()
        if entity_id and entity_id not in seen_ign:
            ign_ids.append(entity_id)
            seen_ign.add(entity_id)
    if len(ign_ids) == 1:
        return ign_ids[0], 'unique-ign'

    families = league_family((player.get('team') or {}).get('region') or player.get('residency'))
    if families:
        matches = []
        for entity_id in entity_ids:
            region = norm((figures.get(entity_id) or {}).get('region'))
            if any(norm(family) in region for family in families):
                matches.append(entity_id)
        if len(matches) == 1:
            return matches[0], 'region'

    active = [entity_id for entity_id in entity_ids if not figure_is_retired(figures.get(entity_id) or {})]
    if len(active) == 1:
        return active[0], 'only-active'

    return None, None


def main():
    directory = json.loads(DIRECTORY_FILE.read_text(encoding='utf-8'))
    identity_pins = load_identity_pins()

    with tempfile.TemporaryDirectory(prefix='rift-esports-identities-') as temp:
        temp = Path(temp)
        figures_file = temp / 'public_figures.parquet'
        aliases_file = temp / 'entity_aliases.parquet'
        figure_bytes = download(FILES['figures'], figures_file)
        alias_bytes = download(FILES['aliases'], aliases_file)
        print(f'GPTilt identity parquet: figures={figure_bytes/1024:.0f} KB aliases={alias_bytes/1024:.0f} KB')

        figure_rows = rows_from_parquet(figures_file)
        alias_rows = rows_from_parquet(aliases_file)

    figures = {}
    for row in figure_rows:
        person_id = str(row.get('person_id') or '').strip()
        if person_id:
            figures[person_id] = row

    aliases_by_text = defaultdict(list)
    aliases_by_entity = defaultdict(list)
    for row in alias_rows:
        if str(row.get('entity_type') or '').lower() != 'person':
            continue
        alias = str(row.get('alias') or '').replace('&nbsp;', ' ').strip()
        entity_id = str(row.get('entity_id') or '').strip()
        if not alias or not entity_id:
            continue
        clean = dict(row)
        clean['alias'] = alias
        clean['entity_id'] = entity_id
        aliases_by_text[norm(alias)].append(clean)
        aliases_by_entity[entity_id].append(clean)

    matched = 0
    real_names = 0
    ambiguous = 0
    not_found = 0
    pinned = 0
    match_methods = defaultdict(int)
    ambiguous_examples = []

    for player in directory.get('players', []):
        preferred_pin = pinned_page_for_player(player, identity_pins)
        if preferred_pin:
            player['preferredPage'] = preferred_pin
            player['preferredTeam'] = (player.get('team') or {}).get('name') or player.get('preferredTeam')
            pinned += 1

        candidates = []
        keys = {norm(player.get('id')), norm(player.get('overviewPage'))}
        if player.get('preferredPage'):
            keys.add(norm(player.get('preferredPage')))
        for key in keys:
            if key:
                candidates.extend(aliases_by_text.get(key, []))

        entity_id, method = choose_candidate(player, candidates, figures)
        if not entity_id:
            if candidates:
                ambiguous += 1
                player['identityStatus'] = 'ambiguous'
                if len(ambiguous_examples) < 20:
                    ambiguous_examples.append({
                        'id': player.get('id'),
                        'role': player.get('role'),
                        'team': (player.get('team') or {}).get('name'),
                        'candidates': sorted({str(row.get('entity_id') or '') for row in candidates if row.get('entity_id')})[:12],
                    })
            else:
                not_found += 1
                player['identityStatus'] = 'not-found'
            continue

        figure = figures.get(entity_id, {})
        entity_aliases = aliases_by_entity.get(entity_id, [])
        real_name = next((
            str(row.get('alias') or '').replace('&nbsp;', ' ').strip()
            for row in entity_aliases
            if str(row.get('alias_type') or '').lower() == 'real_name' and str(row.get('alias') or '').strip()
        ), None)

        source_url = str(figure.get('source_url') or '').strip()
        if not source_url:
            source_url = next((
                str(row.get('source_url') or '').strip()
                for row in candidates
                if str(row.get('entity_id') or '').strip() == entity_id and row.get('source_url')
            ), '')

        player['identityId'] = entity_id
        player['identityStatus'] = 'matched'
        player['identityMatchMethod'] = method
        player['identitySource'] = 'GPTilt Leaguepedia entity directory'
        player['identitySourceUrl'] = source_url or None
        player['overviewPage'] = entity_id
        if source_url:
            player['sourcePage'] = source_url
        if real_name and norm(real_name) != norm(player.get('id')):
            player['name'] = real_name
            real_names += 1
        if figure.get('display_name'):
            player['displayName'] = str(figure['display_name'])
        if figure.get('canonical_name'):
            player['canonicalName'] = str(figure['canonical_name'])
        if figure.get('region'):
            player['identityRegion'] = str(figure['region'])
        if figure.get('role'):
            player['identityRole'] = str(figure['role'])
        matched += 1
        match_methods[method or 'unknown'] += 1

    directory['identityEnrichedAt'] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat().replace('+00:00', 'Z')
    directory['identitySource'] = 'GPTilt League of Legends Esports Directory (Leaguepedia-derived, CC BY-SA 3.0)'
    directory['identitySourceUrl'] = 'https://huggingface.co/datasets/gptilt/lol-esports-entities'
    directory['identityStatus'] = {
        'matched': matched,
        'realNames': real_names,
        'ambiguous': ambiguous,
        'notFound': not_found,
        'pinned': pinned,
        'total': len(directory.get('players', [])),
        'matchMethods': dict(sorted(match_methods.items())),
        'ambiguousExamples': ambiguous_examples,
    }

    DIRECTORY_FILE.write_text(json.dumps(directory, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Identity resolution xong: matched={matched}, realName={real_names}, ambiguous={ambiguous}, notFound={not_found}, pinned={pinned}, total={len(directory.get("players", []))}.')
    if ambiguous_examples:
        print('Ambiguous identity samples:', json.dumps(ambiguous_examples[:10], ensure_ascii=False))


if __name__ == '__main__':
    main()
