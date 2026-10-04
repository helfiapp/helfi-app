"""Read-only, exact-source plan for missing public Foundation calories.

Never loads credentials or changes a database. Existing calories, other
nutrients, provider identities and all customer records remain untouched.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import zipfile
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--backup', required=True)
parser.add_argument('--archive', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
fields = ('proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG')
records = {}
for line in Path(args.backup).read_text().splitlines():
    row = json.loads(line)
    if row.get('source') != 'usda_foundation' or not isinstance(row.get('fdcId'), int) or row['fdcId'] <= 0:
        raise ValueError('Backup contains a row outside public Foundation scope')
    key = str(row['fdcId'])
    if key in records:
        raise ValueError('Duplicate Foundation provider identity')
    records[key] = row

archive = zipfile.ZipFile(args.archive)

def rows(suffix):
    matches = [name for name in archive.namelist() if name.endswith('/' + suffix)]
    if len(matches) != 1:
        raise ValueError('Expected one original USDA CSV: ' + suffix)
    with archive.open(matches[0]) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream))

names = {row['fdc_id']: row.get('description', '').strip() for row in rows('food.csv')}
units = {row['id']: row.get('unit_name', '').strip().upper() for row in rows('nutrient.csv')}
energy_order = ('1008', '2047', '2048')
energy_ids = {key for key in energy_order if units.get(key) == 'KCAL'}
expected = {'1003': 'proteinG', '1005': 'carbsG', '1004': 'fatG', '1079': 'fiberG', '2000': 'sugarG', '1063': 'sugarG'}
gram_ids = {key: field for key, field in expected.items() if units.get(key) == 'G'}
nutrients = {}
energies = {}
for row in rows('food_nutrient.csv'):
    key = row['fdc_id']
    nutrient_id = row.get('nutrient_id')
    if key not in records or nutrient_id not in energy_ids | gram_ids.keys():
        continue
    try:
        amount = float(row['amount'])
    except (ValueError, TypeError):
        continue
    if not math.isfinite(amount) or amount < 0:
        continue
    if nutrient_id in energy_ids:
        values = energies.setdefault(key, {})
        values[nutrient_id] = max(amount, values.get(nutrient_id, amount))
    else:
        values = nutrients.setdefault(key, {})
        field = gram_ids[nutrient_id]
        values[field] = max(amount, values.get(field, amount))

counts = Counter()
methods = Counter()
examples = []
with open(args.output, 'x') as stream:
    for key, before in records.items():
        if before.get('calories') is not None:
            counts['existingCaloriesPreserved'] += 1
            continue
        if names.get(key) != before['name'] or before.get('servingSize') != '100 g' or before.get('brand') is not None or before.get('gtinUpc') is not None:
            counts['identityOrBasisMismatchPreserved'] += 1
            continue
        original = nutrients.get(key, {})
        if any(before.get(field) != original.get(field) for field in fields):
            counts['originalMacroMismatchPreserved'] += 1
            continue
        source_id = next((nid for nid in energy_order if nid in energies.get(key, {})), None)
        if source_id is None:
            counts['missingOriginalEnergyPreserved'] += 1
            continue
        after = {'calories': energies[key][source_id]}
        plan = {'before': before, 'after': after, 'energyNutrientId': int(source_id)}
        stream.write(json.dumps(plan, separators=(',', ':')) + '\n')
        counts['planned'] += 1
        methods[source_id] += 1
        if before['fdcId'] in (2257046, 2257044, 2340762) or len(examples) < 3:
            examples.append({'fdcId': before['fdcId'], 'name': before['name'], 'before': None, 'after': after['calories'], 'energyNutrientId': int(source_id), 'basis': '100 g'})

def sha256(filename):
    digest = hashlib.sha256()
    with open(filename, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            digest.update(chunk)
    return digest.hexdigest()

manifest = {'scope': 'usda_foundation_missing_calories_only', 'backupRecords': len(records),
            'counts': dict(counts), 'methods': dict(methods), 'examples': examples,
            'backupSha256': sha256(args.backup), 'archiveSha256': sha256(args.archive),
            'planSha256': sha256(args.output), 'energyOrder': [1008, 2047, 2048],
            'customerTablesTouched': False, 'otherNutrientsChanged': False}
with open(args.output + '.manifest.json', 'x') as stream:
    json.dump(manifest, stream, indent=2)
    stream.write('\n')
print(json.dumps({'readOnly': True, **manifest}), flush=True)
