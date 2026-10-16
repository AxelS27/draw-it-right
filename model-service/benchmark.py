"""Exercise the actual /predict HTTP boundary with 40-image batches.

Usage: python model-service/benchmark.py http://127.0.0.1:8080
       python model-service/benchmark.py https://your-current-tunnel.trycloudflare.com
"""
import base64
import json
import random
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parent


def sample(seed: int) -> str:
    rng = random.Random(seed)
    image = np.full((500, 800, 3), 255, dtype=np.uint8)
    size = rng.choice((4, 8, 16))
    kind = seed % 4
    if kind == 0:
        cv2.circle(image, (400, 250), rng.randrange(60, 130), (0, 0, 0), size)
    elif kind == 1:
        corners = np.array([(300, 350), (300, 175), (400, 80), (500, 175), (500, 350)], np.int32)
        cv2.polylines(image, [corners], True, (0, 0, 0), size)
    elif kind == 2:
        cv2.line(image, (150, 120), (650, 360), (0, 0, 0), size)
        cv2.line(image, (150, 360), (650, 120), (0, 0, 0), size)
    else:
        points = [(rng.randrange(120, 680), rng.randrange(70, 430)) for _ in range(8)]
        cv2.polylines(image, [np.array(points, np.int32)], False, (0, 0, 0), size)
    jpeg = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 72])[1].tobytes()
    return 'data:image/jpeg;base64,' + base64.b64encode(jpeg).decode()


def main(url: str) -> None:
    secret = (ROOT / '.local-secret').read_text().strip()
    images = [sample(index) for index in range(160)]
    print('Generated 160 distinct 800x500 JPEG canvases, 4-16 px black strokes, quality 72.')

    def request(batch: list[str]) -> float:
        payload = json.dumps({'prompt': 'house', 'images': batch}).encode()
        http = urllib.request.Request(url.rstrip('/') + '/predict', data=payload,
            headers={'Content-Type': 'application/json', 'X-Inference-Secret': secret})
        start = time.monotonic()
        with urllib.request.urlopen(http, timeout=110) as response:
            predictions = json.load(response)['predictions']
        elapsed = time.monotonic() - start
        if len(predictions) != 40 or any(not item or not 0 <= item['targetConfidence'] <= 1 for item in predictions):
            raise RuntimeError('Missing or invalid predictions')
        return elapsed

    for count in (1, 2, 4):
        start = time.monotonic()
        with ThreadPoolExecutor(max_workers=count) as pool:
            durations = list(pool.map(request, (images[i * 40:(i + 1) * 40] for i in range(count))))
        print(f'{40 * count} images across {count} simultaneous batch(es): total {time.monotonic() - start:.2f}s, '
              f'per-batch {list(round(value, 2) for value in durations)}s, mean {statistics.mean(durations):.2f}s')


if __name__ == '__main__':
    if len(sys.argv) != 2 or not sys.argv[1].startswith(('http://127.0.0.1:', 'https://')):
        raise SystemExit('Usage: python model-service/benchmark.py http://127.0.0.1:8080 | https://TUNNEL')
    main(sys.argv[1])
