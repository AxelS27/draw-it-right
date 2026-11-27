import hmac
import json
import os
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        secret = os.environ.get("INFERENCE_SECRET", "")
        authorized = bool(secret) and hmac.compare_digest(
            self.headers.get("X-Inference-Secret", ""), secret
        )
        encoded = json.dumps({"ok": True, "authorized": authorized}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
