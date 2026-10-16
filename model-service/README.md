# QuickDraw inference on the presentation laptop

No Google Cloud or Hugging Face billing is required for this path. The browser, Firestore and Cloudflare Worker stay online; only the model runs on your laptop. The Worker sends **one batch of up to 40 images per room per round** over a temporary HTTPS Cloudflare Quick Tunnel. Laptop and tunnel must remain online for the entire match. Quick Tunnels are intended for testing, have no uptime guarantee, and change URL on every restart: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

Source model: https://github.com/idkwhoamitho/DL-Model-GameGuessing at commit `ee23c61b3d07d4afb25eedbbba6f6493aaac146d`. The 60 MB model is ignored by Git. The training notebook uses `inference.py`'s `CLASSES` order, **not** its alphabetical `class_names.json`. The upstream repo has no license; confirm permission before public redistribution.

## One-time setup (PowerShell, from project root)

1. Install Python 3.10/3.11. Create a virtual environment: `py -3.10 -m venv model-service/.venv` (use `-3.11` if that's the version you have), then `./model-service/.venv/Scripts/python.exe -m pip install -r model-service/requirements.txt`.
2. Run `./model-service/.venv/Scripts/python.exe model-service/download-model.py` to fetch and SHA-256-verify the pinned model. If the artifact is already present it only verifies it.
3. On this laptop, `model-service/cloudflared.exe` has already been downloaded from the [official Cloudflare release](https://developers.cloudflare.com/tunnel/downloads/) and is ignored by Git. On another laptop, download the 64-bit Windows executable from that page to the same path. No Cloudflare account/domain is needed for a Quick Tunnel. On Windows, update this executable manually when needed.
4. This laptop already has a random shared secret in `model-service/.local-secret` (ignored by Git). On a fresh machine only, create one locally (never commit or paste it into chat):

   ```powershell
   $secret = & ./model-service/.venv/Scripts/python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
   [System.IO.File]::WriteAllText((Join-Path (Get-Location) 'model-service/.local-secret'), $secret)
   Remove-Variable secret
   ```

   `model-service/.local-secret` is ignored by Git. Keep this file private; if leaked, generate a new one and update the Worker secret.

## At each test / presentation

1. In terminal A, from the project root, start the model. Keep this terminal running:

   ```powershell
   $env:INFERENCE_SECRET = [System.IO.File]::ReadAllText((Join-Path (Get-Location) 'model-service/.local-secret')).Trim()
   ./model-service/.venv/Scripts/python.exe model-service/server.py
   ```

   The server listens only on `127.0.0.1:8080`. Check `http://127.0.0.1:8080/health` locally.
2. In terminal B, run `./model-service/cloudflared.exe tunnel --url http://127.0.0.1:8080` and keep it running. Copy the newly generated `https://...trycloudflare.com` URL. Do **not** submit drawings from browsers directly to the tunnel. Only the Worker should have the secret.
3. From terminal C in `worker/`, set Cloudflare Worker secrets **before** deploying the new Worker code. `npx wrangler secret put INFERENCE_SECRET` prompts for the contents of `.local-secret`; `npx wrangler secret put INFERENCE_URL` prompts for the full HTTPS tunnel URL (no `/predict` suffix). Wrangler can deploy on `secret put`, so have both the model and tunnel running first. Then run `npm run deploy` in `worker/`. The Worker will refuse to invent scores if inference is unreachable.
4. Confirm `/health` through the tunnel, run a two-account match, and benchmark 40 near-simultaneous drawings **before the presentation**. Do not let the laptop sleep or close either process. After a tunnel restart its URL changes, so repeat `npx wrangler secret put INFERENCE_URL` before the next live match.

Benchmark on this laptop (October 2026): cold Python server loaded the model in about 4.0 seconds. Over a public Quick Tunnel, 40 synthetic 800x500 JPEG drawings in one batch took 0.36 seconds; 80 drawings over two simultaneous batches took 0.58 seconds total; 160 drawings over four simultaneous batches took 1.31 seconds total. All predictions were returned. Reproduce with `python model-service/benchmark.py https://CURRENT-TUNNEL.trycloudflare.com`. These are **warm synthetic HTTP tests**, not a full 40-player match or a real drawing accuracy test; the temporary tunnel was stopped and its URL is no longer usable.

**Important:** changing Worker secrets can immediately update the deployed Worker. Only switch away from the already-live mock Worker once steps 1 and 2 are working. During downtime in the model, live rounds can remain on judging and retry every 5 seconds. For a long-term always-on product, use a managed service instead of a Quick Tunnel.

## Model check

`./model-service/.venv/Scripts/python.exe -m unittest discover -s model-service -p 'test_*.py'` verifies the model, 40-image batch, blank canvas and secret-protected HTTP endpoint. Canvas input is an 800x500 black-on-white JPEG; preprocessing removes JPEG noise, inverts strokes to white-on-black, crops with 10 px padding, resizes with OpenCV `INTER_AREA` to 28x28 and normalizes. The source repository's smiley-face test image was misclassified by this model. Softmax confidence is **not calibrated accuracy**. Validate predictions using real game drawings before counting on AI judging in a public demo.
