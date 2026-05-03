import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

const storage = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
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
      return AsyncStorage.removeItem(key);
  }
};

export default storage;
