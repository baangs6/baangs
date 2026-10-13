import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const secureKeys = new Set(['token', 'expoPushToken']);

const storage = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    if (secureKeys.has(key)) {
      const secured = await SecureStore.getItemAsync(key);
      if (secured !== null) return secured;
      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) {
        await SecureStore.setItemAsync(key, legacy);
        await AsyncStorage.removeItem(key);
      }
      return legacy;
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    if (secureKeys.has(key)) {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key);
      return;
    }
    return AsyncStorage.setItem(key, value);
  },
  multiGet: async (keys) => {
    return Promise.all(
      keys.map(async (key) => {
        const val = await storage.getItem(key);
        return [key, val];
      })
    );
  },
  multiSet: async (keyValuePairs) => {
    return Promise.all(
      keyValuePairs.map(async ([key, value]) => {
        return storage.setItem(key, value);
      })
    );
  },
  multiRemove: async (keys) => {
    return Promise.all(
      keys.map(async (key) => {
        return storage.removeItem(key);
      })
    );
  },
  removeItem: async (key) => {
      if (Platform.OS === 'web') {
          localStorage.removeItem(key);
          return;
      }
      if (secureKeys.has(key)) {
        await SecureStore.deleteItemAsync(key);
      }
      return AsyncStorage.removeItem(key);
  }
};

export default storage;
