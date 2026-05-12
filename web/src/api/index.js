import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.replace(`${window.location.origin}${window.location.pathname}#/`);
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  setupStatus: () => api.get('/auth/setup-status'),
  setup: (data) => api.post('/auth/setup', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Users
export const usersApi = {
  list: () => api.get('/users/'),
  create: (data) => api.post('/users/', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  deactivate: (id) => api.patch(`/users/${id}/deactivate`),
  activate: (id) => api.patch(`/users/${id}/activate`),
  resetPassword: (id, newPassword) => api.put(`/users/${id}/reset-password`, { new_password: newPassword }),
  delete: (id) => api.delete(`/users/${id}`),
};

// Staff
export const staffApi = {
  list: () => api.get('/staff/'),
  get: (id) => api.get(`/staff/${id}`),
  create: (data) => api.post('/staff/', data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  payrollSummary: (month) => api.get('/staff/payroll/summary', { params: { month } }),
  uploadPhoto: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/staff/${id}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  delete: (id) => api.delete(`/staff/${id}`),
};

// Customers
export const customersApi = {
  list: (params) => api.get('/customers/', { params }),
  get: (id) => api.get(`/customers/${id}`),
  getJobs: (id) => api.get(`/customers/${id}/jobs`),
  update: (id, data) => api.put(`/customers/${id}`, data),
  create: (data) => api.post('/customers/', data),
  delete: (id) => api.delete(`/customers/${id}`),
};

// Jobs
export const jobsApi = {
  list: (params) => api.get('/jobs/', { params }),
  get: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post('/jobs/', data),
  update: (id, data) => api.put(`/jobs/${id}`, data),
  uploadPhoto: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/jobs/${id}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// Updates
export const updatesApi = {
  getJobUpdates: (jobId) => api.get(`/updates/job/${jobId}`),
  create: (data) => api.post('/updates/', data),
  verifyManualInventory: (updateId, manualItemId, data) =>
    api.patch(`/updates/${updateId}/manual-inventory/${manualItemId}/verify`, data),
};

// Billing
export const billingApi = {
  list: (params) => api.get('/billing/', { params }),
  get: (id) => api.get(`/billing/${id}`),
  create: (data) => api.post('/billing/', data),
  update: (id, data) => api.put(`/billing/${id}`, data),
  monthlySummary: () => api.get('/billing/summary/monthly'),
};

// Attendance
export const attendanceApi = {
  list: (params) => api.get('/attendance/', { params }),
  today: (staffId) => api.get(`/attendance/today/${staffId}`),
  checkIn: (data) => api.post('/attendance/checkin', data),
  checkOut: (data) => api.post('/attendance/checkout', data),
  uploadCheckinPhoto: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/attendance/checkin/photo?attendance_id=${id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// Lookups
export const lookupsApi = {
  all: () => api.get('/lookups/'),
  get: (type) => api.get(`/lookups/${type}`),
  add: (type, item) => api.post(`/lookups/${type}`, item),
  toggle: (type, value, isActive) => api.put(`/lookups/${type}/${value}`, { is_active: isActive }),
};

// Dashboard
export const dashboardApi = {
  summary: (params) => api.get('/dashboard/summary', { params }),
  jobsByStatus: (params) => api.get('/dashboard/jobs-by-status', { params }),
  jobsByPriority: (params) => api.get('/dashboard/jobs-by-priority', { params }),
  jobsByType: () => api.get('/dashboard/jobs-by-type'),
  technicianPerformance: (params) => api.get('/dashboard/technician-performance', { params }),
  monthlyRevenue: (params) => api.get('/dashboard/monthly-revenue', { params }),
  attendanceSummary: (params) => api.get('/dashboard/attendance-summary', { params }),
  technicianPerformanceReport: (params) => api.get('/dashboard/technician-performance-report', { params }),
  technicianPerformanceDeepDive: (params) => api.get('/dashboard/technician-performance-deep-dive', { params }),
};

// Export
export const exportApi = {
  jobsCsv: () => api.get('/export/jobs.csv', { responseType: 'blob' }),
  customersCsv: () => api.get('/export/customers.csv', { responseType: 'blob' }),
  billingCsv: () => api.get('/export/billing.csv', { responseType: 'blob' }),
  attendanceCsv: () => api.get('/export/attendance.csv', { responseType: 'blob' }),
  allJson: () => api.get('/export/all.json', { responseType: 'blob' }),
};

// Inventory
export const inventoryApi = {
  list: () => api.get('/inventory/'),
  get: (barcode) => api.get(`/inventory/${barcode}`),
  summary: () => api.get('/inventory/summary'),
  transactions: (limit=100) => api.get('/inventory/transactions', { params: { limit } }),
  create: (data) => api.post('/inventory/', data),
  update: (barcode, data) => api.put(`/inventory/${barcode}`, data),
  adjust: (barcode, data) => api.post(`/inventory/${barcode}/adjust`, data),
  bulkUpload: (items) => api.post('/inventory/bulk', items),
  deactivate: (barcode) => api.delete(`/inventory/${barcode}`),
  stockSummary: () => api.get('/inventory/reports/stock-summary'),
  soldDetails: () => api.get('/inventory/reports/sold-details'),
};

export const notificationsApi = {
  list: (limit = 30) => api.get('/notifications/', { params: { limit } }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};

export const leavesApi = {
  list: (params) => api.get('/leaves/', { params }),
  decide: (leaveId, decision, note='') => api.patch(`/leaves/${leaveId}/decision`, { decision, note }),
};

export default api;
