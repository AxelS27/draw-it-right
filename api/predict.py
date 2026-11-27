import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

from ._inference import predict


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        secret = os.environ.get("INFERENCE_SECRET", "")
        if not secret or not hmac.compare_digest(
            self.headers.get("X-Inference-Secret", ""), secret
        ):
            self.respond(403, {"error": "Forbidden"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 7_500_000:
            self.respond(413, {"error": "Request too large"})
            return

        try:
            body = json.loads(self.rfile.read(length))
            predictions = predict(body["images"], body["prompt"])
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
