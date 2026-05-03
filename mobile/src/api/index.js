import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import storage from '../utils/storage';

const API_PORT = '8000';

function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

function getExpoHost() {
  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    Constants.manifest?.debuggerHost,
  ];

  for (const host of hostCandidates) {
    if (typeof host === 'string' && host.length > 0) {
      return host.split(':')[0];
    }
  }

  return null;
}

function resolveApiBase() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }

  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:${API_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  if (Platform.OS === 'ios') {
    return `http://127.0.0.1:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

const API_BASE = resolveApiBase();

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await storage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await storage.multiRemove(['token', 'user']);
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  setupStatus: () => api.get('/auth/setup-status'),
  login: (data) => api.post('/auth/login', data, { timeout: 10000 }),
  me: () => api.get('/auth/me'),
};

export const jobsApi = {
  list: (params) => api.get('/jobs/', { params }),
  get: (id) => api.get(`/jobs/${id}`),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  create: (data) => api.post('/jobs/', data),
};

export const updatesApi = {
  getJobUpdates: (jobId) => api.get(`/updates/job/${jobId}`),
  create: (data) => api.post('/updates/', data),
};

export const attendanceApi = {
  today: (staffId) => api.get(`/attendance/today/${staffId}`),
  checkIn: (data) => api.post('/attendance/checkin', data),
  checkOut: (data) => api.post('/attendance/checkout', data),
  list: (params) => api.get('/attendance/', { params }),
  uploadCheckinPhoto: async (attendanceId, uri) => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const file = new File([blob], `checkin_${attendanceId}.jpg`, { type: blob.type || 'image/jpeg' });
      formData.append('file', file);
    } else {
      formData.append('file', {
        uri,
        type: 'image/jpeg',
        name: `checkin_${attendanceId}.jpg`,
      });
    }
    return api.post(`/attendance/checkin/photo?attendance_id=${attendanceId}`, formData);
  },
  uploadCheckoutPhoto: async (attendanceId, uri) => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const file = new File([blob], `checkout_${attendanceId}.jpg`, { type: blob.type || 'image/jpeg' });
      formData.append('file', file);
    } else {
      formData.append('file', {
        uri,
        type: 'image/jpeg',
        name: `checkout_${attendanceId}.jpg`,
      });
    }
    return api.post(`/attendance/checkout/photo?attendance_id=${attendanceId}`, formData);
  },
};

export const staffApi = {
  list: () => api.get('/staff/'),
};

export const customersApi = {
  list: (params) => api.get('/customers/', { params }),
};

export const billingApi = {
  list: (params) => api.get('/billing/', { params }),
  create: (data) => api.post('/billing/', data),
};

export const dashboardApi = {
  summary: () => api.get('/dashboard/summary'),
  technicianPerformance: () => api.get('/dashboard/technician-performance'),
};

export const lookupsApi = {
  all: () => api.get('/lookups/'),
};

export const usersApi = {
  list: () => api.get('/users/'),
  create: (data) => api.post('/users/', data),
  deactivate: (id) => api.patch(`/users/${id}/deactivate`),
  activate: (id) => api.patch(`/users/${id}/activate`),
};

export const inventoryApi = {
  get: (barcode) => api.get(`/inventory/${barcode}`),
  search: (model_number, serial_number) => api.get('/inventory/search', { params: { model_number, serial_number } }),
};

export const notificationsApi = {
  list: (limit = 50) => api.get('/notifications/', { params: { limit } }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};

export const leavesApi = {
  apply: (data) => api.post('/leaves/', data),
  list: (params) => api.get('/leaves/', { params }),
};

export default api;
