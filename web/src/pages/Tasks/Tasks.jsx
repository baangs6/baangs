import { useCallback, useEffect, useRef, useState } from 'react';
import { Columns3, List, CalendarDays, Plus, Search, X, RefreshCw, ChevronLeft, ChevronRight, MessageSquare, Users, Layers, CircleCheck, TriangleAlert, Clock3, Save, Trash2 } from 'lucide-react';
import { tasksApi } from '../../api';
import { formatDate, formatDateTime } from '../../utils/dateFormat';
import './Tasks.css';

const STATUSES = [['pending', 'Pending'], ['on_track', 'On Track'], ['at_risk', 'At Risk'], ['off_track', 'Off Track'], ['completed', 'Completed'], ['paused', 'Paused'], ['canceled', 'Canceled']];
const GROUPS = [
  { id: 'pending', title: 'Pending & Triage', statuses: ['pending', 'paused'] },
  { id: 'on_track', title: 'In Execution', statuses: ['on_track', 'at_risk', 'off_track'] },
  { id: 'completed', title: 'Completed', statuses: ['completed'] },
  { id: 'canceled', title: 'Canceled', statuses: ['canceled'] },
];
const EMPTY = { title: '', description: '', status: 'pending', due_date: '', assignee_user_ids: [], subtasks: [] };
const EMPTY_SUB = { title: '', status: 'pending', due_date: '', assignee_user_ids: [] };
const personName = person => person.full_name || person.username || person.user_id;
const statusLabel = value => STATUSES.find(([key]) => key === value)?.[1] || value;
const initials = name => String(name || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const draftOf = task => ({ title: task.title, description: task.description || '', status: task.status, due_date: task.due_date || '', assignee_user_ids: task.assignee_user_ids || [], subtasks: [] });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const errorMessage = (error, fallback) => typeof error.response?.data?.detail === 'string' ? error.response.data.detail : fallback;

function Assignees({ users, value, onChange }) {
  return <div className="work-assignees">{users.length ? users.map(user => <label key={user.user_id}><input type="checkbox" checked={value.includes(user.user_id)} onChange={() => onChange(value.includes(user.user_id) ? value.filter(id => id !== user.user_id) : [...value, user.user_id])} /><span>{personName(user)}<small>{user.role}</small></span></label>) : <span>No eligible people available</span>}</div>;
}

function TaskCard({ task, busy, onOpen, onStatus, onSubtask }) {
  const subs = task.subtasks || [];
  const done = subs.filter(sub => sub.status === 'completed').length;
  return <article className={`work-card is-${task.status}`} data-task-id={task.task_id} draggable={!busy} onDragStart={event => { event.dataTransfer.setData('text/plain', task.task_id); event.dataTransfer.effectAllowed = 'move'; }}>
    <div className="work-card-top"><small>{task.task_id}</small><span className={`work-badge is-${task.status}`}>{statusLabel(task.status)}</span></div>
    <button className="work-card-title" aria-label={`Open ${task.task_id}`} disabled={busy} onClick={() => onOpen(task)}>{task.title}</button>
    {task.description && <p className="work-card-description">{task.description}</p>}
    {task.due_date && <span className="work-due"><CalendarDays size={13} />Due: {formatDate(task.due_date)}</span>}
    {subs.length > 0 && <div className="work-progress-block"><div><span>Subtasks</span><strong>{done}/{subs.length} done</strong></div><progress aria-label={`Subtask progress ${task.task_id}`} max={subs.length} value={done} />{subs.slice(0, 3).map(sub => <label className={sub.status === 'completed' ? 'is-done' : ''} key={sub.subtask_id}><input aria-label={`Complete ${sub.title} for ${task.task_id}`} type="checkbox" checked={sub.status === 'completed'} disabled={busy} onChange={event => onSubtask(task, sub, { status: event.target.checked ? 'completed' : 'pending' })} />{sub.title}</label>)}{subs.length > 3 && <button className="work-text-button" onClick={() => onOpen(task)}>View all {subs.length} subtasks</button>}</div>}
    <footer><span className="work-avatar">{initials(task.assignee_names?.[0] || task.created_by_name)}</span><span className="work-person">{task.assignee_names?.join(', ') || 'Unassigned'}</span><button className="work-update-link" aria-label={`View updates ${task.task_id}`} title="Open task updates" disabled={busy} onClick={() => onOpen(task)}><MessageSquare size={14} />{task.comments?.length || 0}</button></footer>
    <select aria-label={`Status for ${task.task_id}`} value={task.status} disabled={busy} onChange={event => onStatus(task, event.target.value)}>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
  </article>;
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('Kanban');
  const [filters, setFilters] = useState({ search: '', status: '', person: '' });
  const [month, setMonth] = useState(today().slice(0, 7));
  const [dialogMode, setDialogMode] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(EMPTY);
  const [subtask, setSubtask] = useState(EMPTY_SUB);
  const [comment, setComment] = useState('');
  const [dropTarget, setDropTarget] = useState(null);
  const dialog = useRef(null);
  const requestId = useRef(0);
  const invalidate = useCallback(() => { requestId.current++; }, []);
  const load = useCallback(async () => {
    const id = ++requestId.current; setLoading(true); setError('');
    try {
      const [taskRes, peopleRes] = await Promise.all([tasksApi.list(), tasksApi.assignees()]);
      if (id === requestId.current) { setTasks(Array.isArray(taskRes.data) ? taskRes.data : []); setPeople(Array.isArray(peopleRes.data) ? peopleRes.data : []); }
    } catch (err) { if (id === requestId.current) setError(errorMessage(err, 'Unable to load tasks.')); }
    finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { load(); return invalidate; }, [load, invalidate]);
  useEffect(() => { if (dialogMode) dialog.current?.showModal(); }, [dialogMode]);
  const filtered = tasks.filter(task => (!filters.status || task.status === filters.status) && (!filters.person || task.assignee_user_ids?.includes(filters.person)) && [task.task_id, task.title, task.description, ...(task.assignee_names || []), ...(task.subtasks || []).map(sub => sub.title)].join(' ').toLowerCase().includes(filters.search.toLowerCase().trim()));
  const selected = tasks.find(task => task.task_id === selectedId);
  const dirty = JSON.stringify(editor) !== JSON.stringify(dialogMode === 'edit' && selected ? draftOf(selected) : EMPTY);
  const openNew = (status = 'pending', date = '') => { setEditor({ ...EMPTY, status, due_date: date }); setSubtask(EMPTY_SUB); setComment(''); setNotice(''); setDialogMode('create'); };
  const openTask = task => { setSelectedId(task.task_id); setEditor(draftOf(task)); setSubtask(EMPTY_SUB); setComment(''); setNotice(''); setDialogMode('edit'); };
  const close = () => { if (saving) return; if ((dirty || comment.trim() || subtask.title.trim()) && !window.confirm('Discard unsaved task changes?')) return; setDialogMode(null); setNotice(''); };
  const mutate = async operation => {
    if (saving) return null;
    setSaving(true); setNotice('');
    try {
      const { data } = await operation();
      setTasks(old => old.some(task => task.task_id === data.task_id) ? old.map(task => task.task_id === data.task_id ? data : task) : [data, ...old]);
      setNotice('Saved successfully.'); return data;
    } catch (err) { setNotice(errorMessage(err, 'Unable to save. Your entries have been kept.')); return null; }
    finally { setSaving(false); }
  };
  const changeStatus = async (task, status) => {
    if (status === task.status) return;
    const undone = (task.subtasks || []).filter(sub => sub.status !== 'completed').length;
    if (status === 'completed' && undone && !window.confirm(`Complete this task with ${undone} unfinished subtasks? Subtasks will remain unchanged.`)) return;
    await mutate(() => tasksApi.update(task.task_id, { status }));
  };
  const updateSubtask = (task, sub, payload) => mutate(() => tasksApi.updateSubtask(task.task_id, sub.subtask_id, payload));
  const saveTask = async event => {
    event.preventDefault();
    if (!editor.title.trim()) { setNotice('Task title is required.'); return; }
    const payload = { ...editor, title: editor.title.trim(), due_date: editor.due_date || null };
    if (dialogMode === 'create') payload.subtasks = editor.subtasks.filter(sub => sub.title.trim()).map(sub => ({ ...sub, title: sub.title.trim(), due_date: sub.due_date || null }));
    else delete payload.subtasks;
    const result = await mutate(() => dialogMode === 'create' ? tasksApi.create(payload) : tasksApi.update(selected.task_id, payload));
    if (result) { setEditor(draftOf(result)); if (dialogMode === 'create') { setDialogMode(null); setFilters({ search: '', status: '', person: '' }); } }
  };
  const addSubtask = async event => {
    event.preventDefault(); if (!subtask.title.trim()) return;
    const result = await mutate(() => tasksApi.addSubtask(selected.task_id, { ...subtask, title: subtask.title.trim(), due_date: subtask.due_date || null }));
    if (result) setSubtask(EMPTY_SUB);
  };
  const addComment = async event => {
    event.preventDefault(); if (!comment.trim()) return;
    const result = await mutate(() => tasksApi.addComment(selected.task_id, { comment: comment.trim() }));
    if (result) setComment('');
  };
  const drop = (event, status) => {
    event.preventDefault(); setDropTarget(null);
    const task = tasks.find(item => item.task_id === event.dataTransfer.getData('text/plain'));
    if (task && !saving) changeStatus(task, status);
  };
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const first = monthValid ? new Date(`${month}-01T00:00:00Z`) : null;
  const calendarDays = first ? Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i - first.getUTCDay() + 1)).toISOString().slice(0, 10)) : [];
  const shiftMonth = step => { const date = first || new Date(); setMonth(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1)).toISOString().slice(0, 7)); };
  const counts = { progress: tasks.filter(task => ['on_track', 'at_risk', 'off_track'].includes(task.status)).length, pending: tasks.filter(task => ['pending', 'paused'].includes(task.status)).length, completed: tasks.filter(task => task.status === 'completed').length, attention: tasks.filter(task => ['at_risk', 'off_track'].includes(task.status) || (task.due_date && task.due_date < today() && !['completed', 'canceled'].includes(task.status))).length };
  const card = task => <TaskCard key={task.task_id} task={task} busy={saving} onOpen={openTask} onStatus={changeStatus} onSubtask={updateSubtask} />;
  const statusOptions = STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>);

  return <div className="work-tracker"><header className="work-header"><div><small>WORKFORCE & OPERATIONS</small><h1>Work Tracker - Tasks</h1><p>Tasks, tagged people, subtasks and updates</p></div><div className="work-header-actions"><div className="work-view-switch" aria-label="Task views">{[['Kanban', <Columns3 size={16} />], ['List', <List size={16} />], ['Calendar', <CalendarDays size={16} />]].map(([name, icon]) => <button key={name} aria-pressed={view === name} onClick={() => setView(name)}>{icon}{name}</button>)}</div><button className="btn btn-primary" disabled={saving || loading || !!error} onClick={() => openNew()}><Plus size={17} />New Task</button></div></header>
    {notice && !dialogMode && <p role="status" className="work-notice">{notice}</p>}{error && <div role="alert" className="work-error">{error}<button className="btn btn-secondary" onClick={load}>Retry tasks</button></div>}
    {!loading && !error && <div className="work-metrics">{[['Total Tasks', tasks.length, <Layers size={20} />], ['In Progress', counts.progress, <Users size={20} />], ['Pending / Triage', counts.pending, <Clock3 size={20} />], ['Completed', counts.completed, <CircleCheck size={20} />], ['Needs Attention', counts.attention, <TriangleAlert size={20} />]].map(([label, value, icon]) => <div key={label}><span>{label}</span><strong>{value}</strong>{icon}</div>)}</div>}
    <div className="work-filters"><label className="work-search"><Search size={17} /><input aria-label="Search tasks" placeholder="Search tasks by ID, title or detail" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} /></label><select className="form-select" aria-label="Task status filter" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All Status</option>{statusOptions}</select><select className="form-select" aria-label="Tagged person" value={filters.person} onChange={event => setFilters({ ...filters, person: event.target.value })}><option value="">All Tagged People</option>{people.map(person => <option key={person.user_id} value={person.user_id}>{personName(person)}</option>)}</select><button className="btn btn-secondary" aria-label="Clear filters" onClick={() => setFilters({ search: '', status: '', person: '' })}><X size={15} />Clear</button><button className="btn-icon" aria-label="Refresh tasks" title="Refresh tasks" disabled={saving || loading} onClick={load}><RefreshCw size={17} /></button></div>
    {loading ? <div className="loading-center" role="status">Loading tasks...</div> : !error && <>
      {tasks.length >= 500 && <p>Showing up to 500 tasks.</p>}{!filtered.length && <div className="work-empty">No tasks match these filters</div>}
      {view === 'Kanban' && <div className="work-board">{GROUPS.filter(group => group.id !== 'canceled' || filtered.some(task => task.status === 'canceled')).map(group => <section role="region" aria-label={group.title} key={group.id} className={`work-column is-${group.id} ${dropTarget === group.id ? 'is-drop-target' : ''}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(group.id); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }} onDrop={event => drop(event, group.id)}><header><h2>{group.title}<span>{filtered.filter(task => group.statuses.includes(task.status)).length}</span></h2><button className="btn-icon" aria-label={`New task in ${group.title}`} title={`New task in ${group.title}`} disabled={saving} onClick={() => openNew(group.id)}><Plus size={17} /></button></header>{filtered.filter(task => group.statuses.includes(task.status)).map(card)}<div className="work-drop-label">{group.id === 'completed' ? 'Drop here to mark completed' : 'Drop task here'}</div></section>)}</div>}
      {view === 'List' && <div className="work-table-wrap"><table aria-label="Tasks list"><thead><tr><th>Task</th><th>Status</th><th>Tagged People</th><th>Due Date</th><th>Subtasks</th><th>Updates</th></tr></thead><tbody>{filtered.map(task => <tr key={task.task_id}><td><button className="work-text-button" aria-label={`Open ${task.task_id}`} onClick={() => openTask(task)}>{task.title}</button><small>{task.task_id}</small></td><td><select aria-label={`Status for ${task.task_id}`} disabled={saving} value={task.status} onChange={event => changeStatus(task, event.target.value)}>{statusOptions}</select></td><td>{task.assignee_names?.join(', ') || 'Unassigned'}</td><td>{formatDate(task.due_date)}</td><td>{(task.subtasks || []).filter(sub => sub.status === 'completed').length}/{task.subtasks?.length || 0}</td><td>{task.comments?.length || 0}</td></tr>)}</tbody></table></div>}
      {view === 'Calendar' && <section className="work-calendar" aria-label="Task calendar"><header><h2>Due Date Calendar</h2><div><button className="btn-icon" aria-label="Previous calendar month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button><input className="form-input" aria-label="Calendar month" type="month" value={month} onChange={event => setMonth(event.target.value)} /><button className="btn-icon" aria-label="Next calendar month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button><button className="btn btn-secondary" onClick={() => setMonth(today().slice(0, 7))}>Today</button></div></header>{monthValid ? <><div className="work-calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <strong className="work-weekday" key={day}>{day}</strong>)}{calendarDays.map(date => <div key={date} className={`work-calendar-day ${date.startsWith(month) ? '' : 'is-other-month'} ${date === today() ? 'is-today' : ''}`}><button className="work-date-button" aria-label={`Create task due ${date}`} onClick={() => openNew('pending', date)}>{Number(date.slice(-2))}</button>{filtered.filter(task => task.due_date === date).map(task => <button className={`work-calendar-event is-${task.status}`} key={task.task_id} aria-label={`Open ${task.task_id}`} onClick={() => openTask(task)}>{task.title}</button>)}</div>)}</div><div className="work-calendar-agenda">{filtered.filter(task => task.due_date?.startsWith(month)).map(card)}{!filtered.some(task => task.due_date?.startsWith(month)) && <p>No tasks due this month</p>}</div></> : <p>Select a calendar month.</p>}<div className="work-unscheduled"><h3>Without a due date</h3>{filtered.filter(task => !task.due_date).map(task => <button key={task.task_id} className="work-text-button" aria-label={`Open ${task.task_id}`} onClick={() => openTask(task)}>{task.title}</button>)}{!filtered.some(task => !task.due_date) && <p>All matching tasks have a due date</p>}</div></section>}
      <footer className="work-summary"><Users size={21} /><strong>{new Set(filtered.flatMap(task => task.assignee_user_ids || [])).size} tagged people</strong><span>{filtered.length} matching tasks</span><span>{filtered.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0)} subtasks</span><span>{counts.attention} tasks need attention across the workspace</span></footer>
    </>}
    {dialogMode && <dialog ref={dialog} className="work-editor" aria-label="Task editor" onCancel={event => { event.preventDefault(); close(); }}><header><div><small>{selected && dialogMode === 'edit' ? selected.task_id : 'WORK TRACKER'}</small><h2>{dialogMode === 'create' ? 'New Task' : 'Task Details'}</h2></div><button className="btn-icon" aria-label="Close task editor" disabled={saving} onClick={close}><X size={18} /></button></header>{notice && <p role="status" className="work-notice">{notice}</p>}<form onSubmit={saveTask}><fieldset disabled={saving}><label>Task title<input className="form-input" required maxLength={200} value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })} /></label><label>Task description<textarea className="form-textarea" rows={3} value={editor.description} onChange={event => setEditor({ ...editor, description: event.target.value })} /></label><div className="work-editor-row"><label>Status<select className="form-select" value={editor.status} onChange={event => setEditor({ ...editor, status: event.target.value })}>{statusOptions}</select></label><label>Due date<input className="form-input" type="date" value={editor.due_date} onChange={event => setEditor({ ...editor, due_date: event.target.value })} /></label></div><h3>Tagged People</h3><Assignees users={people} value={editor.assignee_user_ids} onChange={value => setEditor({ ...editor, assignee_user_ids: value })} />{dialogMode === 'create' && <section className="work-draft-subs"><header><h3>Subtasks</h3><button className="btn btn-secondary" type="button" onClick={() => setEditor({ ...editor, subtasks: [...editor.subtasks, { ...EMPTY_SUB }] })}><Plus size={15} />Add Draft Subtask</button></header>{editor.subtasks.map((sub, index) => <div className="work-draft-sub" key={index}><label>Draft subtask {index + 1} title<input className="form-input" required maxLength={200} value={sub.title} onChange={event => setEditor({ ...editor, subtasks: editor.subtasks.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })} /></label><label>Draft subtask {index + 1} due date<input className="form-input" type="date" value={sub.due_date} onChange={event => setEditor({ ...editor, subtasks: editor.subtasks.map((item, i) => i === index ? { ...item, due_date: event.target.value } : item) })} /></label><Assignees users={people} value={sub.assignee_user_ids} onChange={value => setEditor({ ...editor, subtasks: editor.subtasks.map((item, i) => i === index ? { ...item, assignee_user_ids: value } : item) })} /><button type="button" className="btn-icon" title="Remove draft subtask" aria-label={`Remove draft subtask ${index + 1}`} onClick={() => setEditor({ ...editor, subtasks: editor.subtasks.filter((_, i) => i !== index) })}><Trash2 size={16} /></button></div>)}</section>}<button className="btn btn-primary" disabled={saving || !editor.title.trim()}><Save size={16} />{saving ? 'Saving...' : dialogMode === 'create' ? 'Create Task' : 'Save Task'}</button></fieldset></form>
      {dialogMode === 'edit' && selected && <><section className="work-editor-subtasks"><h3>Subtasks ({selected.subtasks?.length || 0})</h3>{(selected.subtasks || []).map(sub => <div className="work-detail-sub" key={sub.subtask_id}><strong>{sub.title}</strong><div className="work-editor-row"><label>Subtask status<select className="form-select" aria-label={`Status of ${sub.title}`} disabled={saving} value={sub.status} onChange={event => updateSubtask(selected, sub, { status: event.target.value })}>{statusOptions}</select></label><label>Subtask due date<input className="form-input" type="date" aria-label={`Due date of ${sub.title}`} value={sub.due_date || ''} disabled={saving} onChange={event => updateSubtask(selected, sub, { due_date: event.target.value || null })} /></label></div><fieldset disabled={saving}><legend>Subtask people</legend><Assignees users={people} value={sub.assignee_user_ids || []} onChange={value => updateSubtask(selected, sub, { assignee_user_ids: value })} /></fieldset></div>)}<form onSubmit={addSubtask}><fieldset disabled={saving}><label>New subtask title<input className="form-input" maxLength={200} required value={subtask.title} onChange={event => setSubtask({ ...subtask, title: event.target.value })} /></label><label>New subtask due date<input className="form-input" type="date" value={subtask.due_date} onChange={event => setSubtask({ ...subtask, due_date: event.target.value })} /></label><Assignees users={people} value={subtask.assignee_user_ids} onChange={value => setSubtask({ ...subtask, assignee_user_ids: value })} /><button className="btn btn-secondary" disabled={saving || !subtask.title.trim()}><Plus size={16} />Add Subtask</button></fieldset></form></section><section className="work-editor-updates"><h3>Updates ({selected.comments?.length || 0})</h3>{(selected.comments || []).map(item => <article key={item.comment_id}><strong>{item.created_by_name || item.created_by_user_id}</strong><p>{item.comment}</p><small>{formatDateTime(item.created_at)}</small></article>)}{!selected.comments?.length && <p>No updates yet</p>}<form onSubmit={addComment}><label>Task update<textarea className="form-textarea" required maxLength={2000} value={comment} disabled={saving} onChange={event => setComment(event.target.value)} /></label><button className="btn btn-primary" disabled={saving || !comment.trim()}><MessageSquare size={16} />Post Update</button></form></section></>}
    </dialog>}
  </div>;
}
