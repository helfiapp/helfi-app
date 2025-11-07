import io
import os
import uuid
from typing import Optional

import pandas as pd
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    send_file,
    flash,
    abort,
)
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="static",
    )

    # Configuration
    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_UPLOAD_MB", "10")) * 1024 * 1024
    app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "uploads")
    app.config["ALLOWED_EXTENSIONS"] = {"csv"}

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    PREVIEW_ROWS = 200

    @app.context_processor
    def inject_globals():
        # Expose a small number for templates; avoid exposing entire config
        return {
            "max_upload_mb": int(app.config["MAX_CONTENT_LENGTH"] / (1024 * 1024)),
        }

    def allowed_file(filename: str) -> bool:
        return "." in filename and filename.rsplit(".", 1)[1].lower() in app.config["ALLOWED_EXTENSIONS"]

    def parse_csv_bytes(file_bytes: bytes) -> pd.DataFrame:
        """Attempt to parse CSV bytes with several encodings and automatic delimiter sniffing.

        Uses pandas with sep=None and engine='python' to infer delimiters. Tries common encodings
        for robustness without external dependencies.
        """
        if not file_bytes or len(file_bytes) == 0:
            raise ValueError("Uploaded file is empty.")

        candidate_encodings = ["utf-8", "utf-8-sig", "cp1252", "latin1"]
        last_error: Optional[Exception] = None

        for enc in candidate_encodings:
            try:
                text_stream = io.StringIO(file_bytes.decode(enc))
                # sep=None triggers python engine to sniff delimiter
                df = pd.read_csv(text_stream, sep=None, engine="python")
                return df
            except Exception as e:  # noqa: BLE001 - intentional wide catch for robustness here
                last_error = e
                continue

        raise ValueError(
            f"Unable to parse CSV using common encodings ({', '.join(candidate_encodings)}). "
            f"Last error: {last_error}"
        )

    @app.errorhandler(RequestEntityTooLarge)
    def handle_file_too_large(_e):  # type: ignore[override]
        flash(
            f"File too large. Max file size is {int(app.config['MAX_CONTENT_LENGTH'] / (1024*1024))} MB.",
            "error",
        )
        return redirect(url_for("index"))

    @app.route("/", methods=["GET"])
    def index():
        return render_template("index.html")

    @app.route("/upload", methods=["POST"])
    def upload_file():
        if "file" not in request.files:
            flash("No file part in the request.", "error")
            return redirect(url_for("index"))

        file = request.files["file"]
        if file.filename == "":
            flash("No file selected.", "error")
            return redirect(url_for("index"))

        filename = secure_filename(file.filename)
        if not allowed_file(filename):
            flash("Invalid file type. Please upload a .csv file.", "error")
            return redirect(url_for("index"))

        try:
            # Read all bytes once; reuse for parsing and saving
            file_bytes = file.read()
            df = parse_csv_bytes(file_bytes)

            # Duplicate detection across all columns; mark all occurrences
            duplicates = df[df.duplicated(keep=False)]

            # Persist files to disk, reference by a small token in session (robust vs cookie size limits)
            upload_id = uuid.uuid4().hex
            session["upload_id"] = upload_id

            original_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{upload_id}_original.csv")
            duplicates_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{upload_id}_duplicates.csv")

            # Save original exactly as uploaded (bytes)
            with open(original_path, "wb") as f:
                f.write(file_bytes)

            # Save duplicates as CSV; even if empty, create a valid CSV with headers
            # Use index=False for a clean CSV
            duplicates.to_csv(duplicates_path, index=False)

            # Prepare previews for UI (limit rows to keep UI fast)
            original_total = len(df)
            duplicates_total = len(duplicates)
            unique_duplicate_rows = len(duplicates.drop_duplicates())

            original_preview_html = df.head(PREVIEW_ROWS).to_html(index=False, classes="dataframe")
            duplicates_preview_html = duplicates.head(PREVIEW_ROWS).to_html(index=False, classes="dataframe")

            return render_template(
                "results.html",
                original_preview_html=original_preview_html,
                duplicates_preview_html=duplicates_preview_html,
                original_total=original_total,
                duplicates_total=duplicates_total,
                unique_duplicate_rows=unique_duplicate_rows,
                preview_rows=PREVIEW_ROWS,
                has_duplicates=duplicates_total > 0,
            )
        except ValueError as ve:
            flash(str(ve), "error")
            return redirect(url_for("index"))
        except Exception as e:  # noqa: BLE001 - wide catch to surface message to user
            flash(f"Error processing file: {e}", "error")
            return redirect(url_for("index"))

    @app.route("/download/duplicates", methods=["GET"])
    def download_duplicates():
        upload_id = session.get("upload_id")
        if not upload_id:
            flash("No recent upload found. Please upload a CSV first.", "error")
            return redirect(url_for("index"))

        duplicates_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{upload_id}_duplicates.csv")
        if not os.path.exists(duplicates_path):
            flash("Duplicates file not found. Please re-upload your CSV.", "error")
            return redirect(url_for("index"))

        # If file exists but has 0 rows (other than header), still allow download
        try:
            return send_file(
                duplicates_path,
                as_attachment=True,
                download_name="duplicates.csv",
                mimetype="text/csv",
            )
        except Exception:
            abort(404)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)


