import { useEffect, useState, useCallback, useRef } from 'react';
import { attendanceApi, staffApi, exportApi, leavesApi } from '../../api';
import { Fingerprint, CalendarDays, Wallet, Fuel, Download } from 'lucide-react';
import DateRangePicker from '../../components/DateRangePicker';
import AttendanceLog from './AttendanceLog';
import LeaveHistory from './LeaveHistory';
import PayrollConsole from './PayrollConsole';
import DailyAllowance from './DailyAllowance';
import './AttendanceReport.css';

export default function AttendanceReport() {
  const [records, setRecords] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ staff_id: '', date_from: '', date_to: '' });
  const [viewPhoto, setViewPhoto] = useState(null);
  const [leaveHistoryRows, setLeaveHistoryRows] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveError, setLeaveError] = useState('');
  const [activeTab, setActiveTab] = useState('attendance');
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payrollData, setPayrollData] = useState({ totals: null, items: [] });
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState('');
  const [attendanceError, setAttendanceError] = useState('');
  const [exportError, setExportError] = useState('');
  const payrollRequest = useRef(0);
  const requestId = useRef(0);
  const photoDialog = useRef(null);
  useEffect(() => { if (viewPhoto) photoDialog.current?.showModal(); }, [viewPhoto]);

  const fetchRecords = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setAttendanceError('');
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const res = await attendanceApi.list(params);
      if (id === requestId.current) setRecords(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      if (id === requestId.current) setAttendanceError(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Unable to load attendance. Please try again.');
    } finally { if (id === requestId.current) setLoading(false); }
  }, [filters]);
  useEffect(() => { staffApi.list().then(r => setStaff(r.data)).catch(console.error); }, []);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const loadLeaves = useCallback(async () => {
    setLeaveLoading(true); setLeaveError('');
    try { const { data } = await leavesApi.list(); setLeaveHistoryRows(Array.isArray(data) ? data : []); }
    catch (error) { setLeaveError(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Unable to load leave history. Please try again.'); }
    finally { setLeaveLoading(false); }
  }, []);
  useEffect(() => { loadLeaves(); }, [loadLeaves]);
  const decideLeave = async (leaveId, decision) => {
    try {
      const { data } = await leavesApi.decide(leaveId, decision);
      setLeaveHistoryRows(rows => rows.map(row => row.leave_id === leaveId ? { ...row, ...data, status: decision } : row));
      await loadLeaves();
    } catch (error) { alert(error.response?.data?.detail || 'Failed to update leave'); }
  };

  const loadPayroll = useCallback(async () => {
    const id = ++payrollRequest.current;
    if (!payrollMonth) { setPayrollError('Select a payroll month.'); setPayrollLoading(false); return; }
    setPayrollLoading(true); setPayrollError('');
    try {
      const res = await staffApi.payrollSummary(payrollMonth);
      if (id === payrollRequest.current) setPayrollData({ totals: res.data?.totals || null, items: res.data?.items || [] });
    } catch (error) {
      if (id === payrollRequest.current) setPayrollError(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Unable to load payroll. Please try again.');
    } finally { if (id === payrollRequest.current) setPayrollLoading(false); }
  }, [payrollMonth]);
  useEffect(() => { if (activeTab === 'payroll') loadPayroll(); }, [activeTab, loadPayroll]);
  const handleExport = async () => {
    setExportError('');
    try {
      const res = await exportApi.attendanceCsv();
      const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = 'attendance.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError('Unable to export attendance. Please try again.'); }
  };

  return <div className="animate-fade attendance-report">
    <div className="page-header"><div className="page-header-left"><h2>Attendance Report</h2><p>Staff check-ins, locations, leave and daily expenses</p></div>{activeTab === 'attendance' && <button className="btn btn-secondary" onClick={handleExport}><Download size={17} />Export CSV</button>}</div>
    {activeTab === 'attendance' && exportError && <p role="alert" className="attendance-error">{exportError}</p>}
    <div className="attendance-nav" role="tablist" aria-label="Attendance views">
      <button role="tab" aria-selected={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')}><Fingerprint size={18} />Attendance Log<span>{records.length}</span></button>
      <button role="tab" aria-selected={activeTab === 'leave'} onClick={() => setActiveTab('leave')}><CalendarDays size={18} />Leave History</button>
      <button role="tab" aria-selected={activeTab === 'payroll'} onClick={() => setActiveTab('payroll')}><Wallet size={18} />Payroll</button>
      <button role="tab" aria-selected={activeTab === 'allowance'} onClick={() => setActiveTab('allowance')}><Fuel size={18} />Daily Allowance</button>
    </div>
    {(activeTab === 'attendance' || activeTab === 'allowance') && <div className="filter-bar"><select aria-label="Filter by staff" className="form-select" style={{ width: 200 }} value={filters.staff_id} onChange={event => setFilters({ ...filters, staff_id: event.target.value })}><option value="">All Staff</option>{staff.map(person => <option key={person.staff_id} value={person.staff_id}>{person.name || person.full_name || person.staff_id}</option>)}</select><DateRangePicker start={filters.date_from} end={filters.date_to} onChange={(date_from, date_to) => setFilters({ ...filters, date_from, date_to })} /><button className="btn btn-secondary" onClick={() => setFilters({ staff_id: '', date_from: '', date_to: '' })}>Clear</button></div>}
    {activeTab === 'payroll' ? <PayrollConsole data={payrollData} month={payrollMonth} onMonth={setPayrollMonth} loading={payrollLoading} error={payrollError} onReload={loadPayroll} /> : activeTab === 'leave' ? <LeaveHistory rows={leaveHistoryRows} pending={leaveHistoryRows.filter(row => !row.status || row.status === 'pending')} onDecide={decideLeave} loading={leaveLoading} error={leaveError} onRetry={loadLeaves} /> : activeTab === 'allowance' ? <DailyAllowance filters={filters} staff={staff} /> : <AttendanceLog records={records} loading={loading} error={attendanceError} onRetry={fetchRecords} onPhoto={setViewPhoto} />}
    {viewPhoto && <dialog ref={photoDialog} className="attendance-photo-dialog" aria-label="Attendance photo" onCancel={() => setViewPhoto(null)} onClick={event => { if (event.target === event.currentTarget) setViewPhoto(null); }}><img src={viewPhoto} alt="Attendance photo" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} /><div style={{ padding: 12, textAlign: 'center' }}><button className="btn btn-secondary" onClick={() => setViewPhoto(null)}>Close</button></div></dialog>}
  </div>;
}
