import axios, { AxiosError } from 'axios';
import {
  AuthToken,
  User,
  Project,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProjectMember,
  ProjectMemberCreateInput,
  Task,
  TaskCreateInput,
  ProjectTaskCreateInput,
  TaskUpdateInput,
  ProjectAccess,
  SystemSettings,
  SystemSettingsUpdateInput,
  UserLimits,
  UserLimitsUpdateInput,
  UserDetail,
  PaginatedUsersResponse,
  GetUsersParams,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Event bus for centralized interceptor triggers
type BannedListener = (detail: string) => void;
type UnauthorizedListener = () => void;

let bannedListeners: BannedListener[] = [];
let unauthorizedListeners: UnauthorizedListener[] = [];

export const onAccountBanned = (listener: BannedListener) => {
  bannedListeners.push(listener);
  return () => {
    bannedListeners = bannedListeners.filter((l) => l !== listener);
  };
};

export const onUnauthorized = (listener: UnauthorizedListener) => {
  unauthorizedListeners.push(listener);
  return () => {
    unauthorizedListeners = unauthorizedListeners.filter((l) => l !== listener);
  };
};

// Request Interceptor: Attach Bearer JWT Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Centralized Error & Ban Detection
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string }>) => {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    // 1. Account Banned Detection (HTTP 403 Forbidden with "banned" message)
    if (status === 403 && typeof detail === 'string' && detail.toLowerCase().includes('banned')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      bannedListeners.forEach((listener) => listener(detail));
      return Promise.reject(error);
    }

    // 2. Unauthenticated Interceptor (HTTP 401 Unauthorized)
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      unauthorizedListeners.forEach((listener) => listener());
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

// Helper to extract clean error message from API response
export const extractErrorMessage = (error: unknown, fallback = 'An unexpected error occurred'): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      // Pydantic validation error array
      return detail.map((err) => `${err.loc?.join('.') || 'field'}: ${err.msg}`).join(', ');
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

// --- Authentication Service ---
export const authService = {
  async register(data: { username: string; email: string; password: string }): Promise<User> {
    const res = await apiClient.post<User>('/auth/register', data, {
      headers: { 'Content-Type': 'application/json' },
    });
    return res.data;
  },

  // CHANGED: backend expects a JSON body {username, password}, not form-urlencoded
  async login(usernameOrEmail: string, password: string): Promise<AuthToken> {
    const res = await apiClient.post<AuthToken>(
      '/auth/login',
      { username: usernameOrEmail, password },
      { headers: { 'Content-Type': 'application/json' } },
    );
    return res.data;
  },

  async getMe(): Promise<User> {
    const res = await apiClient.get<User>('/auth/me');
    return res.data;
  },
};

// --- Projects Service ---
export const projectService = {
  async getAll(): Promise<Project[]> {
    const res = await apiClient.get<Project[]>('/projects');
    return res.data;
  },

  async getById(projectId: number): Promise<Project> {
    const res = await apiClient.get<Project>(`/projects/${projectId}`);
    return res.data;
  },

  async create(data: ProjectCreateInput): Promise<Project> {
    const res = await apiClient.post<Project>('/projects', data);
    return res.data;
  },

  async update(projectId: number, data: ProjectUpdateInput): Promise<Project> {
    const res = await apiClient.put<Project>(`/projects/${projectId}`, data);
    return res.data;
  },

  async delete(projectId: number): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/projects/${projectId}`);
    return res.data;
  },

  async getTasks(projectId: number): Promise<Task[]> {
    const res = await apiClient.get<Task[]>(`/projects/${projectId}/tasks`);
    return res.data;
  },

  async getMyAccess(projectId: number): Promise<ProjectAccess> {
    const res = await apiClient.get<ProjectAccess>(`/projects/${projectId}/my-access`);
    return res.data;
  },

  async createTask(projectId: number, data: ProjectTaskCreateInput): Promise<Task> {
    const res = await apiClient.post<Task>(`/projects/${projectId}/tasks`, data);
    return res.data;
  },

  // --- Members (owner/admin only) ---
  async getMembers(projectId: number): Promise<ProjectMember[]> {
    const res = await apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
    return res.data;
  },

  async addMember(projectId: number, data: ProjectMemberCreateInput): Promise<ProjectMember> {
    const res = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, data);
    return res.data;
  },

  async updateMemberPermission(projectId: number, userId: number, canEdit: boolean): Promise<ProjectMember> {
    const res = await apiClient.patch<ProjectMember>(`/projects/${projectId}/members/${userId}`, {
      can_edit: canEdit,
    });
    return res.data;
  },

  async removeMember(projectId: number, userId: number): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/members/${userId}`);
  },
};

// --- Tasks Service ---
export const taskService = {
  async getAll(): Promise<Task[]> {
    const res = await apiClient.get<Task[]>('/tasks');
    return res.data;
  },

  async getById(taskId: number): Promise<Task> {
    const res = await apiClient.get<Task>(`/tasks/${taskId}`);
    return res.data;
  },

  async create(data: TaskCreateInput): Promise<Task> {
    const res = await apiClient.post<Task>('/tasks', data);
    return res.data;
  },

  async toggleStatus(taskId: number, completed: boolean): Promise<Task> {
    const res = await apiClient.patch<Task>(`/tasks/${taskId}/status`, { completed });
    return res.data;
  },

  async update(taskId: number, data: TaskUpdateInput): Promise<Task> {
    const res = await apiClient.put<Task>(`/tasks/${taskId}`, data);
    return res.data;
  },

  async delete(taskId: number): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/tasks/${taskId}`);
    return res.data;
  },

};

// --- Admin Service ---
export const adminService = {
  async getUsers(params?: GetUsersParams): Promise<PaginatedUsersResponse> {
    const res = await apiClient.get<PaginatedUsersResponse>('/admin/users', { params });
    return res.data;
  },

  async getUserDetail(userId: number): Promise<UserDetail> {
    const res = await apiClient.get<UserDetail>(`/admin/users/${userId}`);
    return res.data;
  },

  async updateUserStatus(userId: number, isActive: boolean): Promise<User> {
    const res = await apiClient.patch<User>(`/admin/users/${userId}/status`, { is_active: isActive });
    return res.data;
  },

  async deleteUser(userId: number): Promise<User> {
    const res = await apiClient.delete<User>(`/admin/users/${userId}`);
    return res.data;
  },

  async getSettings(): Promise<SystemSettings> {
    const res = await apiClient.get<SystemSettings>('/admin/settings');
    return res.data;
  },

  async updateSettings(data: SystemSettingsUpdateInput): Promise<SystemSettings> {
    const res = await apiClient.put<SystemSettings>('/admin/settings', data);
    return res.data;
  },

  async setUserLimits(userId: number, data: UserLimitsUpdateInput): Promise<UserLimits> {
    const res = await apiClient.put<UserLimits>(`/admin/users/${userId}/limits`, data);
    return res.data;
  },

  async resetUserLimits(userId: number): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/admin/users/${userId}/limits`);
    return res.data;
  },
};