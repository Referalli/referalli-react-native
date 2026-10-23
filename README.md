# @referalli/react-native

Referral attribution for React Native and Expo apps: referral links, Play Install Referrer,
deferred deep links and signup tracking for [Referalli](https://referalli.com).
No advertising id, no clipboard access, no App Tracking Transparency prompt.

```sh
npm install @referalli/react-native
cd ios && pod install   # bare React Native
```

Expo: add the config plugin and use a [development build](https://docs.expo.dev/develop/development-builds/introduction/)
(Expo Go has no native module, so the referral is kept in memory only there).

```json
{
  "expo": {
    "plugins": [["@referalli/react-native", { "domains": ["app.example.com"] }]]
  }
}
```

## Use

```ts
import Referalli from '@referalli/react-native';

// Once, at startup. The tracking token (Settings → Tracking) is public and safe to ship.
Referalli.configure('tk_…', { programId: 'prg_…' });

// On first screen: the referral for this install, or null.
const referral = await Referalli.getReferral();
if (referral?.destination) navigateTo(referral.destination);
if (referral?.code) showInvitedBy(referral.code);

// After signup (customerRef is your user id, the same one your billing uses):
const { attributed } = await Referalli.trackSignup(user.id);
```

Also available: `handleUrl(url)` for URLs you receive outside `Linking` (push notifications),
`setReferral(code)` for an invite-code field, `addReferralListener(fn)` for links opened while the
app runs, `resolveDeferred()` and `reset()`.

## How the referral is found

`getReferral()` returns the first of:

1. **A link.** A referral link (`https://<link-domain>/go/<token>/<code>`) redirects to the link's
   destination with `?via=<code>&ref_click_id=<click>`. When the destination is a universal link
   (iOS) or App Link (Android) of your app, the app opens and the SDK stores the click. The SDK
   listens to `Linking` itself (`listenForLinks: false` turns that off).
2. **The Play Install Referrer** (Android, first open): point the destination at your Play listing
   with the referral inside `referrer`, e.g.
   `https://play.google.com/store/apps/details?id=com.example&referrer=via%3D<code>`.
3. **A deferred match** (first open, within an hour of the click): the API matches the device's
   IP address to a recent click and returns its click id and destination.

Steps 2 and 3 run once per install, and not at all when the app was installed more than 24 hours
before the SDK first ran (an existing user updating). A link opened later replaces the referral.

### Universal links and App Links

`domains` in the plugin adds `applinks:<domain>` to the iOS entitlements and a verified
`autoVerify` intent filter on Android. Your domain must serve
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` for your app. In a
bare app add the same entitlement in Xcode and the intent filter in `AndroidManifest.xml`.

## Purchases

The app holds only the public tracking token, so it cannot create commissions. Send purchases to
your backend, validate the store receipt there, and report them with the server SDK
(`client.trackMobilePurchase(...)` in `referalli`, i.e. `POST /v1/mobile/purchases` with a secret
API key).

## Privacy and App Tracking Transparency

- The SDK stores a random install id and the captured referral on the device, and sends them plus
  the `customerRef` you pass to `trackSignup` to Referalli. It never reads the IDFA, IDFV,
  Android advertising id or the clipboard, and it does not link `AppTrackingTransparency`.
- Links (step 1) and the Play Install Referrer (step 2) are deterministic and user-initiated.
- The deferred match (step 3) is probabilistic: the API compares the IP address of the first app
  open with recent link clicks. Apple's rules treat combining data from other companies' apps or
  websites for advertising measurement as *tracking*, and forbid fingerprinting regardless of
  consent. Whether a referral program link counts depends on your program (your own
  invite-a-friend links on your own domain are first-party; paid affiliate placements on
  third-party sites can count as ad measurement). If you are unsure, set
  `deferredResolution: false`, and call `resolveDeferred()` only after the user has granted ATT
  permission through your own prompt, or not at all. Links and the install referrer keep working
  without it.
- The iOS native module ships a `PrivacyInfo.xcprivacy` (no tracking; User ID and Device ID for
  app functionality and analytics; UserDefaults reason `CA92.1`).

## Platform support

React Native 0.71+ (old and new architecture through the interop layer), iOS 15.1+, Android
minSdk 21. The Android module brings `com.android.installreferrer:installreferrer`.

## License

MIT. See [LICENSE](LICENSE).
