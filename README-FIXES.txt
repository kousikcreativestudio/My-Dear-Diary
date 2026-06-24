MY DEAR DIARY - FIXED BUILD

Important Firebase setup:

1. Publish firestore.rules in Firebase Console > Firestore Database > Rules.
2. Publish storage.rules in Firebase Console > Storage > Rules.
3. Enable Email/Password and Google providers in Firebase Authentication.
4. Add your deployed website domain to Authentication > Settings > Authorized domains.
5. Serve this folder through HTTPS. Do not open index.html directly with file://.

Main repairs included:

- Complete encrypted backup and restore for diary entries, vault entries,
  time capsules, local capsules, profile, themes, rewards, and vault verifier.
- Vault password changes re-encrypt existing encrypted secrets.
- Auto Lock now requires account re-authentication.
- Photos and videos use Firebase Storage instead of exceeding Firestore limits.
- Saved rich text is sanitized before storage/display.
- Service worker registration and PWA icon were added.
- Profile, counters, streaks, achievements, and rewards now use working hooks.

The original source folder was not changed.
