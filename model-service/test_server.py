import base64
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import cv2
import numpy as np
from server import CLASSES, Handler, preprocess, predict


def drawing(blank=False):
    pixels = np.full((500, 800, 3), 255, dtype=np.uint8)
    if not blank:
        cv2.circle(pixels, (400, 250), 80, (0, 0, 0), 8)
    encoded = cv2.imencode('.jpg', pixels, [cv2.IMWRITE_JPEG_QUALITY, 72])[1].tobytes()
    return 'data:image/jpeg;base64,' + base64.b64encode(encoded).decode()


class InferenceTests(unittest.TestCase):
    def test_preprocessing_and_batch(self):
        ink, empty = drawing(), drawing(blank=True)
        self.assertEqual(preprocess(ink).shape, (28, 28, 1))
        self.assertIsNone(preprocess(empty))
        result = predict([ink] * 40)
        self.assertEqual(len(result), 40)
        self.assertIn(result[0]['class'], CLASSES)
        self.assertEqual(predict([empty, ink])[0], None)

    def test_authenticated_http_endpoint(self):
        os.environ['INFERENCE_SECRET'] = 'test-only-secret'
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/predict'
            data = json.dumps({'prompt': 'circle', 'images': [drawing()]}).encode()
            with self.assertRaises(urllib.error.HTTPError) as denied:
                urllib.request.urlopen(urllib.request.Request(url, data=data))
            self.assertEqual(denied.exception.code, 403)
            request = urllib.request.Request(url, data=data, headers={'X-Inference-Secret': 'test-only-secret'})
            with urllib.request.urlopen(request) as response:
                result = json.load(response)['predictions'][0]
            self.assertIn(result['class'], CLASSES)
            self.assertTrue(0 <= result['targetConfidence'] <= 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
