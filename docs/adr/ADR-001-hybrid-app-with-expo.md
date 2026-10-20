# ADR-001: Hybrid app with Expo that generates the native apps

**Date**: 2026-10-04

**Status**: Accepted

## Context

The product must be mobile-only and available on iOS and Android. It needs native capabilities: camera to scan delivery notes and invoices, push notifications, biometrics and secure storage.

Constraints:

- One person and 22 days until delivery.
- The backend is TypeScript.
- The result must be distributable as one native iOS app and one native Android app.

## Options Considered

1. **Native SwiftUI**
   - Maximum development speed thanks to prior experience.
   - Covers iOS only; Android would require a second app.

2. **Expo + React Native, generating the native apps**
   - One codebase for iOS and Android.
   - Same language as the backend; shared contracts.
   - Official modules for camera, push, biometrics and secure storage.
   - React Native learning curve.

3. **Expo embedded in native containers (Swift and Kotlin)**
   - React Native code is packaged as an XCFramework and an AAR, and hosted by one native app per platform.
   - Two more native projects and a two-step build pipeline.
   - Expo's isolated approach is recent.

4. **Ionic + Capacitor**
   - Hybrid in the strict sense: a web application inside a native container.
   - Reuses web tooling and gives a browser version for free.
   - Less native experience.

5. **Flutter**
   - Good performance and a single codebase.
   - Forces Dart and breaks the single language shared with the backend.

## Decision

Use **Expo + React Native + TypeScript**, letting Expo generate the native iOS and Android projects and their binaries (option 2).

## Rationale

- **Coverage**: iOS and Android with a single development effort.
- **Single language**: the schemas in the contracts package validate on the server and type the app, which reduces integration errors.
- **Fit with the master's program**: React, Testing Library and Sentry carry over almost directly.
- **Simplicity compared with option 3**: avoids two container projects and about two days of extra work, without closing that door.

## Consequences

### Positive

- Simple monorepo: `apps/mobile`, `apps/api`, `packages/contracts`.
- Binaries for both platforms from CI with EAS Build.
- All native functionality through Expo modules, without writing Swift or Kotlin.

### Negative

- The speed SwiftUI would give is given up.
- React Native learning curve with the deadline running.
- Android is validated only on an emulator during the thesis.

### Safeguard

Configuration (API URL, cooperative, theme) is injected instead of hardcoded. If the app ever has to be embedded in another native application (option 3), it can be packaged without rewriting it.

## References

- Expo SDK 56: https://expo.dev/changelog/sdk-56.md
- Expo brownfield, isolated approach: https://docs.expo.dev/brownfield/isolated-approach/
- React Native Brownfield (Callstack): https://oss.callstack.com/react-native-brownfield
