"""ONNX batch inference for the Draw It Right QuickDraw YOLOv8-cls model."""
import base64
import io
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parent
CLASSES: list[str] = json.loads((ROOT / "classes.json").read_text(encoding="utf-8"))
SESSION = ort.InferenceSession(str(ROOT / "model.onnx"), providers=["CPUExecutionProvider"])
INPUT_NAME = SESSION.get_inputs()[0].name


def preprocess(image: str) -> np.ndarray | None:
    """Black ink on white JPEG -> white stroke on black, 64x64 RGB float32 [0, 1]."""
    if not isinstance(image, str) or not image.startswith("data:image/jpeg;base64,") or len(image) > 180000:
        raise ValueError("Expected a JPEG canvas")
    try:
        data = base64.b64decode(image.partition(",")[2], validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Invalid JPEG encoding") from exc
    if len(data) > 135000 or not data.startswith(b"\xff\xd8\xff") or not data.endswith(b"\xff\xd9"):
        raise ValueError("Invalid JPEG canvas")

    with Image.open(io.BytesIO(data)) as img:
        gray = img.convert("L")
        if gray.size != (800, 500):
            raise ValueError("Expected an 800x500 canvas")
        pixels = np.asarray(gray, dtype=np.uint8)

    strokes = 255 - pixels
    strokes[strokes < 32] = 0
    ys, xs = np.nonzero(strokes)
    if ys.size == 0:
        return None

    x0 = max(0, int(xs.min()) - 10)
    y0 = max(0, int(ys.min()) - 10)
    x1 = min(800, int(xs.max()) + 1 + 10)
    y1 = min(500, int(ys.max()) + 1 + 10)
    cropped = Image.fromarray(strokes[y0:y1, x0:x1], mode="L")
    resized = np.asarray(cropped.resize((64, 64), Image.Resampling.BOX), dtype=np.float32) / 255.0
    # Grayscale repeated to 3 channels (CHW) matches Ultralytics RGB [0, 1] input.
    return np.repeat(resized[np.newaxis, :, :], 3, axis=0)


def predict(images: list[str], prompt: str) -> list[dict | None]:
    if not isinstance(images, list) or len(images) > 40:
        raise ValueError("Expected at most 40 images")
    if prompt not in CLASSES:
        raise ValueError("Unsupported prompt")

    processed: list[np.ndarray | None] = []
    for image in images:
        try:
            processed.append(preprocess(image))
        except ValueError:
            processed.append(None)

    valid = [tensor for tensor in processed if tensor is not None]
    if not valid:
        return [None for _ in images]

    batch = np.stack(valid, axis=0).astype(np.float32)
    probs_batch = SESSION.run(None, {INPUT_NAME: batch})[0]
    target = CLASSES.index(prompt)

    results: list[dict | None] = []
    index = 0
    for tensor in processed:
        if tensor is None:
            results.append(None)
        else:
            row = probs_batch[index]
            # Normalize via softmax only if the ONNX graph emits unnormalized logits.
            if float(row.min()) < 0.0 or abs(float(row.sum()) - 1.0) > 1e-2:
                shifted = row - np.max(row)
                exp_row = np.exp(shifted)
                row = exp_row / np.sum(exp_row)
            top = int(np.argmax(row))
            results.append({
                "class": CLASSES[top],
                "confidence": float(row[top]),
                "targetConfidence": float(row[target]),
            })
            index += 1
    return results
