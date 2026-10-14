export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
  is_deleted: boolean;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface Project {
  id: number;
  title: string;
  description: string | null;
  owner_id: number;
  created_at: string | null;
}

export interface ProjectAccess {
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  is_owner: boolean;
  can_edit: boolean;
  can_manage_members: boolean;
}

export interface ProjectCreateInput {
  title: string;
  description?: string | null;
}

export interface ProjectUpdateInput {
  title?: string | null;
  description?: string | null;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  project_id: number | null;
  created_by_id: number | null;
  assigned_to_id: number | null;
  assigned_to_username?: string | null;
  created_at: string | null;
}

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  project_id?: number | null;
  assigned_to_username?: string | null;
  assigned_to_id?: number | null;
}

export interface ProjectTaskCreateInput {
  title: string;
  description?: string | null;
  assigned_to_username?: string | null;
  assigned_to_id?: number | null;
}

export interface TaskUpdateInput {
  title?: string | null;
  description?: string | null;
  completed?: boolean | null;
  assigned_to_username?: string | null;
  assigned_to_id?: number | null;
}

export interface TaskPermission {
  id: number;
  task_id: number;
  user_id: number;
  username?: string | null;
  can_edit: boolean;
}

export interface ProjectMember {
  id: number;
  project_id: number;
  user_id: number;
  username: string | null;
  can_edit: boolean;
}

export interface ProjectMemberCreateInput {
  username: string;
  can_edit: boolean;
}

export interface SystemSettings {
  id: number;
  default_max_projects_per_user: number;
  default_max_tasks_per_user: number;
  default_max_tasks_per_project: number;
}

export interface SystemSettingsUpdateInput {
  default_max_projects_per_user?: number;
  default_max_tasks_per_user?: number;
  default_max_tasks_per_project?: number;
}

export interface UserLimits {
  user_id: number;
  max_projects: number | null;
  max_tasks: number | null;
  max_tasks_per_project: number | null;
}

export interface UserLimitsUpdateInput {
  max_projects?: number | null;
  max_tasks?: number | null;
  max_tasks_per_project?: number | null;
}

export interface UserDetail {
  user: User;
  projects_count: number;
  tasks_count: number;
  effective_max_projects: number;
  effective_max_tasks: number;
  effective_max_tasks_per_project: number;
}

export interface PaginatedUsersResponse {
  total_users: number;
  total_pages: number;
  page: number;
  limit: number;
  offset: number;
  users: User[];
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  skip?: number;
  include_deleted?: boolean;
}

