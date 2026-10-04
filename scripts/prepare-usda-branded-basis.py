"""Read-only repair plan from a public-library backup and its original USDA archive.

Never reads credentials or changes a database. The backup must contain provider
FoodLibraryItem rows only; customer diaries, labels and favourites are excluded.
"""
import argparse
import csv
import io
import json
import math
import zipfile
from collections import Counter

parser = argparse.ArgumentParser()
parser.add_argument('--backup', required=True)
parser.add_argument('--archive', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
fields = ('calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG')
records = {}
with open(args.backup) as stream:
    for line in stream:
        row = json.loads(line)
        if row['source'] != 'usda_branded' or not row['fdcId']:
            raise ValueError('Backup contains a row outside the public USDA branded scope')
        key = str(row['fdcId'])
        if key in records:
            raise ValueError('Duplicate provider identity in backup')
        records[key] = {key: row.get(key) for key in ('id', 'fdcId', 'name', 'gtinUpc', 'servingSize', *fields)}
print(json.dumps({'readOnly': True, 'backupRecords': len(records)}), flush=True)

archive = zipfile.ZipFile(args.archive)

def rows(suffix):
    matches = [name for name in archive.namelist() if name.endswith('/' + suffix)]
    if len(matches) != 1:
        raise ValueError('Expected one original USDA CSV: ' + suffix)
    with archive.open(matches[0]) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream))

identities = set()
for row in rows('food.csv'):
    key = row['fdc_id']
    if key in records and row.get('description', '').strip() == records[key]['name']:
        identities.add(key)
barcodes = set()
bases = {}
unit_counts = Counter()
for row in rows('branded_food.csv'):
    key = row['fdc_id']
    if key in identities and row.get('gtin_upc', '').strip() == (records[key]['gtinUpc'] or ''):
        barcodes.add(key)
        unit = row.get('serving_size_unit', '').strip().lower()
        unit_counts[unit] += 1
        if unit in ('g', 'gm', 'grm', 'gram', 'grams', 'oz', 'ounce', 'ounces'):
            bases[key] = '100 g'
        elif unit in ('ml', 'mlt', 'milliliter', 'millilitre', 'milliliters', 'millilitres'):
            bases[key] = '100 ml'
print(json.dumps({'readOnly': True, 'exactArchiveNameAndBarcodeMatches': len(barcodes), 'providerUnits': dict(unit_counts)}), flush=True)

expected = {'1008': ('calories', 'KCAL'), '1003': ('proteinG', 'G'), '1005': ('carbsG', 'G'),
            '1004': ('fatG', 'G'), '1079': ('fiberG', 'G'), '2000': ('sugarG', 'G'), '1063': ('sugarG', 'G')}
units = {row['id']: row.get('unit_name', '').strip().upper() for row in rows('nutrient.csv')}
ids = {key: field for key, (field, unit) in expected.items() if units.get(key) == unit}
nutrients = {}
for row in rows('food_nutrient.csv'):
    key = row['fdc_id']
    field = ids.get(row.get('nutrient_id'))
    if key not in barcodes or field is None:
        continue
    try:
        value = float(row['amount'])
    except (ValueError, TypeError):
        continue
    if not math.isfinite(value) or value < 0:
        continue
    values = nutrients.setdefault(key, {})
    # Match the original import's handling of duplicate nutrient measurements.
    values[field] = max(value, values.get(field, value))

counts = Counter()
examples = []
with open(args.output, 'x') as stream:
    for key, before in records.items():
        if key not in barcodes or key not in nutrients or key not in bases:
            counts['unmatchedPreserved'] += 1
            continue
        after = {'servingSize': bases[key], **{field: nutrients[key].get(field) for field in fields}}
        if all(before.get(field) == value for field, value in after.items()):
            counts['alreadyCanonical'] += 1
            continue
        counts['planned'] += 1
        if before['servingSize'] == 'None':
            counts['missingServingRepaired'] += 1
        if before.get('sugarG') is None and after['sugarG'] is not None:
            counts['originalSugarRecovered'] += 1
        stream.write(json.dumps({'before': before, 'after': after}, separators=(',', ':')) + '\n')
        if before['fdcId'] in (2317111, 2183033):
            examples.append({'fdcId': before['fdcId'], 'name': before['name'], 'beforeServing': before['servingSize'],
                             'beforeCalories': before['calories'], 'after': after})
print(json.dumps({'readOnly': True, 'counts': dict(counts), 'examples': examples}), flush=True)
