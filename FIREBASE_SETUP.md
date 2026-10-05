# Firebase setup

1. In Firebase Console, enable Authentication > Sign-in method > Google.
2. Add localhost and your production domain under Authentication > Settings > Authorized domains.
3. Open Build > Firestore Database > Create database. Use the default database and production mode. Choose a region near your users.
4. Open Firestore > Rules, paste `firestore.rules`, and Publish. Review and merge rather than replace if the project already has other collections/rules.

No service-account key belongs in this frontend. The Firebase web config is public.

## Flow

After authentication, the app reads `profiles/{uid}` from the server. A missing or incomplete profile opens `/#setup`: username, then character. Read failures show retry rather than incorrectly classifying someone as a new user. Setup finishes only after the server confirms the write. Returning users skip setup. A pending room code remains in session storage until the authenticated player finishes profile setup, then opens the room invite. Room creation and joins use Firestore transactions and realtime listeners. Each account has a `roomMemberships/{uid}` index, updated atomically with a new room/join. Security rules reject entering a second active room even across tabs or devices.

Usernames currently function as display names, not unique handles. Format validation exists in both the UI and Firestore rules. A production name moderation policy/filter is still required before public launch. Character choices are an initial limited preset editor, not the full planned customization system. Rules allow only owners to read/write their profile, deny listing rooms, and do not allow score or currency fields. Signed-in users can read a room by its six-digit code. Room rules validate atomic joins, capacity, host actions, leaving, and player removal. Do not share room codes publicly.

## Manual verification (requires the live Console setup)

- New Google account: login, see centered setup modal and #setup, invalid names cannot continue.
- Pick a valid name, change character/color/expression/accessory, randomize/reset, go back without losing choices, save.
- Check navbar username and avatar. Refresh and sign out/in: no repeated setup.
- Login to another account: no previous user's profile is shown.
- Start with a six-digit room code: code is retained through setup and refresh, then the room summary opens.
- With two distinct Google accounts in separate browsers: create a room, copy invite link, confirm join, and verify both player lists update live.
- Check full capacity, locked room, host-only controls, player leave, host close, kick and banned rejoin, and start with fewer/more than two players.
- From the same account in two tabs, try creating/joining two rooms: the second must fail until the first is left or closed. After kick, leave, or close, joining another room should work. Leaving/closing must still work after Start.
- With three players, the host leaves: the first remaining joiner becomes host, and the room stays open. A host can instead choose Make host without leaving. Only the current host can transfer or end the room. A sole host leaving closes the room.
- Send messages in both browsers: they should appear in both chats, persist after refresh, and be inaccessible to someone who was removed. Direct writes with a forged sender or oversized text must fail.
- Send preset reactions from each browser: they should animate for all room members. Turning reactions off should hide controls; sending while disabled, sending a fake symbol, or sending more than once per second should be denied by rules.
- Run rule tests in the Firebase emulator before publishing changes: non-host settings/start/remove, spoofed player profile, over-capacity join, changed host, and direct score fields must fail.
- Deny Firestore access: show retry, not an empty profile or false success.
- Try keyboard navigation, Escape, mobile viewport and logout during setup.
- In Firestore Rules Playground, verify anonymous access, another UID, extra currency fields, and invalid avatar/name values are rejected.

Live Google OAuth, Firestore rules deployment, and multi-account tests require authorized access and have not been run by the coding agent. Publish the updated `firestore.rules` before using live rooms. Match start synchronizes only the `started` status; drawing, timing, and scoring are not live yet. Preset reactions work live in the waiting room only, using one rate-limited document per member. Room chat uses a realtime Firestore collection with the latest 100 messages; client-side copy and 160-character limits are not a substitute for moderation. Before a public launch for younger players, add a reporting and moderation workflow, spam controls, and message retention/deletion. A host may leave without ending the room: the earliest remaining joiner becomes the only host. The host may hand over host rights manually while staying as a player, or choose End room to close it for everyone. When the sole host leaves, the room closes. Closed rooms are not physically deleted. Player disconnects, closing a tab, and logout are NOT treated as leaving: automatic presence detection and idle cleanup require a server-side policy (for example Realtime Database presence plus Cloud Functions or a scheduled cleanup). Room documents, chat, reactions, and stale membership indexes remain in Firestore after closing; a server-side retention policy is still needed. For rooms created before the membership index was introduced, close those legacy rooms before relying on the single-room guarantee. Rooms created before `joinOrder` was introduced cannot recover historical join timestamps; their initial fallback order is based on stored player keys, so recreate legacy rooms for a guaranteed earliest-join handoff.
