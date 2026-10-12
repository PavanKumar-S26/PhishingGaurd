from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib


class ModelUnavailable(RuntimeError):
    pass


class Classifier:
    def __init__(self, artifact_path: Path):
        self.artifact_path = artifact_path
        self.artifact: dict[str, Any] | None = None
        self.error: str | None = None
        try:
            if not artifact_path.is_file():
                raise FileNotFoundError(f"Trained model not found at {artifact_path}. Run the ML training command first.")
            self.artifact = joblib.load(artifact_path)
            if not isinstance(self.artifact, dict) or "pipeline" not in self.artifact or "version" not in self.artifact:
                raise ValueError("The trained model artifact is incomplete.")
        except Exception as exc:
            self.error = str(exc)
            self.artifact = None

    @property
    def available(self) -> bool:
        return self.artifact is not None

    @property
    def version(self) -> str:
        if not self.artifact:
            raise ModelUnavailable(self.error or "Model is unavailable.")
        return str(self.artifact["version"])

    def predict(self, sender_email: str, subject: str, body: str) -> tuple[str, float]:
        if not self.artifact:
            raise ModelUnavailable(self.error or "The trained classifier is unavailable.")
        pipeline = self.artifact["pipeline"]
        content = f"sender: {sender_email}\nsubject: {subject}\nbody: {body}"
        probabilities = pipeline.predict_proba([content])[0]
        classes = list(pipeline.classes_)
        best_index = int(probabilities.argmax())
        return str(classes[best_index]), float(probabilities[best_index])

    def metadata(self) -> dict[str, Any] | None:
        if not self.artifact:
            return None
        return {key: value for key, value in self.artifact.items() if key != "pipeline"}
