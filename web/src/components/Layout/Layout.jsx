import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { notificationsApi } from '../../api';
import {
  MdDashboard, MdWork, MdPeople, MdAttachMoney,
  MdLocationOn, MdSettings, MdLogout, MdSupervisorAccount,
  MdEngineering, MdListAlt, MdInventory, MdAssessment, MdNotifications, MdTaskAlt
} from 'react-icons/md';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifications, setNotifications] = useState([]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isSales = user?.role === 'sales';
  const canUseTasks = isAdmin || isManager || isSales;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [listRes, countRes] = await Promise.all([
          notificationsApi.list(20),
          notificationsApi.unreadCount(),
        ]);
        if (!mounted) return;
        setNotifications(listRes.data || []);
        setNotifCount(Number(countRes.data?.count || 0));
      } catch {
        // no-op
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const openNotification = async (n) => {
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.notification_id);
        setNotifications((prev) => prev.map((x) => x.notification_id === n.notification_id ? { ...x, is_read: true } : x));
        setNotifCount((c) => Math.max(0, c - 1));
      } catch {
        // no-op
      }
    }
    const jobId = n?.meta?.job_id;
    if (jobId) navigate(`/jobs/${jobId}`);
    const taskId = n?.meta?.task_id;
    if (taskId) navigate('/tasks');
    setNotifOpen(false);
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>⚡ Baangs</h1>
          <span>CCTV Field Service</span>
          <div style={{ marginTop: 8, position: 'relative' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setNotifOpen((v) => !v)} style={{ width: '100%', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MdNotifications /> Notifications</span>
              {notifCount > 0 ? <span className="badge badge-pending">{notifCount}</span> : null}
            </button>
            {notifOpen && (
              <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 6, width: 320, maxHeight: 360, overflow: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, zIndex: 30, padding: 8 }}>
                {notifications.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', padding: 8 }}>No notifications</div>
                ) : notifications.map((n) => (
                  <button
                    key={n.notification_id}
                    onClick={() => openNotification(n)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: n.is_read ? 'transparent' : 'rgba(59,130,246,0.12)',
                      borderRadius: 6,
                      padding: 8,
                      marginBottom: 6,
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{n.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{n.message}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{n.created_at?.slice(0, 16).replace('T', ' ')}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Overview</div>
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
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
            <NavLink to="/billing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdAttachMoney className="nav-icon" /> Billing
            </NavLink>
            <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <MdAssessment className="nav-icon" /> Reports
            </NavLink>
          </>}

          <div className="nav-section-title">HR</div>
          <NavLink to="/attendance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <MdLocationOn className="nav-icon" /> Attendance
          </NavLink>

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

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.full_name?.[0] || user?.username?.[0] || 'U'}</div>
            <div>
              <div className="user-name">{user?.full_name || user?.username}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLogout}>
            <MdLogout /> Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
