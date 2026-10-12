from __future__ import annotations

import hashlib
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "ml" / "data" / "emails.csv"
ARTIFACT_DIR = ROOT / "ml" / "artifacts"
ARTIFACT_PATH = ARTIFACT_DIR / "phishguard.joblib"
REQUIRED_LABELS = {"Legitimate", "Spam", "Phishing"}


def make_text(row: pd.Series) -> str:
    return f"sender: {row['sender_email']}\nsubject: {row['subject']}\nbody: {row['body']}"


def make_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("tfidf", TfidfVectorizer(lowercase=True, strip_accents="unicode", ngram_range=(1, 2), max_features=30_000, sublinear_tf=True)),
            ("classifier", LogisticRegression(max_iter=2_000, class_weight="balanced", random_state=17)),
        ]
    )


def main() -> None:
    if not DATA_PATH.is_file():
        raise SystemExit(f"Labeled dataset is missing: {DATA_PATH}")
    frame = pd.read_csv(DATA_PATH).fillna("")
    required = {"sender_email", "subject", "body", "label"}
    if not required.issubset(frame.columns):
        raise SystemExit(f"Dataset requires columns: {', '.join(sorted(required))}")
    frame["label"] = frame["label"].astype(str)
    labels = set(frame["label"])
    if labels != REQUIRED_LABELS:
        raise SystemExit(f"Dataset labels must be exactly: {', '.join(sorted(REQUIRED_LABELS))}; got {', '.join(sorted(labels))}")
    if (frame["label"].value_counts() < 4).any():
        raise SystemExit("At least four labeled examples per class are required for holdout evaluation and calibration.")

    texts = frame.apply(make_text, axis=1)
    X_train, X_test, y_train, y_test = train_test_split(
        texts, frame["label"], test_size=0.25, random_state=42, stratify=frame["label"]
    )
    baseline = make_pipeline().fit(X_train, y_train)
    predictions = baseline.predict(X_test)
    holdout_accuracy = float(accuracy_score(y_test, predictions))
    print(f"Stratified holdout accuracy on {len(y_test)} examples: {holdout_accuracy:.3f}")
    print(classification_report(y_test, predictions, zero_division=0))

    # Calibrate class probabilities using stratified folds over all available labeled data.
    calibrated = CalibratedClassifierCV(estimator=make_pipeline(), method="sigmoid", cv=3)
    calibrated.fit(texts, frame["label"])
    digest = hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()[:10]
    artifact = {
        "pipeline": calibrated,
        "version": f"pg-tfidf-lr-{digest}",
        "calibration": "sigmoid, stratified 3-fold cross-validation",
        "trained_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
        "dataset_name": "curated-demo-email-corpus",
        "dataset_rows": int(len(frame)),
        "class_counts": {str(key): int(value) for key, value in frame["label"].value_counts().sort_index().items()},
        "holdout_accuracy": holdout_accuracy,
        "holdout_size": int(len(y_test)),
        "holdout_seed": 42,
        "limitations": "Small curated demonstration corpus. Holdout score is not a production performance guarantee.",
    }
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, ARTIFACT_PATH)
    metadata = {key: value for key, value in artifact.items() if key != "pipeline"}
    (ARTIFACT_DIR / "model-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Trained calibrated model {artifact['version']} using {len(frame)} labeled examples.")
    print(f"Saved model: {ARTIFACT_PATH}")
    print("The included corpus is a small demonstration dataset. Replace it with reviewed, representative, permissioned data before production use.")


if __name__ == "__main__":
    main()
