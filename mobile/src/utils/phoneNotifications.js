import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import storage from './storage';
import { notificationsApi } from '../api';
import { publish } from './appEvents';
import { rememberNotifications, unseenNotifications } from './notificationState';

export const PHONE_CHANNEL = 'baangs-alerts-v2';
export const PHONE_SOUND = 'attendance_reminder.wav';
export const NOTIFICATION_STATUS_KEY = 'phoneNotificationStatus';

async function saveStatus(message) {
  await storage.setItem(NOTIFICATION_STATUS_KEY, message);
  publish('notificationStatus', message);
}

export async function configurePhoneNotifications() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PHONE_CHANNEL, {
      name: 'Baangs alerts', importance: Notifications.AndroidImportance.HIGH,
      sound: PHONE_SOUND, vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const permission = await Notifications.getPermissionsAsync();
  const access = permission.granted ? permission : await Notifications.requestPermissionsAsync();
  if (!access.granted) {
    await saveStatus('Phone notifications are blocked. Enable them in Android app settings.');
    return false;
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) {
    await saveStatus('Active-app alerts enabled. Background push needs Firebase and Expo project setup.');
    return false;
  }
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await notificationsApi.registerPushToken({ token: token.data, platform: Platform.OS });
    await storage.setItem('expoPushToken', token.data);
    await saveStatus('Push notifications registered.');
    return true;
  } catch (error) {
    await saveStatus('Push registration failed. Active-app alerts remain enabled; check Firebase configuration and connection.');
    console.warn('Push registration failed', error.message);
    return false;
  }
}

export async function showNewPhoneAlerts(userId, rows) {
  if (Platform.OS === 'web') return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const key = `phoneAlertsSeen:${userId}`;
  const stored = await storage.getItem(key);
  let seen = [];
  try { seen = stored ? JSON.parse(stored) : []; } catch { seen = []; }
  if (!Array.isArray(seen)) seen = [];
  // Establish a baseline once, avoiding a burst of historical alerts on upgrade.
  if (stored) {
    const displayed = await Notifications.getPresentedNotificationsAsync();
    const displayedIds = new Set(displayed.map(row => row.request.content.data?.notification_id));
    for (const row of unseenNotifications(rows, seen)) {
      if (displayedIds.has(row.notification_id)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: row.notification_id,
        content: { title: row.title || 'Baangs', body: row.message || '', sound: PHONE_SOUND,
          data: { ...row.meta, notification_id: row.notification_id } },
        trigger: Platform.OS === 'android' ? { channelId: PHONE_CHANNEL } : null,
      });
    }
  }
  await storage.setItem(key, JSON.stringify(rememberNotifications(rows, seen)));
}
