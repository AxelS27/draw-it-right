"""Download the pinned training artifact, checking integrity before deployment."""
import hashlib
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/idkwhoamitho/DL-Model-GameGuessing/ee23c61b3d07d4afb25eedbbba6f6493aaac146d/best_quickdraw_model.keras"
SHA256 = "07a7d339d8dd2501c3e59b464a9099b6c6fae6f4e12f63c2248b1284cdc3790f"
TARGET = Path(__file__).with_name("best_quickdraw_model.keras")
if TARGET.exists() and hashlib.sha256(TARGET.read_bytes()).hexdigest() == SHA256:
    print("Verified existing model")
else:
    temporary = TARGET.with_suffix(".download")
    try:
        urllib.request.urlretrieve(SOURCE, temporary)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != SHA256:
            raise RuntimeError("Model hash mismatch - refusing to deploy")
        temporary.replace(TARGET)
    finally:
        temporary.unlink(missing_ok=True)
    print("Downloaded and verified model")
