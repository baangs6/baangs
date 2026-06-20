import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { notificationsApi } from '../../api';
import {
  MdDashboard, MdWork, MdPeople, MdAttachMoney,
  MdLocationOn, MdLogout, MdSupervisorAccount,
  MdEngineering, MdListAlt, MdInventory, MdAssessment, MdNotifications, MdTaskAlt
} from 'react-icons/md';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifications, setNotifications] = useState([]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isSales = user?.role === 'sales';
  const canUseTasks = isAdmin || isManager || isSales;

  const prevNotifIds = useState(() => new Set())[0];

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let isFirstLoad = true;
    const load = async () => {
      try {
        const [listRes, countRes] = await Promise.all([
          notificationsApi.list(20),
          notificationsApi.unreadCount(),
        ]);
        if (!mounted) return;
        const incoming = listRes.data || [];
        setNotifications(incoming);
        setNotifCount(Number(countRes.data?.count || 0));

        // Fire browser notifications for newly arrived unread items (skip first load)
        if (!isFirstLoad && 'Notification' in window && Notification.permission === 'granted') {
          incoming.forEach((n) => {
            if (!n.is_read && !prevNotifIds.has(n.notification_id)) {
              const browserNotif = new Notification(n.title || 'Baangs', {
                body: n.message,
                icon: '/favicon.ico',
                tag: n.notification_id,
              });
              browserNotif.onclick = () => {
                window.focus();
                if (n.meta?.job_id) window.location.hash = `/jobs/${n.meta.job_id}`;
              };
            }
          });
        }
        isFirstLoad = false;
        incoming.forEach((n) => prevNotifIds.add(n.notification_id));
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
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1><span className="brand-mark">B</span> Baangs</h1>
          <span>CCTV Field Service</span>
          <div className="notification-wrap">
            <button className="notification-trigger" onClick={() => setNotifOpen((v) => !v)}>
              <span><MdNotifications /> Notifications</span>
              {notifCount > 0 ? <span className="badge badge-pending">{notifCount}</span> : null}
            </button>
            {notifOpen && (
              <div className="notification-menu">
                {notifications.length === 0 ? (
                  <div className="notification-empty">No notifications</div>
                ) : notifications.map((n) => (
                  <button
                    key={n.notification_id}
                    onClick={() => openNotification(n)}
                    className={`notification-item ${n.is_read ? '' : 'unread'}`}
                  >
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                    <small>{n.created_at?.slice(0, 16).replace('T', ' ')}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          {!isSales && <>
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
          <div className="topbar-profile">
            <div className="topbar-avatar">
              {user?.profile_photo_url ? (
                <img src={user.profile_photo_url} alt={user?.full_name || user?.username || 'Profile'} />
              ) : (
                <span>{user?.full_name?.[0] || user?.username?.[0] || 'U'}</span>
              )}
            </div>
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
    </div>
  );
}
