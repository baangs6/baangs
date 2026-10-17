import { NavLink, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import NotificationCenter from './NotificationCenter';
import { Bell } from 'lucide-react';
import { Avatar } from '@/components/base/avatar/avatar';
import {
  MdDashboard, MdWork, MdPeople, MdAttachMoney,
  MdLocationOn, MdLogout, MdSupervisorAccount,
  MdEngineering, MdListAlt, MdInventory, MdAssessment, MdTaskAlt, MdSchool
} from 'react-icons/md';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isSales = user?.role === 'sales';
  const canUseTasks = isAdmin || isManager || isSales;

  return (
    <div className={`app-layout${location.pathname === '/dashboard' ? ' dashboard-shell' : location.pathname === '/jobs' || (location.pathname.startsWith('/jobs/') && location.pathname !== '/jobs/create') ? ' jobs-shell' : location.pathname.startsWith('/customers') ? ' customers-shell' : location.pathname === '/quotations' ? ' quotations-shell' : location.pathname === '/billing' ? ' billing-shell' : location.pathname === '/attendance' ? ' attendance-shell' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1><span className="brand-mark">B</span> Baangs</h1>
          <span>CCTV Field Service</span>
        </div>

        <nav className="sidebar-nav">
          {!isSales && <>
            <div className="nav-section-title">Overview</div>
            <NavLink to="/dashboard" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdDashboard className="nav-icon" /> Dashboard
            </NavLink>

            <div className="nav-section-title">Operations</div>
            <NavLink to="/jobs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdWork className="nav-icon" /> Jobs
            </NavLink>
            <NavLink to="/customers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdPeople className="nav-icon" /> Customers
            </NavLink>
            <NavLink to="/staff" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdEngineering className="nav-icon" /> Staff
            </NavLink>
            {(isAdmin || isManager) && (
              <NavLink to="/learning-log" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <MdSchool className="nav-icon" /> Learning & Doubts
              </NavLink>
            )}
          </>}
          {isSales && <div className="nav-section-title">Workspace</div>}
          {canUseTasks && (
            <NavLink to="/tasks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdTaskAlt className="nav-icon" /> Tasks
            </NavLink>
          )}

          {(isAdmin || isManager) && <>
            <div className="nav-section-title">Stock</div>
            <NavLink to="/inventory" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdInventory className="nav-icon" /> Inventory
            </NavLink>
          </>}

          {(isAdmin || isManager) && <>
            <div className="nav-section-title">Finance</div>
            <NavLink to="/quotations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdListAlt className="nav-icon" /> Quotations
            </NavLink>
            <NavLink to="/billing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdAttachMoney className="nav-icon" /> Billing
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdAssessment className="nav-icon" /> Reports
            </NavLink>
          </>}

          {!isSales && <>
            <div className="nav-section-title">HR</div>
            <NavLink to="/attendance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdLocationOn className="nav-icon" /> Attendance
            </NavLink>
          </>}

          {isAdmin && <>
            <div className="nav-section-title">Admin</div>
            <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdSupervisorAccount className="nav-icon" /> Users
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdListAlt className="nav-icon" /> Lookup Settings
            </NavLink>
          </>}
        </nav>

      </aside>

      <main className="main-content">
        <div className="app-topbar">
          <div className="topbar-spacer" />
          <button className="alerts-topbar-button" aria-label="Open notification drawer" aria-expanded={notifOpen} title="Notifications" onClick={() => setNotifOpen(true)}><Bell size={19} />{notifCount > 0 && <span>{notifCount}</span>}</button>
          <div className="topbar-profile">
            <Avatar
              key={user?.profile_photo_url || user?.user_id}
              border
              size="md"
              className="topbar-avatar"
              alt={user?.full_name || user?.username || 'Profile'}
              src={user?.profile_photo_url}
              initials={(user?.full_name?.[0] || user?.username?.[0] || 'U').toUpperCase()}
            />
            <div className="topbar-user-copy">
              <strong>{user?.full_name || user?.username}</strong>
              <span>{user?.role}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              <MdLogout /> Logout
            </button>
          </div>
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
      <NotificationCenter key={user.user_id} user={user} open={notifOpen} onClose={() => setNotifOpen(false)} onCount={setNotifCount} />
    </div>
  );
}
