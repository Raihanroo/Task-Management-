import React, { useCallback, useEffect, useState } from 'react';
import { Crown, Eye, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { Project, ProjectMember, Task } from '../../types';
import { projectService, extractErrorMessage } from '../../services/api';

interface MembersPanelProps {
  project: Project;
  ownerName?: string | null;
  tasks: Task[];
  // parent keeps its own copy of members (used to show @username on tasks)
  onMembersChange?: (members: ProjectMember[]) => void;
  // called after a removal because the backend unassigns that member's tasks
  onTasksNeedRefresh?: () => void;
}

export const MembersPanel: React.FC<MembersPanelProps> = ({
  project,
  ownerName,
  tasks,
  onMembersChange,
  onTasksNeedRefresh,
}) => {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  const applyMembers = useCallback(
    (next: ProjectMember[]) => {
      setMembers(next);
      onMembersChange?.(next);
    },
    [onMembersChange]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      applyMembers(await projectService.getMembers(project.id));
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to load members.'));
    } finally {
      setLoading(false);
    }
  }, [project.id, applyMembers]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) {
      setError('Please enter a username.');
      return;
    }
    setError(null);
    setAdding(true);
    try {
      const created = await projectService.addMember(project.id, { username: name, can_edit: canEdit });
      applyMembers([...members, created]);
      setUsername('');
      setCanEdit(false);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to add member.'));
    } finally {
      setAdding(false);
    }
  };

  const handleToggleEdit = async (m: ProjectMember) => {
    setBusyUserId(m.user_id);
    setError(null);
    try {
      const updated = await projectService.updateMemberPermission(project.id, m.user_id, !m.can_edit);
      applyMembers(members.map((x) => (x.user_id === m.user_id ? updated : x)));
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to update permission.'));
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (m: ProjectMember) => {
    const assigned = tasks.filter((t) => t.assigned_to_id === m.user_id).length;
    const warn = assigned
      ? `Remove @${m.username}? Their ${assigned} assigned task(s) will become unassigned.`
      : `Remove @${m.username} from this project?`;
    if (!window.confirm(warn)) return;
    setBusyUserId(m.user_id);
    setError(null);
    try {
      await projectService.removeMember(project.id, m.user_id);
      applyMembers(members.filter((x) => x.user_id !== m.user_id));
      if (assigned) onTasksNeedRefresh?.();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to remove member.'));
    } finally {
      setBusyUserId(null);
    }
  };

  const editors = members.filter((m) => m.can_edit).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">Members &amp; Access</h2>
        </div>
        <span className="text-xs text-gray-500">
          {members.length} member{members.length === 1 ? '' : 's'} · {editors} can edit
        </span>
      </div>

      <div className="p-6 space-y-5">
        {/* Add member */}
        <form onSubmit={handleAdd} className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="member-username" className="block text-sm font-medium text-gray-700 mb-1">
              Add member by username
            </label>
            <input
              id="member-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., sifat"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input
              type="checkbox"
              checked={canEdit}
              onChange={(e) => setCanEdit(e.target.checked)}
              className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            Can edit tasks
          </label>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {adding ? 'Adding...' : 'Add Member'}
          </button>
        </form>

        {error && (
          <div className="rounded-md bg-red-50 p-3 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        {/* Access legend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-2.5 text-indigo-800">
            <strong>Owner:</strong> everything — tasks, assignment, delete, members.
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2.5 text-emerald-800">
            <strong>Editor:</strong> sees tasks assigned to them and can create/edit tasks.
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-gray-700">
            <strong>Viewer:</strong> sees only tasks assigned to them, can mark them done, no edits.
          </div>
        </div>

        {/* Member list */}
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <Crown className="w-4 h-4 text-indigo-600" />
              <span>{ownerName ? `@${ownerName}` : `User #${project.owner_id}`}</span>
            </div>
            <span className="text-xs font-semibold text-indigo-700">Owner · full access</span>
          </div>

          {loading ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No members yet. Add a registered username above to give them access.
            </div>
          ) : (
            members.map((m) => {
              const assigned = tasks.filter((t) => t.assigned_to_id === m.user_id).length;
              const busy = busyUserId === m.user_id;
              return (
                <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      @{m.username ?? `user${m.user_id}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {assigned} assigned task{assigned === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        m.can_edit
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}
                    >
                      {m.can_edit ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {m.can_edit ? 'Editor' : 'Viewer'}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggleEdit(m)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-50 transition-colors"
                    >
                      {m.can_edit ? 'Make viewer' : 'Make editor'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRemove(m)}
                      className="p-1.5 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
