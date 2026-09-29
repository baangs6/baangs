import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MdArrowForward, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { useAuth } from '../context/useAuth';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
    } catch (err) {
      setError(err.response?.data?.detail || (err.response
        ? 'Unable to sign in. Please try again.'
        : 'Cannot connect to the login server. Please check your connection or contact support.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="baangs-login">
      <header className="baangs-login-header">
        <img src="/baangs-logo.png" alt="BAANGS" />
        <Link to="/complaint">Customer support <MdArrowForward aria-hidden="true" /></Link>
      </header>
      <section className="baangs-login-content" aria-labelledby="login-heading">
        <p className="baangs-login-eyebrow">CCTV &amp; HOME AUTOMATION</p>
        <h1 id="login-heading">BAANGS</h1>
        <p className="baangs-login-intro">Welcome back.<br />Your service day starts here.</p>
        <h2>Staff sign in</h2>
        {error && <div className="baangs-login-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-username">Username</label>
              <input id="login-username" autoComplete="username" className="form-input" placeholder="Enter username" value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="baangs-login-password">
              <input id="login-password" autoComplete="current-password" className="form-input" type={showPassword ? 'text' : 'password'} placeholder="Enter password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} required />
              <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
              </button>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Logging in...</> : <>Sign in <MdArrowForward aria-hidden="true" /></>}
            </button>
          </div>
        </form>
        <p className="baangs-login-customer">
          Need a service visit? <Link to="/complaint">Register a request <MdArrowForward aria-hidden="true" /></Link>
        </p>
      </section>
      <footer className="baangs-login-footer">BAANGS TECHNOMAC LLP <span>Field Service Management</span></footer>
    </main>
  );
}
