# Mobile Refresh and Notification Audit

## Fixed

- Jobs and dashboard previously loaded only at mount. Visible screens now refresh
  on focus, foreground resume, successful changes and a 30-second interval.
- Expired tokens previously cleared disk storage but left the signed-in UI active.
  The API now resets auth state; startup validates saved sessions against `/auth/me`.
  A late response from an older token cannot invalidate a newer sign-in.
- Jobs load all pages rather than silently stopping at 200. Temporary refresh
  failures preserve the last successful records and show an error.
- Job-details failure no longer leaves an indefinite spinner. Retry is available.
- Primary/additional technicians have consistent job, update, invoice and alert
  access. Filters cannot override the technician's own assignment scope. A login
  without a staff link has no job access. The fallback database supports `$and`.
- Selected-technician dashboard links retain their technician filter; the admin
  Jobs menu resets that filter for the all-jobs view.
- Notifications use a high-priority Android channel with the packaged ringtone.
  Active-app polling presents only new unread alerts and preserves a dedupe ledger.
  Existing historical alerts are baselined on first upgrade, not replayed.
- Permission, push registration and missing setup status are visible in Settings.
  Registration retries on resume and at intervals. Clearing alerts also dismisses
  the phone tray. Push tokens are disabled on explicit account logout.
- Backend push requests are batched within Expo's 100-message limit, include the
  notification ID, log rejected tickets and disable unregistered device tokens.

## Verified

- 25 isolated backend regression tests passed, including start/end work responses,
  assignment restrictions, notification visibility, warranty and billing behavior.
- 6 JavaScript regression tests passed for refresh lifecycle, notification dedupe,
  pagination, auth invalidation and active-app phone notifications.
- All 23 mobile JavaScript modules compile with the installed Expo Babel preset.
- Android release APK builds successfully as version 1.0.12, version code 13.
- Firebase Android resources, the Expo project ID and notification ringtone are
  present in the APK. EAS FCM V1 upload is confirmed by the user's screenshot.
- Signing certificate matches the previous local 1.0.10 APK. Package ID remains
  `com.anonymous.mobile`, allowing an in-place update of that build.

## Still Required

- Firebase/Expo credentials are configured, but background delivery must still
  be verified on a phone after installation and backend deployment.
- Deploy the backend changes before testing additional-technician access and the
  updated remote-push channel. Changes are local until committed and deployed.
- No physical phone or emulator is connected. On-device installation, tap routing,
  sound playback, OEM battery restrictions and foreground/background delivery
  remain to be verified on a handset. Android force-stop blocks background push.
- An Expo accepted ticket is not confirmation of device delivery; receipts and a
  handset test are required once Firebase credentials are configured.
