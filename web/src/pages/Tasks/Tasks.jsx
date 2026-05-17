import { useEffect, useMemo, useState } from 'react';
import {
  MdAdd,
  MdCheckCircle,
  MdClose,
  MdComment,
  MdEvent,
  MdPerson,
  MdSave,
  MdSearch,
  MdTaskAlt,
} from 'react-icons/md';
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

const EMPTY_SUBTASK = { title: '', status: 'pending', due_date: '', assignee_user_ids: [] };

function statusLabel(value) {
  return STATUSES.find(([key]) => key === value)?.[1] || value;
}

function toggleArrayValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function personName(user) {
  return user.full_name || user.username || user.user_id;
}

function AssigneeChecks({ users, selected, onChange }) {
  return (
    <div className="task-assignee-grid">
      {users.map((user) => (
        <label key={user.user_id} className="task-assignee-option">
          <input
            type="checkbox"
            checked={selected.includes(user.user_id)}
            onChange={() => onChange(toggleArrayValue(selected, user.user_id))}
          />
          <span>
            {personName(user)}
            <small>{user.role}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

function TaskMeta({ icon, children }) {
  return (
    <span className="task-meta-pill">
      {icon}
      {children}
    </span>
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
  const [completeBurst, setCompleteBurst] = useState(null);

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

  useEffect(() => {
    if (!completeBurst) return undefined;
    const timer = window.setTimeout(() => setCompleteBurst(null), 1600);
    return () => window.clearTimeout(timer);
  }, [completeBurst]);

  const selectedTaskFresh = useMemo(
    () => tasks.find((task) => task.task_id === selectedTask?.task_id) || selectedTask,
    [tasks, selectedTask]
  );

  const taskCounts = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    risk: tasks.filter((task) => task.status === 'at_risk' || task.status === 'off_track').length,
  }), [tasks]);

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
        subtasks: form.subtasks
          .filter((item) => item.title.trim())
          .map((item) => ({ ...item, due_date: item.due_date || null })),
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
      const wasCompleted = task.status === 'completed';
      const res = await tasksApi.update(task.task_id, payload);
      setSelectedTask(res.data);
      if (!wasCompleted && payload.status === 'completed') {
        setCompleteBurst({ title: res.data.title, id: res.data.task_id });
      }
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
      const res = await tasksApi.addSubtask(selectedTaskFresh.task_id, {
        ...subtaskForm,
        due_date: subtaskForm.due_date || null,
      });
      setSelectedTask(res.data);
      setSubtaskForm(EMPTY_SUBTASK);
      await loadTasks();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to add subtask');
    } finally {
      setSaving(false);
    }
  };

  const updateSubtask = async (subtask, payload) => {
    if (!selectedTaskFresh) return;
    setSaving(true);
    try {
      const res = await tasksApi.updateSubtask(selectedTaskFresh.task_id, subtask.subtask_id, payload);
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
    <div className="task-page animate-fade">
      {completeBurst && (
        <div className="task-complete-burst" role="status">
          <div className="task-complete-mark"><MdCheckCircle /></div>
          <strong>Task Completed</strong>
          <span>{completeBurst.title}</span>
        </div>
      )}

      <div className="task-hero">
        <div>
          <p className="task-kicker">Work tracker</p>
          <h2>Tasks</h2>
          <p>Create tasks, tag people, track subtasks and collect updates in one place.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><MdAdd /> New Task</button>
      </div>

      <div className="task-stats">
        <div className="task-stat">
          <span>Total</span>
          <strong>{taskCounts.total}</strong>
        </div>
        <div className="task-stat success">
          <span>Completed</span>
          <strong>{taskCounts.completed}</strong>
        </div>
        <div className="task-stat danger">
          <span>Needs Attention</span>
          <strong>{taskCounts.risk}</strong>
        </div>
      </div>

      {error && <div className="toast toast-error task-error">{error}</div>}

      <div className="task-filter-bar">
        <select className="form-select" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
          <option value="">All Status</option>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="form-select" value={filters.assigned_to} onChange={(e) => setFilters((prev) => ({ ...prev, assigned_to: e.target.value }))}>
          <option value="">All Tagged People</option>
          {assignees.map((user) => <option key={user.user_id} value={user.user_id}>{personName(user)}</option>)}
        </select>
        <div className="task-search">
          <MdSearch />
          <input value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder="Search tasks" />
        </div>
        <button className="btn btn-secondary" onClick={loadTasks}>Search</button>
        <button className="btn btn-secondary" onClick={() => setFilters({ status: '', assigned_to: '', search: '' })}>Clear</button>
      </div>

      <div className={`task-workspace ${selectedTaskFresh ? 'has-detail' : ''}`}>
        <section className="task-list-panel">
          <div className="task-panel-heading">
            <h3>Task List</h3>
            <span>{tasks.length} items</span>
          </div>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : tasks.length === 0 ? (
            <div className="empty-state"><p>No tasks found</p></div>
          ) : (
            <div className="task-card-list">
              {tasks.map((task) => {
                const doneCount = task.subtasks?.filter((item) => item.status === 'completed').length || 0;
                const totalSubtasks = task.subtasks?.length || 0;
                const progress = totalSubtasks ? Math.round((doneCount / totalSubtasks) * 100) : 0;
                return (
                  <button
                    key={task.task_id}
                    className={`task-list-card ${selectedTaskFresh?.task_id === task.task_id ? 'active' : ''} ${task.status === 'completed' ? 'is-complete' : ''}`}
                    onClick={() => setSelectedTask(task)}
                  >
                    <div className="task-list-top">
                      <span className={`badge badge-${task.status}`}>{statusLabel(task.status)}</span>
                      <small>{task.task_id}</small>
                    </div>
                    <strong>{task.title}</strong>
                    {task.description ? <p>{task.description}</p> : null}
                    <div className="task-meta-row">
                      <TaskMeta icon={<MdPerson />}>{task.assignee_names?.join(', ') || 'None'}</TaskMeta>
                      {task.due_date ? <TaskMeta icon={<MdEvent />}>{task.due_date}</TaskMeta> : null}
                    </div>
                    <div className="task-progress">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="task-list-foot">
                      <span>{doneCount}/{totalSubtasks} subtasks</span>
                      <span>{task.comments?.length || 0} updates</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selectedTaskFresh && (
          <aside className="task-detail-panel">
            <div className="task-detail-header">
              <div>
                <span className={`badge badge-${selectedTaskFresh.status}`}>{statusLabel(selectedTaskFresh.status)}</span>
                <h3>{selectedTaskFresh.title}</h3>
                <small>{selectedTaskFresh.task_id}</small>
              </div>
              <button className="btn-icon" onClick={() => setSelectedTask(null)}><MdClose /></button>
            </div>

            <div className="task-detail-grid">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={selectedTaskFresh.status} onChange={(e) => updateTask(selectedTaskFresh, { status: e.target.value })}>
                  {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input className="form-input" type="date" value={selectedTaskFresh.due_date || ''} onChange={(e) => updateTask(selectedTaskFresh, { due_date: e.target.value || null })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tagged People</label>
              <AssigneeChecks
                users={assignees}
                selected={selectedTaskFresh.assignee_user_ids || []}
                onChange={(next) => updateTask(selectedTaskFresh, { assignee_user_ids: next })}
              />
            </div>

            {selectedTaskFresh.description ? <p className="task-description">{selectedTaskFresh.description}</p> : null}

            <section className="task-section">
              <div className="task-section-heading">
                <h4>Subtasks</h4>
                <span>{selectedTaskFresh.subtasks?.length || 0}</span>
              </div>
              <div className="task-subtask-list">
                {(selectedTaskFresh.subtasks || []).map((subtask) => (
                  <div key={subtask.subtask_id} className={`task-subtask ${subtask.status === 'completed' ? 'is-complete' : ''}`}>
                    <div className="task-subtask-main">
                      <MdTaskAlt />
                      <div>
                        <strong>{subtask.title}</strong>
                        <span>Tagged: {subtask.assignee_names?.join(', ') || 'None'}</span>
                      </div>
                    </div>
                    <div className="task-subtask-actions">
                      <input className="form-input" type="date" value={subtask.due_date || ''} onChange={(e) => updateSubtask(subtask, { due_date: e.target.value || null })} />
                      <select className="form-select" value={subtask.status} onChange={(e) => updateSubtask(subtask, { status: e.target.value })}>
                        {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="task-add-subtask">
                <input className="form-input" value={subtaskForm.title} onChange={(e) => setSubtaskForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="New subtask" />
                <input className="form-input" type="date" value={subtaskForm.due_date} onChange={(e) => setSubtaskForm((prev) => ({ ...prev, due_date: e.target.value }))} />
                <AssigneeChecks users={assignees} selected={subtaskForm.assignee_user_ids} onChange={(next) => setSubtaskForm((prev) => ({ ...prev, assignee_user_ids: next }))} />
                <button className="btn btn-secondary btn-sm" onClick={addSubtask} disabled={saving}><MdAdd /> Add Subtask</button>
              </div>
            </section>

            <section className="task-section">
              <div className="task-section-heading">
                <h4>Updates</h4>
                <span>{selectedTaskFresh.comments?.length || 0}</span>
              </div>
              <div className="task-comment-list">
                {(selectedTaskFresh.comments || []).length === 0 ? (
                  <div className="task-muted">No updates yet</div>
                ) : selectedTaskFresh.comments.map((comment) => (
                  <div key={comment.comment_id} className="task-comment">
                    <strong>{comment.created_by_name || comment.created_by_user_id}</strong>
                    <p>{comment.comment}</p>
                    <span>{comment.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                ))}
              </div>
              <div className="task-comment-box">
                <input className="form-input" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add update comment" />
                <button className="btn btn-primary" onClick={addComment} disabled={saving}><MdComment /> Add</button>
              </div>
            </section>
          </aside>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal task-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Task</h3>
              <button className="btn-icon" onClick={() => setShowCreate(false)}><MdClose /></button>
            </div>
            <div className="modal-body">
              <div className="task-modal-grid">
                <div className="form-group form-full">
                  <label className="form-label">Task Title</label>
                  <input className="form-input" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Task title" />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Details" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                    {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input className="form-input" type="date" value={form.due_date} onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))} />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Tag People</label>
                  <AssigneeChecks users={assignees} selected={form.assignee_user_ids} onChange={(next) => setForm((prev) => ({ ...prev, assignee_user_ids: next }))} />
                </div>
                <div className="form-full">
                  <div className="task-section-heading">
                    <h4>Subtasks</h4>
                    <button className="btn btn-secondary btn-sm" onClick={addDraftSubtask}><MdAdd /> Add Subtask</button>
                  </div>
                  <div className="task-draft-subtasks">
                    {form.subtasks.map((subtask, index) => (
                      <div key={index} className="task-draft-subtask">
                        <div className="task-draft-row">
                          <input
                            className="form-input"
                            value={subtask.title}
                            onChange={(e) => setForm((prev) => ({
                              ...prev,
                              subtasks: prev.subtasks.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item),
                            }))}
                            placeholder={`Subtask ${index + 1}`}
                          />
                          <input
                            className="form-input"
                            type="date"
                            value={subtask.due_date}
                            onChange={(e) => setForm((prev) => ({
                              ...prev,
                              subtasks: prev.subtasks.map((item, itemIndex) => itemIndex === index ? { ...item, due_date: e.target.value } : item),
                            }))}
                          />
                        </div>
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
