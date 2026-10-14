import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Task, TaskCreateInput, TaskUpdateInput } from '../../types';
import { taskService, extractErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/common/Modal';
import { QuotaAlert } from '../../components/common/QuotaAlert';
import {
  CheckSquare,
  Plus,
  Search,
  CheckCircle,
  Circle,
  Edit2,
  Trash2,
  FolderKanban,
  User,
  AlertCircle,
  Calendar,
} from 'lucide-react';

export const TasksListPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'standalone' | 'project'>('all');

  // Create Task Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TaskCreateInput>({
    title: '',
    description: '',
    project_id: null,
    assigned_to_username: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit Task Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<TaskUpdateInput>({
    title: '',
    description: '',
    completed: false,
    assigned_to_username: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError(null);
      const data = await taskService.getAll();
      setTasks(data);
    } catch (err: unknown) {
      setPageError(extractErrorMessage(err, 'Failed to load tasks.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.id.toString().includes(q);

      // Status
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !t.completed) ||
        (statusFilter === 'completed' && t.completed);

      // Scope
      const matchesScope =
        scopeFilter === 'all' ||
        (scopeFilter === 'standalone' && t.project_id === null) ||
        (scopeFilter === 'project' && t.project_id !== null);

      return matchesSearch && matchesStatus && matchesScope;
    });
  }, [tasks, searchTerm, statusFilter, scopeFilter]);

  // Fast-toggle completion status with optimistic UI update
  const handleToggleStatus = async (task: Task) => {
    const originalTasks = [...tasks];
    const newStatus = !task.completed;

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: newStatus } : t))
    );

    try {
      await taskService.toggleStatus(task.id, newStatus);
    } catch (err: unknown) {
      setTasks(originalTasks);
      alert(extractErrorMessage(err, 'Failed to update task status.'));
    }
  };

  // Submit Create Standalone Task (Retains input on quota 400 error)
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError('Task title is required.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);

    try {
      const newTask = await taskService.create({
        title: createForm.title.trim(),
        description: createForm.description?.trim() || null,
        project_id: createForm.project_id ? Number(createForm.project_id) : null,
        assigned_to_username: createForm.assigned_to_username?.trim() || null,
      });
      setTasks((prev) => [...prev, newTask]);
      setIsCreateOpen(false);
      setCreateForm({ title: '', description: '', project_id: null, assigned_to_username: '' });
    } catch (err: unknown) {
      setCreateError(extractErrorMessage(err, 'Failed to create task.'));
    } finally {
      setIsCreating(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description || '',
      completed: task.completed,
      assigned_to_username: task.assigned_to_username || '',
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  // Submit Edit Task
  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    if (!editForm.title?.trim()) {
      setEditError('Task title is required.');
      return;
    }

    setEditError(null);
    setIsUpdating(true);

    try {
      const updated = await taskService.update(editingTask.id, {
        title: editForm.title.trim(),
        description: editForm.description?.trim() || null,
        completed: editForm.completed,
        assigned_to_username: editForm.assigned_to_username?.trim() || null,
      });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setIsEditOpen(false);
      setEditingTask(null);
    } catch (err: unknown) {
      setEditError(extractErrorMessage(err, 'Failed to update task.'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      await taskService.delete(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: unknown) {
      alert(extractErrorMessage(err, 'Failed to delete task.'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-600" />
            <span>My Tasks Workspace</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Personal standalone tasks and assigned project responsibilities.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateError(null);
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

      {pageError && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{pageError}</p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tasks by title, description, or ID..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex rounded-lg border border-gray-300 p-0.5 bg-gray-50 text-xs font-medium">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white shadow text-gray-900 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Status
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                statusFilter === 'active'
                  ? 'bg-white shadow text-gray-900 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                statusFilter === 'completed'
                  ? 'bg-white shadow text-gray-900 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Completed
            </button>
          </div>

          {/* Scope Filter */}
          <div className="flex rounded-lg border border-gray-300 p-0.5 bg-gray-50 text-xs font-medium">
            <button
              onClick={() => setScopeFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                scopeFilter === 'all'
                  ? 'bg-white shadow text-gray-900 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Scopes
            </button>
            <button
              onClick={() => setScopeFilter('standalone')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                scopeFilter === 'standalone'
                  ? 'bg-white shadow text-gray-900 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Standalone
            </button>
            <button
              onClick={() => setScopeFilter('project')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                scopeFilter === 'project'
                  ? 'bg-white shadow text-gray-900 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              In Projects
            </button>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <CheckSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-800">No tasks found</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'all' || scopeFilter !== 'all'
              ? 'No tasks matched your active filters.'
              : 'You do not have any tasks yet. Create a standalone task above to get started!'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 shadow-sm overflow-hidden">
          {filteredTasks.map((task) => {
            const isCreator = currentUser?.id === task.created_by_id;
            const isAssignee = currentUser?.id === task.assigned_to_id;
            // Standalone tasks: creator/admin edit + delete. Project tasks are managed
            // from their project page (backend enforces owner/editor rules there).
            const canManage = task.project_id === null && (isCreator || isAdmin);

            return (
              <div
                key={task.id}
                className="p-4 sm:px-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(task)}
                    className="mt-0.5 text-gray-400 hover:text-indigo-600 focus:outline-none transition-colors"
                    title={task.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.completed ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-semibold ${
                          task.completed ? 'line-through text-gray-400' : 'text-gray-900'
                        }`}
                      >
                        {task.title}
                      </span>

                      <span className="text-[11px] font-mono text-gray-400">
                        #{task.id}
                      </span>

                      {task.project_id ? (
                        <Link
                          to={`/projects/${task.project_id}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          <FolderKanban className="w-3 h-3 text-indigo-500" />
                          <span>Project #{task.project_id}</span>
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                          Standalone Task
                        </span>
                      )}

                      {(task.assigned_to_username || task.assigned_to_id) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                          <User className="w-3 h-3 text-gray-500" />
                          <span>
                            {isAssignee ? 'Assigned to You' : (task.assigned_to_username ? `@${task.assigned_to_username}` : `User #${task.assigned_to_id}`)}
                          </span>
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {task.created_at && (
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-1.5">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(task.created_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {canManage && (
                    <button
                      onClick={() => openEditModal(task)}
                      className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-md hover:bg-gray-100 transition-colors"
                      title="Edit Task Details"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}

                  {canManage && (
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-100 transition-colors"
                      title="Delete Task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Standalone Task Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Task"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <QuotaAlert message={createError} />

          <div>
            <label htmlFor="task-title" className="block text-sm font-medium text-gray-700 mb-1">
              Task Title *
            </label>
            <input
              id="task-title"
              type="text"
              required
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="e.g., File tax returns"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="task-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="task-desc"
              rows={3}
              value={createForm.description || ''}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Brief details or notes..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="task-proj" className="block text-sm font-medium text-gray-700 mb-1">
                Project ID (Optional)
              </label>
              <input
                id="task-proj"
                type="number"
                value={createForm.project_id || ''}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    project_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="Leave blank for standalone"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="task-assign" className="block text-sm font-medium text-gray-700 mb-1">
                Assign to Username (Optional)
              </label>
              <input
                id="task-assign"
                type="text"
                value={createForm.assigned_to_username || ''}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    assigned_to_username: e.target.value,
                  })
                }
                placeholder="e.g., bob"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isCreating ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Task Details"
      >
        <form onSubmit={handleEditTask} className="space-y-4">
          {editError && (
            <div className="rounded-md bg-red-50 p-3 border border-red-200 text-sm text-red-700">
              {editError}
            </div>
          )}

          <div>
            <label htmlFor="edit-task-title2" className="block text-sm font-medium text-gray-700 mb-1">
              Task Title *
            </label>
            <input
              id="edit-task-title2"
              type="text"
              required
              value={editForm.title || ''}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="edit-task-desc2" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="edit-task-desc2"
              rows={3}
              value={editForm.description || ''}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="edit-task-assign2" className="block text-sm font-medium text-gray-700 mb-1">
              Assign to Username (Optional)
            </label>
            <input
              id="edit-task-assign2"
              type="text"
              value={editForm.assigned_to_username || ''}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  assigned_to_username: e.target.value,
                })
              }
              placeholder="e.g., bob (leave empty for unassigned)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="edit-task-comp2"
              type="checkbox"
              checked={editForm.completed || false}
              onChange={(e) => setEditForm({ ...editForm, completed: e.target.checked })}
              className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <label htmlFor="edit-task-comp2" className="text-sm font-medium text-gray-700">
              Mark as completed
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsEditOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isUpdating ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
