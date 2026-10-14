import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, UserDetail, SystemSettings, UserLimitsUpdateInput } from '../../types';
import { adminService, extractErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/common/Modal';
import {
  ShieldCheck,
  Users,
  Sliders,
  Search,
  CheckCircle,
  Ban,
  Trash2,
  Settings,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FolderKanban,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'users' | 'settings'>('users');

  // --- Users State ---
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [userActionError, setUserActionError] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);

  // --- Pagination State ---
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // --- Limits Inspector Modal State ---
  const [isLimitsOpen, setIsLimitsOpen] = useState(false);
  const [inspectingUserDetail, setInspectingUserDetail] = useState<UserDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [limitsForm, setLimitsForm] = useState<UserLimitsUpdateInput>({
    max_projects: null,
    max_tasks: null,
    max_tasks_per_project: null,
  });
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [limitsSuccess, setLimitsSuccess] = useState<string | null>(null);
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  // --- Global Settings State ---
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    default_max_projects_per_user: 5,
    default_max_tasks_per_user: 50,
    default_max_tasks_per_project: 20,
  });
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Fetch Users (backend paginated)
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoadingUsers(true);
      setUserActionError(null);
      const data = await adminService.getUsers({
        page: currentPage,
        limit: pageSize,
        include_deleted: includeDeleted,
      });
      setUsers(data.users);
      setTotalUsers(data.total_users);
      const backendTotalPages = data.total_pages > 0 ? data.total_pages : 1;
      setTotalPages(backendTotalPages);
      if (currentPage > backendTotalPages) {
        setCurrentPage(backendTotalPages);
      }
    } catch (err: unknown) {
      setUserActionError(extractErrorMessage(err, 'Failed to load users.'));
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentPage, pageSize, includeDeleted]);

  // Fetch Settings
  const fetchSettings = useCallback(async () => {
    try {
      setIsLoadingSettings(true);
      setSettingsError(null);
      const data = await adminService.getSettings();
      setSettings(data);
      setSettingsForm({
        default_max_projects_per_user: data.default_max_projects_per_user,
        default_max_tasks_per_user: data.default_max_tasks_per_user,
        default_max_tasks_per_project: data.default_max_tasks_per_project,
      });
    } catch (err: unknown) {
      setSettingsError(extractErrorMessage(err, 'Failed to load system settings.'));
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab, fetchUsers]);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchSettings();
    }
  }, [activeTab, fetchSettings]);

  // Filtered Users on the current page (client search across currently loaded page)
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const q = searchTerm.toLowerCase();
    return users.filter((u) => {
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toString().includes(q)
      );
    });
  }, [users, searchTerm]);

  // Toggle User Status (Ban / Reactivate)
  const handleToggleStatus = async (user: User) => {
    if (user.id === currentUser?.id) {
      setUserActionError('Cannot deactivate or ban your own account.');
      return;
    }

    const newActive = !user.is_active;
    const confirmMsg = newActive
      ? `Reactivate account for ${user.username}?`
      : `Ban (deactivate) user ${user.username}? Their session will be revoked immediately.`;

    if (!window.confirm(confirmMsg)) return;

    setActionInProgressId(user.id);
    setUserActionError(null);

    try {
      const updated = await adminService.updateUserStatus(user.id, newActive);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err: unknown) {
      setUserActionError(extractErrorMessage(err, 'Failed to update user status.'));
    } finally {
      setActionInProgressId(null);
    }
  };

  // Soft Delete User
  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      setUserActionError('Cannot delete your own account.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete user ${user.username}? This soft-deletes and deactivates the user.`)) {
      return;
    }

    setActionInProgressId(user.id);
    setUserActionError(null);

    try {
      await adminService.deleteUser(user.id);
      fetchUsers();
    } catch (err: unknown) {
      setUserActionError(extractErrorMessage(err, 'Failed to delete user.'));
    } finally {
      setActionInProgressId(null);
    }
  };

  // Open User Limits Inspector
  const openLimitsModal = async (userId: number) => {
    setIsLimitsOpen(true);
    setIsLoadingDetail(true);
    setLimitsError(null);
    setLimitsSuccess(null);
    setInspectingUserDetail(null);

    try {
      const detail = await adminService.getUserDetail(userId);
      setInspectingUserDetail(detail);
      setLimitsForm({
        max_projects: detail.effective_max_projects,
        max_tasks: detail.effective_max_tasks,
        max_tasks_per_project: detail.effective_max_tasks_per_project,
      });
    } catch (err: unknown) {
      setLimitsError(extractErrorMessage(err, 'Failed to load user limits and counters.'));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Save User Limits Overrides
  const handleSaveUserLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingUserDetail) return;

    setLimitsError(null);
    setLimitsSuccess(null);
    setIsSavingLimits(true);

    try {
      await adminService.setUserLimits(inspectingUserDetail.user.id, {
        max_projects: limitsForm.max_projects ? Number(limitsForm.max_projects) : null,
        max_tasks: limitsForm.max_tasks ? Number(limitsForm.max_tasks) : null,
        max_tasks_per_project: limitsForm.max_tasks_per_project ? Number(limitsForm.max_tasks_per_project) : null,
      });
      setLimitsSuccess('User limits successfully overridden!');
      // Re-fetch detail
      const updatedDetail = await adminService.getUserDetail(inspectingUserDetail.user.id);
      setInspectingUserDetail(updatedDetail);
    } catch (err: unknown) {
      setLimitsError(extractErrorMessage(err, 'Failed to save custom limits.'));
    } finally {
      setIsSavingLimits(false);
    }
  };

  // Reset User Limits to Global Defaults
  const handleResetUserLimits = async () => {
    if (!inspectingUserDetail) return;
    if (!window.confirm('Reset this user limits back to global defaults?')) return;

    setLimitsError(null);
    setLimitsSuccess(null);
    setIsSavingLimits(true);

    try {
      await adminService.resetUserLimits(inspectingUserDetail.user.id);
      setLimitsSuccess('Limits reset to global defaults successfully!');
      const updatedDetail = await adminService.getUserDetail(inspectingUserDetail.user.id);
      setInspectingUserDetail(updatedDetail);
      setLimitsForm({
        max_projects: updatedDetail.effective_max_projects,
        max_tasks: updatedDetail.effective_max_tasks,
        max_tasks_per_project: updatedDetail.effective_max_tasks_per_project,
      });
    } catch (err: unknown) {
      setLimitsError(extractErrorMessage(err, 'Failed to reset user limits.'));
    } finally {
      setIsSavingLimits(false);
    }
  };

  // Save Global Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);
    setIsSavingSettings(true);

    try {
      const updated = await adminService.updateSettings({
        default_max_projects_per_user: Number(settingsForm.default_max_projects_per_user),
        default_max_tasks_per_user: Number(settingsForm.default_max_tasks_per_user),
        default_max_tasks_per_project: Number(settingsForm.default_max_tasks_per_project),
      });
      setSettings(updated);
      setSettingsSuccess('Global quotas updated successfully!');
    } catch (err: unknown) {
      setSettingsError(extractErrorMessage(err, 'Failed to update system settings.'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-purple-600" />
          <span>Administration Dashboard</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          System oversight, user management, and quota limit configuration.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'users'
                ? 'border-purple-600 text-purple-600 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Directory</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-purple-600 text-purple-600 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Global Quotas & Settings</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: User Directory */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {userActionError && (
            <div className="rounded-md bg-red-50 p-4 border border-red-200 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{userActionError}</p>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter users by username, email, ID..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => {
                    setIncludeDeleted(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                />
                <span>Include deleted users</span>
              </label>

              <button
                onClick={fetchUsers}
                disabled={isLoadingUsers}
                className="p-2 text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
                title="Refresh user list"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin text-purple-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Users Table */}
          {isLoadingUsers && users.length === 0 ? (
            <div className="flex justify-center items-center py-16">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 font-semibold">
                  <tr>
                    <th scope="col" className="px-6 py-3">ID</th>
                    <th scope="col" className="px-6 py-3">User</th>
                    <th scope="col" className="px-6 py-3">Role</th>
                    <th scope="col" className="px-6 py-3">Status</th>
                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        {searchTerm.trim() ? 'No users matching your search on this page.' : 'No users found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.id === currentUser?.id;

                      let statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span>Active</span>
                        </span>
                      );

                      if (u.is_deleted) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-300">
                            <span>Deleted</span>
                          </span>
                        );
                      } else if (!u.is_active) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                            <Ban className="w-3 h-3 text-red-600" />
                            <span>Banned</span>
                          </span>
                        );
                      }

                      return (
                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-gray-500">#{u.id}</td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{u.username}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                                u.role === 'admin'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">{statusBadge}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Limits Inspector */}
                              <button
                                onClick={() => openLimitsModal(u.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                                title="Inspect & Override Limits"
                              >
                                <Settings className="w-3.5 h-3.5 text-gray-500" />
                                <span>Limits</span>
                              </button>

                              {/* Toggle Status: Ban / Reactivate */}
                              <button
                                onClick={() => handleToggleStatus(u)}
                                disabled={isSelf || actionInProgressId === u.id || u.is_deleted}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  u.is_active
                                    ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                                    : 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-200'
                                }`}
                                title={isSelf ? 'Cannot modify your own status' : u.is_active ? 'Ban User' : 'Reactivate User'}
                              >
                                {u.is_active ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                <span>{u.is_active ? 'Ban' : 'Reactivate'}</span>
                              </button>

                              {/* Soft Delete */}
                              <button
                                onClick={() => handleDeleteUser(u)}
                                disabled={isSelf || actionInProgressId === u.id || u.is_deleted}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                title={isSelf ? 'Cannot delete your own account' : 'Soft Delete User'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

              {/* Pagination Controls */}
              {totalUsers > 0 && (
                <div className="bg-white px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span>
                      {searchTerm.trim() ? (
                        <>
                          Showing <span className="font-semibold text-gray-900">{filteredUsers.length}</span> matches on page{' '}
                          <span className="font-semibold text-gray-900">{currentPage}</span> of{' '}
                          <span className="font-semibold text-gray-900">{totalUsers}</span> users
                        </>
                      ) : (
                        <>
                          Showing{' '}
                          <span className="font-semibold text-gray-900">
                            {totalUsers === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                          </span>{' '}
                          to{' '}
                          <span className="font-semibold text-gray-900">
                            {Math.min(currentPage * pageSize, totalUsers)}
                          </span>{' '}
                          of <span className="font-semibold text-gray-900">{totalUsers}</span> users
                        </>
                      )}
                    </span>

                    <div className="flex items-center gap-1.5 ml-2 border-l border-gray-200 pl-3">
                      <label htmlFor="user-page-size" className="text-gray-500 whitespace-nowrap">
                        Per page:
                      </label>
                      <select
                        id="user-page-size"
                        value={pageSize}
                        disabled={isLoadingUsers}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={15}>15</option>
                        <option value={20}>20</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage <= 1 || isLoadingUsers}
                      className="p-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                        .map((page, idx, arr) => {
                          const prev = arr[idx - 1];
                          return (
                            <React.Fragment key={page}>
                              {prev && page - prev > 1 && (
                                <span className="px-1 text-xs text-gray-400">...</span>
                              )}
                              <button
                                onClick={() => setCurrentPage(page)}
                                disabled={isLoadingUsers}
                                className={`min-w-[28px] h-7 px-2 rounded-md text-xs font-medium transition-colors ${
                                  currentPage === page
                                    ? 'bg-purple-600 text-white font-bold'
                                    : 'text-gray-700 hover:bg-gray-100 border border-gray-200'
                                } disabled:opacity-50`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    <button
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage >= totalPages || isLoadingUsers}
                      className="p-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Global Quotas & Settings */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-2xl">
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            Global Creation Quota Defaults
          </h2>
          <p className="text-xs text-gray-500 mb-6">
            These values dictate default creation limits across all standard users unless overridden individually.
          </p>

          {settingsError && (
            <div className="mb-4 rounded-md bg-red-50 p-3 border border-red-200 text-sm text-red-700">
              {settingsError}
            </div>
          )}

          {settingsSuccess && (
            <div className="mb-4 rounded-md bg-green-50 p-3 border border-green-200 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>{settingsSuccess}</span>
            </div>
          )}

          {isLoadingSettings ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div>
                <label
                  htmlFor="max-proj-user"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Default Max Projects Per User
                </label>
                <input
                  id="max-proj-user"
                  type="number"
                  min="0"
                  required
                  value={settingsForm.default_max_projects_per_user}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      default_max_projects_per_user: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label
                  htmlFor="max-tasks-user"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Default Max Tasks Per User (Total Across All Projects & Standalone)
                </label>
                <input
                  id="max-tasks-user"
                  type="number"
                  min="0"
                  required
                  value={settingsForm.default_max_tasks_per_user}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      default_max_tasks_per_user: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label
                  htmlFor="max-tasks-proj"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Default Max Tasks Per Project
                </label>
                <input
                  id="max-tasks-proj"
                  type="number"
                  min="0"
                  required
                  value={settingsForm.default_max_tasks_per_project}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      default_max_tasks_per_project: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {isSavingSettings ? 'Updating...' : 'Save Global Quotas'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* User Limits & Usage Inspector Modal */}
      <Modal
        isOpen={isLimitsOpen}
        onClose={() => setIsLimitsOpen(false)}
        title={
          inspectingUserDetail
            ? `Quota & Usage Inspector: ${inspectingUserDetail.user.username} (#${inspectingUserDetail.user.id})`
            : 'User Quota Inspector'
        }
      >
        {isLoadingDetail ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : inspectingUserDetail ? (
          <div className="space-y-5">
            {/* Live Usage Counters */}
            <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-indigo-600" />
                <div>
                  <div className="text-xs text-gray-500">Live Projects</div>
                  <div className="text-base font-bold text-gray-800">
                    {inspectingUserDetail.projects_count}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="text-xs text-gray-500">Live Tasks</div>
                  <div className="text-base font-bold text-gray-800">
                    {inspectingUserDetail.tasks_count}
                  </div>
                </div>
              </div>
            </div>

            {limitsError && (
              <div className="rounded-md bg-red-50 p-3 border border-red-200 text-sm text-red-700">
                {limitsError}
              </div>
            )}

            {limitsSuccess && (
              <div className="rounded-md bg-green-50 p-3 border border-green-200 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>{limitsSuccess}</span>
              </div>
            )}

            {/* Overrides Form */}
            <form onSubmit={handleSaveUserLimits} className="space-y-4">
              <p className="text-xs text-gray-500">
                Define custom overrides for this user. Leave empty or click reset to revert to system defaults.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Effective Max Projects
                </label>
                <input
                  type="number"
                  min="0"
                  value={limitsForm.max_projects ?? ''}
                  onChange={(e) =>
                    setLimitsForm({
                      ...limitsForm,
                      max_projects: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder={`Global default (${settings?.default_max_projects_per_user || 5})`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Effective Max Tasks (Total)
                </label>
                <input
                  type="number"
                  min="0"
                  value={limitsForm.max_tasks ?? ''}
                  onChange={(e) =>
                    setLimitsForm({
                      ...limitsForm,
                      max_tasks: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder={`Global default (${settings?.default_max_tasks_per_user || 50})`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Effective Max Tasks Per Project
                </label>
                <input
                  type="number"
                  min="0"
                  value={limitsForm.max_tasks_per_project ?? ''}
                  onChange={(e) =>
                    setLimitsForm({
                      ...limitsForm,
                      max_tasks_per_project: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder={`Global default (${settings?.default_max_tasks_per_project || 20})`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleResetUserLimits}
                  disabled={isSavingLimits}
                  className="text-xs text-red-600 hover:text-red-800 underline font-medium"
                >
                  Reset to Global Defaults
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLimitsOpen(false)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingLimits}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isSavingLimits ? 'Saving...' : 'Apply Overrides'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
