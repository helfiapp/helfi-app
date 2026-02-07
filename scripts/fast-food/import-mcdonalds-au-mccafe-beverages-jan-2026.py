#!/usr/bin/env python3
"""
Imports McDonald's Australia McCafe Beverages nutrition from the official PDF into
data/food-overrides/fast_food_menus.csv.

Rules enforced:
- Only includes items that have calories + protein + carbs + fat (per serve).
- If a drink has Small/Medium/Large options in the PDF, they are imported as
  separate serving options (size_label = Small/Medium/Large) so the app can show
  the serving-size dropdown.

Source PDF (official):
https://promo.mcdonalds.com.au/sites/mcdonalds.com.au/files/Aus%20McCafe%20Beverages%20_January%202026.pdf
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import pdfplumber


PDF_URL_DEFAULT = (
    "https://promo.mcdonalds.com.au/sites/mcdonalds.com.au/files/"
    "Aus%20McCafe%20Beverages%20_January%202026.pdf"
)

CSV_DEFAULT = os.path.join("data", "food-overrides", "fast_food_menus.csv")

NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _clean_text(s: str) -> str:
    s = s.replace("®", "")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _is_all_caps(s: str) -> bool:
    letters = [ch for ch in s if ch.isalpha()]
    if not letters:
        return False
    return all(ch.isupper() for ch in letters)


def _is_candidate_item_line(line: str) -> bool:
    if not line:
        return False
    if ":" in line:
        return False
    # Avoid accidentally treating ingredient lines as item titles.
    if "Avg Qty" in line:
        return False
    if "," in line:
        return False
    if (
        "Energy (" in line
        or "Protein (g)" in line
        or "Carbohydrate (g)" in line
        or "Fat, total (g)" in line
        or "Sugars (g)" in line
    ):
        return False
    if len(line) > 140:
        return False
    noise_prefixes = (
        "If this document has been printed",
        "Issue:",
        "Revision:",
        "Information correct",
        "File:",
        "Developed and authorised",
    )
    for p in noise_prefixes:
        if line.startswith(p):
            return False
    if _is_all_caps(line):
        return False
    return any(ch.isalpha() for ch in line)


def _dedupe_repeated_title(line: str) -> str:
    words = line.split()
    if len(words) >= 2 and len(words) % 2 == 0:
        half = len(words) // 2
        if words[:half] == words[half:]:
            return " ".join(words[:half]).strip()
    return line.strip()


def _parse_per_serve_values(line: str, label: str) -> Optional[List[float]]:
    if label not in line:
        return None
    after = line.split(label, 1)[1]
    nums = [float(x) for x in NUM_RE.findall(after)]
    if len(nums) < 2:
        return None
    if len(nums) % 2 != 0:
        return None
    return nums[0::2]


@dataclass
class Block:
    item_line: str
    calories: Optional[List[float]] = None
    protein: Optional[List[float]] = None
    carbs: Optional[List[float]] = None
    fat: Optional[List[float]] = None
    sugar: Optional[List[float]] = None

    def variant_count(self) -> Optional[int]:
        for arr in (self.calories, self.protein, self.carbs, self.fat):
            if arr:
                return len(arr)
        return None


def _finalize_block(block: Block, source_url: str) -> List[Dict[str, str]]:
    if not block.item_line:
        return []
    if not (block.calories and block.protein and block.carbs and block.fat):
        return []
    v = block.variant_count()
    if v is None:
        return []
    if not (
        len(block.calories) == len(block.protein) == len(block.carbs) == len(block.fat) == v
    ):
        return []

    title = _clean_text(_dedupe_repeated_title(block.item_line))
    out: List[Dict[str, str]] = []

    # Common case for drinks: "... Small Medium Large"
    if v == 3 and title.endswith(" Small Medium Large"):
        base = title[: -len(" Small Medium Large")].strip()
        sizes = ["Small", "Medium", "Large"]
        for i, size in enumerate(sizes):
            out.append(
                {
                    "country": "AU",
                    "chain": "McDonald's",
                    "item": base,
                    "size_label": size,
                    "grams": "",
                    "ml": "",
                    "calories": str(block.calories[i]),
                    "protein_g": str(block.protein[i]),
                    "carbs_g": str(block.carbs[i]),
                    "fat_g": str(block.fat[i]),
                    "fiber_g": "",
                    "sugar_g": str(block.sugar[i]) if block.sugar and i < len(block.sugar) else "",
                    "source_url": source_url,
                }
            )
        return out

    # Pattern: "X and Y X Y" (treat as two separate items)
    if v == 2 and " and " in title:
        left, rest = title.split(" and ", 1)
        left = left.strip()
        rest = rest.strip()
        split_at = rest.rfind(left + " ")
        right = rest[:split_at].strip() if split_at != -1 else rest
        right = right.strip()
        if left and right and left != right:
            names = [left, right]
            for i, name in enumerate(names):
                out.append(
                    {
                        "country": "AU",
                        "chain": "McDonald's",
                        "item": name,
                        "size_label": "1 serving",
                        "grams": "",
                        "ml": "",
                        "calories": str(block.calories[i]),
                        "protein_g": str(block.protein[i]),
                        "carbs_g": str(block.carbs[i]),
                        "fat_g": str(block.fat[i]),
                        "fiber_g": "",
                        "sugar_g": str(block.sugar[i]) if block.sugar and i < len(block.sugar) else "",
                        "source_url": source_url,
                    }
                )
            return out

    if v == 1:
        out.append(
            {
                "country": "AU",
                "chain": "McDonald's",
                "item": title,
                "size_label": "1 serving",
                "grams": "",
                "ml": "",
                "calories": str(block.calories[0]),
                "protein_g": str(block.protein[0]),
                "carbs_g": str(block.carbs[0]),
                "fat_g": str(block.fat[0]),
                "fiber_g": "",
                "sugar_g": str(block.sugar[0]) if block.sugar else "",
                "source_url": source_url,
            }
        )
        return out

    return []


def _extract_rows_from_pdf(pdf_path: str, source_url: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with pdfplumber.open(pdf_path) as pdf:
        last_item_line: Optional[str] = None
        current: Optional[Block] = None

        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw in text.split("\n"):
                line = raw.strip()
                if not line:
                    continue

                if _is_candidate_item_line(line):
                    last_item_line = line

                if "Avg Qty / Serve" in line and ("Avg Qty / 100mL" in line or "Avg Qty / 100g" in line):
                    if current is not None:
                        rows.extend(_finalize_block(current, source_url))
                    current = Block(item_line=last_item_line or "")
                    continue

                if current is None:
                    continue

                cal = _parse_per_serve_values(line, "Energy (Cal)")
                if cal is not None:
                    current.calories = cal
                    continue

                protein = _parse_per_serve_values(line, "Protein (g)")
                if protein is not None:
                    current.protein = protein
                    continue

                carbs = _parse_per_serve_values(line, "Carbohydrate (g)")
                if carbs is not None:
                    current.carbs = carbs
                    continue

                fat = _parse_per_serve_values(line, "Fat, total (g)")
                if fat is not None:
                    current.fat = fat
                    continue

                sugar = _parse_per_serve_values(line, "Sugars (g)")
                if sugar is not None:
                    current.sugar = sugar
                    continue

        if current is not None:
            rows.extend(_finalize_block(current, source_url))

    return rows


def _read_csv_rows(csv_path: str) -> Tuple[List[str], List[Dict[str, str]]]:
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def _write_csv_rows(csv_path: str, headers: List[str], rows: List[Dict[str, str]]) -> None:
    tmp_path = csv_path + ".tmp"
    with open(tmp_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for r in rows:
            writer.writerow({h: r.get(h, "") for h in headers})
    os.replace(tmp_path, csv_path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=CSV_DEFAULT, help="Path to fast_food_menus.csv")
    ap.add_argument("--pdf", required=True, help="Path to downloaded PDF")
    ap.add_argument("--source-url", default=PDF_URL_DEFAULT, help="Official PDF URL to store in CSV")
    args = ap.parse_args()

    if not os.path.exists(args.csv):
        print(f"CSV not found: {args.csv}", file=sys.stderr)
        return 2
    if not os.path.exists(args.pdf):
        print(f"PDF not found: {args.pdf}", file=sys.stderr)
        return 2

    headers, existing_rows = _read_csv_rows(args.csv)
    required_headers = [
        "country",
        "chain",
        "item",
        "size_label",
        "grams",
        "ml",
        "calories",
        "protein_g",
        "carbs_g",
        "fat_g",
        "fiber_g",
        "sugar_g",
        "source_url",
    ]
    if headers != required_headers:
        print("Unexpected CSV headers. Refusing to write.", file=sys.stderr)
        return 2

    new_rows = _extract_rows_from_pdf(args.pdf, args.source_url)
    if not new_rows:
        print("No rows extracted from PDF (nothing to import).", file=sys.stderr)
        return 2

    existing_keys = set()
    for r in existing_rows:
        existing_keys.add((r.get("country", ""), r.get("chain", ""), r.get("item", ""), r.get("size_label", "")))

    unique_new = []
    for r in new_rows:
        key = (r["country"], r["chain"], r["item"], r["size_label"])
        if key in existing_keys:
            continue
        existing_keys.add(key)
        unique_new.append(r)

    if not unique_new:
        print("All extracted rows already exist in CSV (no changes).")
        return 0

    insert_at = 1
    for i, r in enumerate(existing_rows):
        if r.get("country") == "AU" and r.get("chain") == "McDonald's":
            insert_at = i + 1

    updated = existing_rows[:insert_at] + unique_new + existing_rows[insert_at:]
    _write_csv_rows(args.csv, headers, updated)

    print(f"Imported {len(unique_new)} new rows into {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
