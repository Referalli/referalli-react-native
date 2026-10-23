# Changelog

All notable changes to `@referalli/react-native` are documented here.
This project follows [Semantic Versioning](https://semver.org/); before 1.0, minor versions may break.

## 0.1.0 (unreleased)

- First release.
- `configure(publishableKey, options)`, `getReferral()`, `trackSignup(customerRef)`.
- Referral links via `Linking` (initial URL and `url` events): `via`, `ref`, `ref_click_id`,
  `/go/<token>/<code>`.
- First open after install: Play Install Referrer (Android native module), then the API's
  deferred deep-link resolver; old installs (an existing user updating) are skipped.
- Native storage (SharedPreferences / NSUserDefaults); memory fallback in Expo Go.
- Expo config plugin: associated domains (iOS) and verified App Links (Android).
- Uses the `referalli` core client for the mobile attribution calls.
