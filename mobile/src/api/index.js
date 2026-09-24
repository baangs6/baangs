import axios from 'axios';
import { Platform } from 'react-native';
import storage from '../utils/storage';

const DEFAULT_API_BASE = 'https://baangs-backend-docker.onrender.com';

function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

function resolveApiBase() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }
  return DEFAULT_API_BASE;
}

export const API_BASE_URL = resolveApiBase();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

async function uploadAttendancePhoto(path, attendanceId, uri, fileName) {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
    formData.append('file', file);
  } else {
    formData.append('file', {
      uri,
      type: 'image/jpeg',
      name: fileName,
    });
  }

  const token = await storage.getItem('token');
  const response = await fetch(`${API_BASE_URL}${path}?attendance_id=${encodeURIComponent(attendanceId)}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw { response: { status: response.status, data: payload }, message: payload.detail || 'Photo upload failed' };
  }
  return { data: payload, status: response.status };
}

async function uploadFile(path, uri, fileName) {
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
    formData.append('file', file);
  } else {
    formData.append('file', {
      uri,
      type: 'image/jpeg',
      name: fileName,
    });
  }

  const token = await storage.getItem('token');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw { response: { status: response.status, data: payload }, message: payload.detail || 'File upload failed' };
  }
  return { data: payload, status: response.status };
}

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
  customerHistory: (id) => api.get(`/jobs/${id}/customer-history`),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  create: (data) => api.post('/jobs/', data),
};

export const updatesApi = {
  getJobUpdates: (jobId) => api.get(`/updates/job/${jobId}`),
  create: (data) => api.post('/updates/', data),
  learningLog: (params) => api.get('/updates/learning-log', { params }),
  reviewDoubt: (updateId, data) => api.patch(`/updates/${updateId}/doubt-review`, data),
};

export const attendanceApi = {
  today: (staffId) => api.get(`/attendance/today/${staffId}`),
  checkIn: (data) => api.post('/attendance/checkin', data),
  checkOut: (data) => api.post('/attendance/checkout', data),
  list: (params) => api.get('/attendance/', { params }),
  allowances: (params) => api.get('/attendance/allowances', { params }),
  createAllowance: (data) => api.post('/attendance/allowances', data),
  uploadCheckinPhoto: (attendanceId, uri) =>
    uploadAttendancePhoto('/attendance/checkin/photo', attendanceId, uri, `checkin_${attendanceId}.jpg`),
  uploadCheckoutPhoto: (attendanceId, uri) =>
    uploadAttendancePhoto('/attendance/checkout/photo', attendanceId, uri, `checkout_${attendanceId}.jpg`),
  uploadAllowanceBill: (allowanceId, uri) =>
    uploadFile(`/attendance/allowances/${encodeURIComponent(allowanceId)}/bill`, uri, `allowance_${allowanceId}.jpg`),
};

export const staffApi = {
  list: () => api.get('/staff/'),
  create: (data) => api.post('/staff/', data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  delete: (id) => api.delete(`/staff/${id}`),
};

export const customersApi = {
  list: (params) => api.get('/customers/', { params }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers/', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

export const billingApi = {
  list: (params) => api.get('/billing/', { params }),
  create: (data) => api.post('/billing/', data),
  invoiceLink: (jobId) => api.get(`/billing/job/${encodeURIComponent(jobId)}/invoice-link`),
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
  list: () => api.get('/inventory/'),
  summary: () => api.get('/inventory/summary'),
  transactions: () => api.get('/inventory/transactions'),
  create: (data) => api.post('/inventory/', data),
  update: (barcode, data) => api.put(`/inventory/${barcode}`, data),
  delete: (barcode) => api.delete(`/inventory/${barcode}`),
  adjust: (barcode, data) => api.post(`/inventory/${barcode}/adjust`, data),
  get: (barcode) => api.get(`/inventory/${barcode}`),
  search: (model_number, serial_number) => api.get('/inventory/search', {
    params: {
      ...(model_number ? { model_number } : {}),
      ...(serial_number ? { serial_number } : {}),
    },
  }),
};

export const notificationsApi = {
  list: (limit = 50) => api.get('/notifications/', { params: { limit } }),
  unreadCount: () => api.get('/notifications/unread-count'),
  registerPushToken: (data) => api.post('/notifications/push-token', data),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  clear: () => api.delete('/notifications/clear'),
};

export const leavesApi = {
  apply: (data) => api.post('/leaves/', data),
  list: (params) => api.get('/leaves/', { params }),
};

export default api;
