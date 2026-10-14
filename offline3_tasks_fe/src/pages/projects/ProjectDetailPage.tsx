import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Project, ProjectAccess, ProjectMember, Task, ProjectTaskCreateInput, TaskUpdateInput } from '../../types';
import { projectService, taskService, extractErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/common/Modal';
import { QuotaAlert } from '../../components/common/QuotaAlert';
import { MembersPanel } from '../../components/projects/MembersPanel';
import {
  ArrowLeft,
  Crown,
  UserCheck,
  Plus,
  CheckCircle,
  Circle,
  Edit2,
  Trash2,
  User,
  Info,
  AlertCircle,
  Calendar,
} from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Create Task Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProjectTaskCreateInput>({
    title: '',
    description: '',
    assigned_to_username: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit Task Modal State
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

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [access, setAccess] = useState<ProjectAccess | null>(null);

  const isOwner = currentUser?.id === project?.owner_id;
  // What the current user may do comes from the backend (GET /projects/{id}/my-access)
  const canEditTasks = access?.can_edit ?? false; // owner, admin, or editor member
  const canManageMembers = access?.can_manage_members ?? (isOwner || isAdmin);
  const canReassign = isOwner || isAdmin; // backend: only owner/admin reassign tasks
  const canDeleteTasks = isOwner || isAdmin; // backend: only owner/admin delete tasks
  const memberName = (userId: number | null) =>
    members.find((m) => m.user_id === userId)?.username ?? null;
  const isCollaborator = !isOwner && !isAdmin;

  const loadData = useCallback(async () => {
    if (isNaN(projectId)) {
      setPageError('Invalid project ID.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setPageError(null);
      const [projData, tasksData, accessData] = await Promise.all([
        projectService.getById(projectId),
        projectService.getTasks(projectId),
        projectService.getMyAccess(projectId),
      ]);
      setProject(projData);
      setTasks(tasksData);
      setAccess(accessData);
    } catch (err: unknown) {
      setPageError(extractErrorMessage(err, 'Failed to load project details.'));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshTasks = useCallback(async () => {
    try {
      setTasks(await projectService.getTasks(projectId));
    } catch {
      /* keep current list */
    }
  }, [projectId]);

  // Fast-toggle completion status with optimistic UI update
  const handleToggleStatus = async (task: Task) => {
    const originalTasks = [...tasks];
    const newStatus = !task.completed;

    // Optimistic Update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: newStatus } : t))
    );

    try {
      await taskService.toggleStatus(task.id, newStatus);
    } catch (err: unknown) {
      // Revert on network failure
      setTasks(originalTasks);
      alert(extractErrorMessage(err, 'Failed to update task status.'));
    }
  };

  // Submit Create Task (Retains typed input on Quota Limit error 400)
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError('Task title is required.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);

    try {
      const newTask = await projectService.createTask(projectId, {
        title: createForm.title.trim(),
        description: createForm.description?.trim() || null,
        assigned_to_username: createForm.assigned_to_username?.trim() || null,
      });
      setTasks((prev) => [...prev, newTask]);
      setIsCreateOpen(false);
      setCreateForm({ title: '', description: '', assigned_to_username: '' });
    } catch (err: unknown) {
      // Retain form inputs! Show exact backend message.
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
      assigned_to_username: task.assigned_to_username || memberName(task.assigned_to_id) || '',
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
        ...(canReassign
          ? { assigned_to_username: editForm.assigned_to_username?.trim() || null }
          : {}),
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (pageError || !project) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/projects')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </button>
        <div className="rounded-md bg-red-50 p-6 border border-red-200 text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-red-800">Project Not Accessible</h3>
          <p className="text-sm text-red-700 mt-1">{pageError || 'Project could not be found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </Link>
      </div>

      {/* Project Header Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs font-mono font-medium text-gray-400">
                Project #{project.id}
              </span>
              {isOwner ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  <Crown className="w-3 h-3 text-indigo-600" />
                  <span>Project Owner</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <UserCheck className="w-3 h-3 text-emerald-600" />
                  <span>Assigned Collaborator</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              {project.description || <span className="italic text-gray-400">No description provided</span>}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canEditTasks && (
              <button
                onClick={() => {
                  setCreateError(null);
                  setIsCreateOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New Task</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Collaborator Visibility Notice */}
      {isCollaborator && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>Collaborator Notice:</strong> You are viewing tasks in this project as an assigned collaborator. By security design, you only see tasks assigned directly to your user account.
          </div>
        </div>
      )}

      {/* Members & Access (owner/admin only) */}
      {canManageMembers && (
        <MembersPanel
          project={project}
          ownerName={isOwner ? currentUser?.username : null}
          tasks={tasks}
          onMembersChange={setMembers}
          onTasksNeedRefresh={refreshTasks}
        />
      )}

      {/* Tasks Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Project Tasks ({tasks.length})
          </h2>
        </div>

        {tasks.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
            <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-gray-700">No tasks in this project</h3>
            <p className="text-xs text-gray-500 mt-1">
              {isCollaborator
                ? 'No tasks are currently assigned to you in this project.'
                : 'Click "New Task" above to add the first task to this project workspace.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 shadow-sm overflow-hidden">
            {tasks.map((task) => {
              const isAssignee = currentUser?.id === task.assigned_to_id;
              const canDelete = canDeleteTasks;
              const canEditDetails = canEditTasks;

              return (
                <div
                  key={task.id}
                  className="p-4 sm:px-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Status Toggle Checkbox */}
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

                        {(task.assigned_to_username || task.assigned_to_id) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                            <User className="w-3 h-3 text-gray-500" />
                            <span>
                              Assigned: {isAssignee ? 'You' : (task.assigned_to_username || memberName(task.assigned_to_id) ? `@${task.assigned_to_username || memberName(task.assigned_to_id)}` : `User #${task.assigned_to_id}`)}
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

                  {/* Task Quick Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    {/* Edit Task (Project Owner, Admin, Creator, or collaborator with edit rights) */}
                    {canEditDetails && (
                      <button
                        onClick={() => openEditModal(task)}
                        className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-md hover:bg-gray-100 transition-colors"
                        title="Edit Task Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete Task (Project Owner, Admin, Creator) */}
                    {canDelete && (
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
      </div>

      {/* Create Task Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add Task to Project"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <QuotaAlert message={createError} />

          <div>
            <label htmlFor="proj-task-title" className="block text-sm font-medium text-gray-700 mb-1">
              Task Title *
            </label>
            <input
              id="proj-task-title"
              type="text"
              required
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="e.g., Draft design documents"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="proj-task-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="proj-task-desc"
              rows={3}
              value={createForm.description || ''}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Provide context or instructions for this task..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="proj-task-assignee" className="block text-sm font-medium text-gray-700 mb-1">
              Assign to Username (Optional)
            </label>
            <input
              id="proj-task-assignee"
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
              {isCreating ? 'Adding Task...' : 'Add Task'}
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
            <label htmlFor="edit-task-title" className="block text-sm font-medium text-gray-700 mb-1">
              Task Title *
            </label>
            <input
              id="edit-task-title"
              type="text"
              required
              value={editForm.title || ''}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="edit-task-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="edit-task-desc"
              rows={3}
              value={editForm.description || ''}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {canReassign && (
            <div>
              <label htmlFor="edit-task-assignee" className="block text-sm font-medium text-gray-700 mb-1">
                Assign to Username (Optional)
              </label>
              <input
                id="edit-task-assignee"
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
          )}

          <div className="flex items-center gap-2 pt-1">
            <input
              id="edit-task-completed"
              type="checkbox"
              checked={editForm.completed || false}
              onChange={(e) => setEditForm({ ...editForm, completed: e.target.checked })}
              className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <label htmlFor="edit-task-completed" className="text-sm font-medium text-gray-700">
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
