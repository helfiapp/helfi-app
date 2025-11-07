# CSV Duplicate Finder (Flask + pandas)

A small Flask application to upload a CSV, identify duplicate rows based on all columns (marking all occurrences), preview results, and download a CSV of duplicates.

## Features
- Robust CSV parsing: tries multiple encodings and infers delimiters
- Identifies all occurrences of duplicates using `DataFrame.duplicated(keep=False)`
- Stores files on disk; keeps a small session token only (cookie safe)
- Previews the first 200 rows for both original and duplicate data
- Download duplicates as a CSV

## Requirements
- Python 3.9+
- See `requirements.txt`

## Setup
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

## Run
```bash
export FLASK_APP=app.py
export SECRET_KEY="change-me"
python app.py
# App runs on http://localhost:5000
```

## Notes
- Max upload size defaults to 10 MB. Change via `MAX_UPLOAD_MB` env var.
- Files are saved under `uploads/` adjacent to `app.py`.
- Session contains only a short `upload_id`; no large data stored in cookies.
- Duplicate detection uses all columns as-is. `NaN` values are treated as non-equal by pandas.

## Limitations
- Extremely large CSVs may be slow to parse; consider increasing resources or chunked processing for production use.
- If your CSV uses an uncommon encoding, save it as UTF-8 and retry.







