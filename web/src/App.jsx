import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import './index.css';

// Pages
import Login from './pages/Login';
import Setup from './pages/Setup';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import JobList from './pages/Jobs/JobList';
import JobDetail from './pages/Jobs/JobDetail';
import JobCreate from './pages/Jobs/JobCreate';
import CustomerList from './pages/Customers/CustomerList';
import CustomerDetail from './pages/Customers/CustomerDetail';
import AttendanceReport from './pages/Attendance/AttendanceReport';
import BillingList from './pages/Billing/BillingList';
import UserManagement from './pages/Users/UserManagement';
import LookupManager from './pages/Settings/LookupManager';
import StaffList from './pages/Staff/StaffList';
import StaffFormPage from './pages/Staff/StaffFormPage';
import InventoryDashboard from './pages/Inventory/InventoryDashboard';
import Reports from './pages/Reports/Reports';
import Tasks from './pages/Tasks/Tasks';

function AppRoutes() {
  const { user, loading, isSetup } = useAuth();

  if (loading) {
    return (
      <div className="loading-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!isSetup) return <Routes><Route path="*" element={<Setup />} /></Routes>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;

  if (user.role === 'sales') {
    return (
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="jobs" element={<JobList />} />
        <Route path="jobs/create" element={<JobCreate />} />
        <Route path="jobs/:jobId" element={<JobDetail />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/:customerId" element={<CustomerDetail />} />
        <Route path="attendance" element={<AttendanceReport />} />
        <Route path="billing" element={<BillingList />} />
        <Route path="inventory" element={<InventoryDashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="staff" element={<StaffList />} />
        <Route path="staff/new" element={<StaffFormPage />} />
        <Route path="staff/:staffId" element={<StaffFormPage />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="settings" element={<LookupManager />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
