# Firebase profile setup

1. In Firebase Console, enable Authentication > Sign-in method > Google.
2. Add localhost and your production domain under Authentication > Settings > Authorized domains.
3. Open Build > Firestore Database > Create database. Use the default database and production mode. Choose a region near your users.
4. Open Firestore > Rules, paste `firestore.rules`, and Publish. Review and merge rather than replace if the project already has other collections/rules.

No service-account key belongs in this frontend. The Firebase web config is public.

## Flow

After authentication, the app reads `profiles/{uid}` from the server. A missing or incomplete profile opens `/#setup`: username, then character. Read failures show retry rather than incorrectly classifying someone as a new user. Setup finishes only after the server confirms the write. Returning users skip setup. A pending room code remains in session storage; actual room validation/join and the main lobby are not implemented.

Usernames currently function as display names, not unique handles. Format validation exists in both the UI and Firestore rules. A production name moderation policy/filter is still required before public launch. Character choices are an initial limited preset editor, not the full planned customization system. Rules intentionally allow only owners to read/write their profile, deny listing and other collections, and do not allow score or currency fields.

## Manual verification (requires the live Console setup)

- New Google account: login, see centered setup modal and #setup, invalid names cannot continue.
- Pick a valid name, change character/color/expression/accessory, randomize/reset, go back without losing choices, save.
- Check navbar username and avatar. Refresh and sign out/in: no repeated setup.
- Login to another account: no previous user's profile is shown.
- Start with a six-digit room code: code is retained through setup and refresh.
- Deny Firestore access: show retry, not an empty profile or false success.
- Try keyboard navigation, Escape, mobile viewport and logout during setup.
- In Firestore Rules Playground, verify anonymous access, another UID, extra currency fields, and invalid avatar/name values are rejected.

Google OAuth and live Firestore/rules tests require authorized access and have not been run by the coding agent.
