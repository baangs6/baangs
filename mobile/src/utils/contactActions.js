import { Alert, Linking, Platform } from 'react-native';

function cleanPhone(phoneNumber) {
  return String(phoneNumber || '').replace(/[^\d+]/g, '');
}

export async function callPhone(phoneNumber) {
  const phone = cleanPhone(phoneNumber);
  if (!phone) {
    Alert.alert('Phone unavailable', 'No phone number is saved for this job.');
    return;
  }

  const url = `tel:${phone}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('Cannot call', 'Calling is not available on this device.');
    return;
  }
  await Linking.openURL(url);
}

function extractCoordinates(value) {
  const text = String(value || '').trim();
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function buildMapUrls(job) {
  const rawMapLocation = String(job?.map_location || '').trim();
  const rawLocation = String(job?.location || '').trim();

  if (/^https?:\/\//i.test(rawMapLocation)) {
    return [rawMapLocation];
  }

  const query = rawMapLocation || rawLocation;
  if (!query) return [];

  const coordinates = extractCoordinates(query);
  if (coordinates) {
    const coordinateText = `${coordinates.latitude},${coordinates.longitude}`;
    const encodedCoordinates = encodeURIComponent(coordinateText);
    if (Platform.OS === 'ios') {
      return [
        `http://maps.apple.com/?ll=${encodedCoordinates}&q=${encodedCoordinates}`,
        `https://www.google.com/maps/search/?api=1&query=${encodedCoordinates}`,
      ];
    }
    return [
      `geo:${coordinateText}?q=${encodedCoordinates}`,
      `https://www.google.com/maps/search/?api=1&query=${encodedCoordinates}`,
    ];
  }

  const encoded = encodeURIComponent(query);
  if (Platform.OS === 'ios') {
    return [`http://maps.apple.com/?q=${encoded}`];
  }
  return [
    `geo:0,0?q=${encoded}`,
    `https://www.google.com/maps/search/?api=1&query=${encoded}`,
  ];
}

export async function openJobMap(job) {
  const urls = buildMapUrls(job);
  if (urls.length === 0) {
    Alert.alert('Location unavailable', 'No map location is saved for this job.');
    return;
  }

  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch (error) {
      console.warn('Map open failed', url, error);
    }
  }

  Alert.alert('Cannot open map', 'Maps are not available on this device.');
}
