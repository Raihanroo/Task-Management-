import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, ProjectCreateInput, ProjectUpdateInput } from '../../types';
import { projectService, extractErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/common/Modal';
import { QuotaAlert } from '../../components/common/QuotaAlert';
import {
  FolderKanban,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  UserCheck,
  Crown,
  Calendar,
  AlertCircle,
} from 'lucide-react';

export const ProjectsListPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  // Create Project Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProjectCreateInput>({ title: '', description: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit Project Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState<ProjectUpdateInput>({ title: '', description: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete Confirmation State
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      setPageError(null);
      const data = await projectService.getAll();
      setProjects(data);
    } catch (err: unknown) {
      setPageError(extractErrorMessage(err, 'Failed to load projects.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const q = searchTerm.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.id.toString().includes(q)
      );
    });
  }, [projects, searchTerm]);

  // Handle Project Creation (Notice: preserves form inputs on quota limit 400 error)
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError('Project title is required.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);

    try {
      const newProj = await projectService.create({
        title: createForm.title.trim(),
        description: createForm.description?.trim() || null,
      });
      setProjects((prev) => [...prev, newProj]);
      setIsCreateOpen(false);
      setCreateForm({ title: '', description: '' });
    } catch (err: unknown) {
      // Retain form inputs! Display exact backend message.
      setCreateError(extractErrorMessage(err, 'Failed to create project.'));
    } finally {
      setIsCreating(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setEditForm({
      title: project.title,
      description: project.description || '',
    });
    setEditError(null);
    setIsEditOpen(true);
  };

  // Handle Project Update
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    if (!editForm.title?.trim()) {
      setEditError('Project title is required.');
      return;
    }

    setEditError(null);
    setIsUpdating(true);

    try {
      const updated = await projectService.update(editingProject.id, {
        title: editForm.title.trim(),
        description: editForm.description?.trim() || null,
      });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setIsEditOpen(false);
      setEditingProject(null);
    } catch (err: unknown) {
      setEditError(extractErrorMessage(err, 'Failed to update project.'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Project Deletion
  const handleDeleteProject = async (projectId: number) => {
    if (!window.confirm('Are you sure you want to delete this project and all its associated tasks?')) {
      return;
    }

    setDeletingId(projectId);
    try {
      await projectService.delete(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: unknown) {
      alert(extractErrorMessage(err, 'Failed to delete project.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-indigo-600" />
            <span>Projects Workspace</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your project folders, task boards, and team collaborations.
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
          <span>New Project</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {pageError && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{pageError}</p>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search projects by title, description, or ID..."
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-800">No projects found</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            {searchTerm
              ? 'No projects matched your search criteria.'
              : 'You do not have any accessible projects yet. Create your first project above!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const isOwner = currentUser?.id === project.owner_id;
            const canManage = isOwner || isAdmin;

            return (
              <div
                key={project.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="text-xs font-mono font-medium text-gray-400">
                      #{project.id}
                    </span>

                    {/* Role Indicator Badge */}
                    {isOwner ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <Crown className="w-3 h-3 text-indigo-600" />
                        <span>Owner</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        <UserCheck className="w-3 h-3 text-emerald-600" />
                        <span>Collaborator</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-1.5 leading-snug line-clamp-1">
                    {project.title}
                  </h3>

                  <p className="text-sm text-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">
                    {project.description || <span className="italic text-gray-400">No description provided</span>}
                  </p>

                  {project.created_at && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(project.created_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <span>Open Workspace</span>
                    <ExternalLink className="w-4 h-4" />
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(project)}
                        className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-md hover:bg-gray-200 transition-colors"
                        title="Edit Project Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        disabled={deletingId === project.id}
                        className="p-1.5 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Project"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <QuotaAlert message={createError} />

          <div>
            <label htmlFor="create-title" className="block text-sm font-medium text-gray-700 mb-1">
              Project Title *
            </label>
            <input
              id="create-title"
              type="text"
              required
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              placeholder="e.g., Marketing Campaign"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="create-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="create-desc"
              rows={3}
              value={createForm.description || ''}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Brief details or scope of this project..."
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
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Project"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="rounded-md bg-red-50 p-3 border border-red-200 text-sm text-red-700">
              {editError}
            </div>
          )}

          <div>
            <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">
              Project Title *
            </label>
            <input
              id="edit-title"
              type="text"
              required
              value={editForm.title || ''}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="edit-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="edit-desc"
              rows={3}
              value={editForm.description || ''}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
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
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
