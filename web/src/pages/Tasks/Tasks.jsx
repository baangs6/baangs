import { useEffect, useMemo, useState } from 'react';
import { MdAdd, MdComment, MdSave } from 'react-icons/md';
import { tasksApi } from '../../api';

const STATUSES = [
  ['pending', 'Pending'],
  ['on_track', 'On Track'],
  ['at_risk', 'At Risk'],
  ['off_track', 'Off Track'],
  ['completed', 'Completed'],
  ['paused', 'Paused'],
  ['canceled', 'Canceled'],
];

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'pending',
  due_date: '',
  assignee_user_ids: [],
  subtasks: [],
};

const EMPTY_SUBTASK = { title: '', status: 'pending', assignee_user_ids: [] };

function statusLabel(value) {
  return STATUSES.find(([key]) => key === value)?.[1] || value;
}

function toggleArrayValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function AssigneeChecks({ users, selected, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
      {users.map((user) => (
        <label key={user.user_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={selected.includes(user.user_id)}
            onChange={() => onChange(toggleArrayValue(selected, user.user_id))}
          />
          <span>{user.full_name || user.username} <span style={{ color: 'var(--color-text-muted)' }}>({user.role})</span></span>
        </label>
      ))}
    </div>
  );
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [subtaskForm, setSubtaskForm] = useState(EMPTY_SUBTASK);
  const [commentText, setCommentText] = useState('');
  const [filters, setFilters] = useState({ status: '', assigned_to: '', search: '' });
  const [error, setError] = useState('');

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.assigned_to) params.assigned_to = filters.assigned_to;
      if (filters.search) params.search = filters.search;
      const [taskRes, userRes] = await Promise.all([
        tasksApi.list(params),
        tasksApi.assignees(),
      ]);
      setTasks(taskRes.data || []);
      setAssignees(userRes.data || []);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.assigned_to]);

  const selectedTaskFresh = useMemo(
    () => tasks.find((task) => task.task_id === selectedTask?.task_id) || selectedTask,
    [tasks, selectedTask]
  );

  const createTask = async () => {
    if (!form.title.trim()) {
      setError('Task title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await tasksApi.create({
        ...form,
        due_date: form.due_date || null,
        subtasks: form.subtasks.filter((item) => item.title.trim()),
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await loadTasks();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (task, payload) => {
    setSaving(true);
    setError('');
    try {
      const res = await tasksApi.update(task.task_id, payload);
      setSelectedTask(res.data);
      await loadTasks();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  };

  const addSubtask = async () => {
    if (!selectedTaskFresh || !subtaskForm.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await tasksApi.addSubtask(selectedTaskFresh.task_id, subtaskForm);
      setSelectedTask(res.data);
      setSubtaskForm(EMPTY_SUBTASK);
      await loadTasks();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to add subtask');
    } finally {
      setSaving(false);
    }
  };

  const updateSubtaskStatus = async (subtask, status) => {
    if (!selectedTaskFresh) return;
    setSaving(true);
    try {
      const res = await tasksApi.updateSubtask(selectedTaskFresh.task_id, subtask.subtask_id, { status });
      setSelectedTask(res.data);
      await loadTasks();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to update subtask');
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!selectedTaskFresh || !commentText.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await tasksApi.addComment(selectedTaskFresh.task_id, { comment: commentText.trim() });
      setSelectedTask(res.data);
      setCommentText('');
      await loadTasks();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to add comment');
    } finally {
      setSaving(false);
    }
  };

  const addDraftSubtask = () => {
    setForm((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, { ...EMPTY_SUBTASK }],
    }));
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Tasks</h2>
          <p>Create tasks, assign people, track subtasks and updates</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><MdAdd /> New Task</button>
      </div>

      {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="filter-bar">
        <select className="form-select" style={{ width: 170 }} value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="">All Status</option>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="form-select" style={{ width: 220 }} value={filters.assigned_to} onChange={(e) => setFilters((prev) => ({ ...prev, assigned_to: e.target.value }))}>
          <option value="">All Tagged People</option>
          {assignees.map((user) => <option key={user.user_id} value={user.user_id}>{user.full_name || user.username}</option>)}
        </select>
        <input className="form-input" style={{ width: 260 }} value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search tasks" />
        <button className="btn btn-secondary" onClick={loadTasks}>Search</button>
        <button className="btn btn-secondary" onClick={() => setFilters({ status: '', assigned_to: '', search: '' })}>Clear</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedTaskFresh ? 'minmax(0, 1fr) minmax(380px, 520px)' : '1fr', gap: 16 }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 12 }}>Task List</h3>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : tasks.length === 0 ? (
            <div className="empty-state"><p>No tasks found</p></div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {tasks.map((task) => (
                <button
                  key={task.task_id}
                  onClick={() => setSelectedTask(task)}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--color-border)',
                    background: selectedTaskFresh?.task_id === task.task_id ? 'var(--color-surface-2)' : 'var(--color-surface)',
                    borderRadius: 8,
                    padding: 12,
                    cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{task.title}</strong>
                    <span className={`badge badge-${task.status}`}>{statusLabel(task.status)}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    Tagged: {task.assignee_names?.join(', ') || 'None'} {task.due_date ? ` | Due: ${task.due_date}` : ''}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {task.subtasks?.length || 0} subtasks | {task.comments?.length || 0} comments
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedTaskFresh && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div>
                <h3 className="card-title" style={{ marginBottom: 4 }}>{selectedTaskFresh.title}</h3>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>{selectedTaskFresh.task_id}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTask(null)}>Close</button>
            </div>

            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Status</label>
                <select className="form-select" value={selectedTaskFresh.status} onChange={(e) => updateTask(selectedTaskFresh, { status: e.target.value })}>
                  {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tagged People</label>
                <AssigneeChecks
                  users={assignees}
                  selected={selectedTaskFresh.assignee_user_ids || []}
                  onChange={(next) => updateTask(selectedTaskFresh, { assignee_user_ids: next })}
                />
              </div>
              {selectedTaskFresh.description ? (
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{selectedTaskFresh.description}</p>
              ) : null}

              <div>
                <h4 style={{ margin: '4px 0 8px' }}>Subtasks</h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  {(selectedTaskFresh.subtasks || []).map((subtask) => (
                    <div key={subtask.subtask_id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{subtask.title}</strong>
                        <select className="form-select" style={{ width: 150 }} value={subtask.status} onChange={(e) => updateSubtaskStatus(subtask, e.target.value)}>
                          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        Tagged: {subtask.assignee_names?.join(', ') || 'None'}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <input className="form-input" value={subtaskForm.title} onChange={(e) => setSubtaskForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="New subtask" />
                  <AssigneeChecks users={assignees} selected={subtaskForm.assignee_user_ids} onChange={(next) => setSubtaskForm((prev) => ({ ...prev, assignee_user_ids: next }))} />
                  <button className="btn btn-secondary btn-sm" onClick={addSubtask} disabled={saving}>Add Subtask</button>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '4px 0 8px' }}>Updates</h4>
                <div style={{ display: 'grid', gap: 8, maxHeight: 240, overflow: 'auto' }}>
                  {(selectedTaskFresh.comments || []).length === 0 ? (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No updates yet</div>
                  ) : selectedTaskFresh.comments.map((comment) => (
                    <div key={comment.comment_id} style={{ borderLeft: '3px solid var(--color-accent)', paddingLeft: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{comment.created_by_name || comment.created_by_user_id}</div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>{comment.comment}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{comment.created_at?.slice(0, 16).replace('T', ' ')}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <input className="form-input" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add update comment" />
                  <button className="btn btn-primary" onClick={addComment} disabled={saving}><MdComment /> Add</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Task</h3>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Task Title</label>
                  <input className="form-input" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Task title" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Details" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Status</label>
                    <select className="form-select" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                      {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Due Date</label>
                    <input className="form-input" type="date" value={form.due_date} onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tag People</label>
                  <AssigneeChecks users={assignees} selected={form.assignee_user_ids} onChange={(next) => setForm((prev) => ({ ...prev, assignee_user_ids: next }))} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label className="form-label" style={{ margin: 0 }}>Subtasks</label>
                    <button className="btn btn-secondary btn-sm" onClick={addDraftSubtask}><MdAdd /> Add Subtask</button>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {form.subtasks.map((subtask, index) => (
                      <div key={index} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 10 }}>
                        <input
                          className="form-input"
                          value={subtask.title}
                          onChange={(e) => setForm((prev) => ({
                            ...prev,
                            subtasks: prev.subtasks.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item),
                          }))}
                          placeholder={`Subtask ${index + 1}`}
                          style={{ marginBottom: 8 }}
                        />
                        <AssigneeChecks
                          users={assignees}
                          selected={subtask.assignee_user_ids}
                          onChange={(next) => setForm((prev) => ({
                            ...prev,
                            subtasks: prev.subtasks.map((item, itemIndex) => itemIndex === index ? { ...item, assignee_user_ids: next } : item),
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createTask} disabled={saving}><MdSave /> {saving ? 'Saving...' : 'Create Task'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
