#!/usr/bin/env python3
"""
Import Guzman y Gomez (Australia) nutrition data from the official GYG AU PDF.

Source (official): https://www.guzmanygomez.com.au/nutrition/
PDF currently linked as of Jan 28, 2026.

Output format matches data/food-overrides/fast_food_menus.csv columns.
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
from dataclasses import dataclass
from typing import Iterable, Optional

import pdfplumber
import requests


PDF_URL = "https://www.guzmanygomez.com.au/wp-content/uploads/2026/02/260128_NUTRITION_ALLERGEN_GUIDE_420X297MM.pdf"
SOURCE_URL = "https://www.guzmanygomez.com.au/nutrition/"

COUNTRY = "AU"
CHAIN = "Guzman y Gomez"


NUM_RE = re.compile(r"^\d+(?:\.\d+)?$")


def _fmt_num(x: float) -> str:
    if abs(x - int(x)) < 1e-9:
        return str(int(x))
    s = f"{x:.3f}".rstrip("0").rstrip(".")
    return s


def _to_title(s: str) -> str:
    # Keep it simple: "CALI BURRITO" -> "Cali Burrito", "LITTLE G’S" -> "Little G's"
    s = s.replace("\u2019", "'").strip()
    s = " ".join(s.split())
    return s.title()


def _clean_section_line(line: str) -> Optional[str]:
    line = line.strip()
    if not line:
        return None

    # Many pages have headers like "SERVE SIZE ENERGY ..." (not a real section).
    # Sometimes the section name and headers are on the same line; keep only the section part.
    if "SERVE SIZE" in line:
        before = line.split("SERVE SIZE", 1)[0].strip(" ,")
        line = before

    line = line.strip()
    if not line:
        return None

    # Skip obvious non-sections.
    if line in {"NUTRITIONAL INFORMATION", "CARBOHYDRATE"}:
        return None
    if line.strip().isdigit():
        return None
    if line.startswith("(") or "(g)" in line and "(kJ)" in line:
        return None
    if "ENERGY" in line or "PROTEIN" in line or "TOTAL FAT" in line:
        return None

    # Section headings are all caps in this PDF.
    if not line.isupper():
        return None

    return line or None


@dataclass(frozen=True)
class Row:
    section: str
    name: str
    size_label: str
    grams: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    sugar_g: float
    fiber_g: float

    def item_label(self) -> str:
        return f"{_to_title(self.section)} - {self.name}"


def _split_size_label(name: str) -> tuple[str, Optional[str]]:
    # Turn "... - Small/Medium/Large" into a serving-size dropdown.
    # We only do this for true size words; we do NOT treat "Mild/Spicy" as sizes.
    cleaned = (
        name.replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2212", "-")
        .strip()
    )

    m = re.match(r"^(.*?)(?:\s*-\s*)(Small|Medium|Large)$", cleaned, flags=re.IGNORECASE)
    if m:
        base = m.group(1).strip()
        size = m.group(2).title()
        return (base, size)

    # Special-case: "Family Fries" is clearly a size in the PDF.
    m2 = re.match(r"^(.*?)(?:\s*-\s*)(Family Fries)$", cleaned, flags=re.IGNORECASE)
    if m2:
        base = m2.group(1).strip()
        return (base, "Family")

    return (name.strip(), None)


def _parse_data_line(line: str) -> Optional[Row]:
    # Skip modifier / delta lines like:
    # "For spicy add + 30 + 85 + 20 ..."
    # "Swap White Rice for Brown Rice 0 - 60 - 14 ..."
    lo = line.lower()
    if lo.startswith("for spicy add") or lo.startswith("swap ") or lo.startswith("add "):
        return None
    if "+" in line:
        # In this PDF, these are deltas/swaps, not full item rows.
        return None

    parts = line.split()
    if len(parts) < 12:
        return None

    nums: list[str] = []
    i = len(parts) - 1
    while i >= 0 and len(nums) < 10:
        tok = parts[i]
        if NUM_RE.match(tok):
            nums.append(tok)
            i -= 1
        else:
            break

    if len(nums) != 10:
        return None

    nums = list(reversed(nums))
    name = " ".join(parts[: i + 1]).strip()
    if not name or name.isdigit():
        return None

    # Columns in the GYG AU PDF tables:
    # serve_size_g, energy_kJ, energy_cal, protein_g, total_fat_g, sat_fat_g,
    # carbohydrate_g, sugars_g, fibre_g, sodium_mg
    grams = float(nums[0])
    calories = float(nums[2])
    protein_g = float(nums[3])
    fat_g = float(nums[4])
    carbs_g = float(nums[6])
    sugar_g = float(nums[7])
    fiber_g = float(nums[8])

    base_name, size = _split_size_label(name)
    size_label = size or "1 serving"

    return Row(
        section="",
        name=base_name,
        size_label=size_label,
        grams=grams,
        calories=calories,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fat_g=fat_g,
        sugar_g=sugar_g,
        fiber_g=fiber_g,
    )


def extract_rows(pdf_bytes: bytes) -> list[Row]:
    rows: list[Row] = []
    section: Optional[str] = None

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw in text.split("\n"):
                line = raw.strip()
                if not line:
                    continue

                sec = _clean_section_line(line)
                if sec:
                    section = sec
                    continue

                if not section:
                    continue

                parsed = _parse_data_line(line)
                if not parsed:
                    continue

                rows.append(
                    Row(
                        section=section,
                        name=parsed.name,
                        size_label=parsed.size_label,
                        grams=parsed.grams,
                        calories=parsed.calories,
                        protein_g=parsed.protein_g,
                        carbs_g=parsed.carbs_g,
                        fat_g=parsed.fat_g,
                        sugar_g=parsed.sugar_g,
                        fiber_g=parsed.fiber_g,
                    )
                )

    # De-dupe, stable order.
    seen: set[tuple[str, str, str, float]] = set()
    out: list[Row] = []
    for r in rows:
        k = (r.section, r.name, r.size_label, r.grams)
        if k in seen:
            continue
        seen.add(k)
        out.append(r)

    return out


def download_pdf(url: str) -> bytes:
    r = requests.get(url, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    ct = (r.headers.get("content-type") or "").lower()
    if "pdf" not in ct and not r.content.startswith(b"%PDF"):
        raise RuntimeError(f"Expected PDF response, got content-type={ct!r}")
    return r.content


def write_csv(rows: Iterable[Row], out_fp) -> None:
    w = csv.writer(out_fp, lineterminator="\n")
    w.writerow(
        [
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
    )
    for r in rows:
        w.writerow(
            [
                COUNTRY,
                CHAIN,
                r.item_label(),
                r.size_label,
                _fmt_num(r.grams),
                "",
                _fmt_num(r.calories),
                _fmt_num(r.protein_g),
                _fmt_num(r.carbs_g),
                _fmt_num(r.fat_g),
                _fmt_num(r.fiber_g),
                _fmt_num(r.sugar_g),
                SOURCE_URL,
            ]
        )


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-url", default=PDF_URL)
    ap.add_argument("--out", default="-", help="Output CSV file path (default: stdout)")
    args = ap.parse_args(argv)

    pdf_bytes = download_pdf(args.pdf_url)
    rows = extract_rows(pdf_bytes)

    if args.out == "-":
        out_fp = sys.stdout
        write_csv(rows, out_fp)
    else:
        with open(args.out, "w", encoding="utf-8", newline="") as f:
            write_csv(rows, f)

    print(f"\n# Extracted rows: {len(rows)}", file=sys.stderr)
    print(f"# Source: {SOURCE_URL}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
