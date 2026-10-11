# Android Push Setup

The APK shows local phone alerts for new unread notifications while Baangs is active.
Background/closed-app delivery requires Firebase Cloud Messaging and an Expo project.
Settings shows the registration status and provides permission/settings controls.

1. Create a Firebase Android app using package `com.anonymous.mobile`.
2. Put the downloaded `google-services.json` in `mobile/google-services.json`.
3. Set `expo.android.googleServicesFile` to `./google-services.json` in `app.json`.
4. Link an Expo/EAS project and set its real UUID in `expo.extra.eas.projectId`.
5. Upload the Firebase FCM V1 service-account credential using EAS credentials.
   Never put the service-account private key in the APK or commit it to Git.
6. Regenerate the native configuration, build an APK using the existing signing key,
   and deploy the backend changes.
7. Grant Android notification permissions, check the Baangs alerts channel, assign
   a test job, and test delivery with the app foregrounded, backgrounded and closed.
8. Review backend Expo ticket/receipt errors if delivery fails. A successful ticket
   only means accepted by Expo, not delivered to the handset.

References:
- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://docs.expo.dev/push-notifications/fcm-credentials/

## Update Verification

Install version 1.0.12 over the old APK without uninstalling. Test returning from a
job status update to the list, assigning another job in the admin website, opening
the app after backgrounding, and signing in again after an expired token. Jobs
refresh on focus/resume and every 30 seconds while their screen is visible. Failed
refreshes preserve the last loaded jobs and show an error. Backend access supports
primary/additional technicians and rejects users with no linked staff ID.

## Configured 2026-10-07

- Firebase Android configuration matches package `com.anonymous.mobile` and
  Firebase project `baangs-a505e`.
- Expo project ID: `1c209de7-c973-48ed-8833-32c36cc48b5d`.
- The user uploaded the matching FCM V1 service account to EAS (dashboard screenshot).
- The private service-account key is not included in the application.
- Backend deployment and handset delivery tests remain required.
