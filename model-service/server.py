"""Private batch inference for the Draw It Right QuickDraw model."""
import base64
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Constrain TensorFlow's thread pool for the laptop CPU and small containers.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("OMP_NUM_THREADS", "2")
import cv2
import numpy as np
import tensorflow as tf

ROOT = Path(__file__).resolve().parent
CLASSES = json.loads((ROOT / "class_names.json").read_text())
MODEL = tf.keras.models.load_model(ROOT / "best_quickdraw_model.keras", compile=False)
if MODEL.output_shape[-1] != len(CLASSES):
    raise RuntimeError("Model output count does not match its training class order")


def preprocess(image: str) -> np.ndarray | None:
    """Black ink on white JPEG -> white stroke on black, 28x28, as trained.

    Unlike the upstream demo, threshold before finding bounds: JPEG compression of
    an 800x500 canvas otherwise gives every near-white pixel a nonzero value.
    """
    if not isinstance(image, str) or not image.startswith("data:image/jpeg;base64,") or len(image) > 180000:
        raise ValueError("Expected a JPEG canvas")
    try:
        data = base64.b64decode(image.partition(",")[2], validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Invalid JPEG encoding") from exc
    if len(data) > 135000 or not data.startswith(b"\xff\xd8\xff") or not data.endswith(b"\xff\xd9"):
        raise ValueError("Invalid JPEG canvas")
    pixels = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None or pixels.shape != (500, 800):
        raise ValueError("Expected an 800x500 canvas")
    # Treat anti-aliased ink as grayscale but discard pale compression noise.
    strokes = 255 - pixels
    strokes[strokes < 32] = 0
    bounds = cv2.findNonZero(strokes)
    if bounds is None:
        return None
    x, y, width, height = cv2.boundingRect(bounds)
    pad = 10  # Keep the upstream inference crop and resize convention.
    cropped = strokes[max(0, y - pad):min(500, y + height + pad), max(0, x - pad):min(800, x + width + pad)]
    resized = cv2.resize(cropped, (28, 28), interpolation=cv2.INTER_AREA)
    return resized.astype(np.float32)[..., None] / 255.0


def predict(images: list[str]) -> list[dict | None]:
    if not isinstance(images, list) or len(images) > 40:
        raise ValueError("Expected at most 40 images")
    processed = []
    for image in images:
        try:
            processed.append(preprocess(image))
        except ValueError:
            # One broken upload must not block the entire room's results.
            processed.append(None)
    valid = [tensor for tensor in processed if tensor is not None]
    if not valid:
        return [None for _ in images]
    probabilities = MODEL.predict(np.stack(valid), batch_size=8, verbose=0)
    results: list[dict | None] = []
    index = 0
    for tensor in processed:
        if tensor is None:
            results.append(None)
        else:
            row = probabilities[index]
            top = int(np.argmax(row))
            results.append({"class": CLASSES[top], "confidence": float(row[top]), "targetConfidence": None, "probabilities": row.tolist()})
            index += 1
    return results


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"ok": True})
        else:
            self.respond(404, {"error": "Not found"})

    def do_POST(self):
        secret = os.environ.get("INFERENCE_SECRET", "")
        if self.path != "/predict" or not secret or not hmac.compare_digest(self.headers.get("X-Inference-Secret", ""), secret):
            self.respond(403, {"error": "Forbidden"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 7_500_000:
            self.respond(413, {"error": "Request too large"})
            return
        try:
            body = json.loads(self.rfile.read(length))
            images = body["images"]
            prompt = body["prompt"]
            if prompt not in CLASSES:
                raise ValueError("Unsupported prompt")
            predictions = predict(images)
            target = CLASSES.index(prompt)
            for prediction in predictions:
                if prediction is not None:
                    # Model is a softmax classifier; confidence is not calibrated certainty.
                    prediction["targetConfidence"] = prediction.pop("probabilities")[target]
            self.respond(200, {"predictions": predictions})
        except (KeyError, TypeError, ValueError) as exc:
            self.respond(400, {"error": str(exc)})

    def respond(self, status: int, body: dict):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    # Tunnel reaches localhost; don't expose the inference API to the LAN.
    ThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
