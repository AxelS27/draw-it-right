# Live match backend (Cloudflare Workers Free + Durable Objects)

The app keeps Google login, profiles, room membership, chat and reactions in Firebase Spark. Live match state, timers, drawings and coin balances live in Cloudflare SQLite-backed Durable Objects. No Firebase Cloud Functions, service-account key or Blaze billing is used.

## Deploy

1. Publish the latest `firestore.rules` in Firebase Console. Create a **new** room after publishing: old rooms may lack `joinOrder`.
2. Create/sign into a Cloudflare account on Workers Free. From `worker/`, run `npm install` and `npx wrangler login`.
3. Set `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` to your exact deployed frontend origin (for local testing, leave `http://localhost:3000`; for both, separate origins with commas). Keep `FIREBASE_PROJECT_ID` set to the Firebase project's ID.
4. The Worker has been deployed for localhost testing at `https://draw-it-right-match.farrellaxel2006.workers.dev` (October 2026). To deploy future updates, run `npm --prefix worker run deploy`. This remote deployment has only passed unauthenticated `/health` and denied `/wallet` checks, not a live authenticated game.
5. The local ignored `.env.local` sets `VITE_MATCH_API_URL` to this Worker. For another browser or production frontend build, set that same variable in its build environment, then rebuild/deploy the frontend. Update `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` to include that exact frontend origin and redeploy the Worker. On localhost, start `npm --prefix worker run dev` (port 8787) and `npm run dev` (port 3000) in separate terminals.
6. Add the frontend domain to Firebase Authentication authorized domains if needed. Do not put ID tokens, API secrets or service account keys in build environment variables.

Cloudflare Free limits are daily and can stop requests if reached; monitor Workers and Durable Objects usage. The Worker authenticates Firebase ID tokens using Google's public keys, then reads the Firestore room using that same user's token and existing Firestore rules. No elevated Firestore credentials are used. Only joined room members can open a match socket or submit. The Worker validates deadlines, submissions and wallet purchases on the server. Match timers advance through Durable Object alarms even if browser tabs close.

## Current match behavior

- A host starts a 2+ player room in Firestore. The first joined player to connect opens the match in the room's Durable Object. All browsers receive the same prompt, phase and deadline over WebSockets. The live UI reuses the existing preview drawing, gallery, leaderboard and podium components rather than replacing their design.
- Reveal: 3 seconds; drawing: room timer; mock judging: 2 seconds; results gallery: 15 seconds; leaderboard: 10 seconds. Up to the configured number of rounds. Images autosave every 4 seconds while drawn; on deadline, the server submits the latest saved image. A tab that closes before its first autosave may have no submission.
- Mock judging **does not recognize drawings**. Submitted drawings get deterministic simulated points and 20 demo coins. The top three who submitted receive 150/100/50 additional coins. No claim of correct-object detection should be made in UI until an AI model is connected.
- A per-player Durable Object wallet starts at 0. Rewards are keyed by room code and rematch number so retries cannot pay twice. After rewards finish, the host can start a rematch in the same room. Currently the Shop frontend is still preview-only. These demo coins are not proof of accurate AI judging and public monetization needs anti-farming limits.
- Stored drawings are private to the room's Durable Object, returned to current members only after round results. Match state and balances persist through Worker restarts. Rooms and drawings are not automatically deleted; add retention policies before public launch.

## Verify before the 40-player demo

- Test with two browsers and distinct accounts: start, prompt reveal, draw, manual submit, auto-submit, results, final rankings, rematch and exactly-once coin rewards per match. Refresh and reconnect during each phase. Test host leaving, End room and connection loss.
- Test duplicate or late submissions, forged JWT, non-member access, forged drawing fetch, blank canvas, large payloads and no Worker connectivity.
- Load-test 40 concurrent players for a complete match using the deployed Worker, and inspect both Cloudflare usage and Firebase Spark read/write quotas. This has **not** been performed here; a build and local unauthenticated HTTP smoke test do not verify a live multiplayer match.

The Worker must be deployed before clicking Start. Do not expose the match UI as production-ready before an authenticated, multi-account end-to-end run succeeds.
