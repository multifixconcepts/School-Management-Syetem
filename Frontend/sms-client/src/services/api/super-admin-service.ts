import { useSuperAdminApiClient } from './super-admin-api-client';
import { useMemo } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';

// Define types for dashboard data
export interface TenantStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
  growthRate: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  avgPerTenant: number;
  recentLogins: number;
}

export interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
}

export interface TenantGrowthData {
  month: string;
  tenants: number;
}

export interface SystemAlert {
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface RecentTenant {
  id: string;
  name: string;
  domain?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
  alerts: SystemAlert[];
  tenantGrowth: TenantGrowthData[];
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  tenantId?: string;
  lastLogin?: string;
}

export interface UserRole {
  id: string;
  name: string;
  displayName?: string;
}

export interface UserWithRoles {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  roles: UserRole[];
  is_active: boolean;
  tenant_id?: string;
  last_login?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
  ipAddress: string;
}

export interface UserCreateCrossTenant {
  first_name: string;
  last_name: string;
  email: string;
  password?: string;
  role?: string;
  role_id?: string;
  tenant_id: string;
  is_active?: boolean;
}

export interface UserCreateResponse {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
  tenant_id: string;
  generated_password?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isActive: boolean;
}

export interface RoleStats {
  name: string;
  count: number;
  percentage: number;
}

export interface UserUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  password?: string;
  is_active?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface TenantData {
  id: string;
  name: string;
  code: string;
  domain?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSuperAdminService() {
  const { tenantId } = useTenant();
  const apiClient = useSuperAdminApiClient(tenantId || undefined);

  return useMemo(() => ({
    // Get tenant statistics
    getTenantStats: async (): Promise<TenantStats> => {
      return apiClient.get<TenantStats>('/super-admin/dashboard/tenant-stats');
    },

    // Get all tenants
    getTenants: async (params?: { skip?: number; limit?: number }): Promise<PaginatedResponse<RecentTenant>> => {
      const queryParams = new URLSearchParams();
      if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
      if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());

      const url = `/super-admin/tenants${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      return apiClient.get<PaginatedResponse<RecentTenant>>(url);
    },

    // Get user statistics
    getUserStats: async (): Promise<UserStats> => {
      return apiClient.get<UserStats>('/super-admin/dashboard/user-stats');
    },

    // Get system metrics
    getSystemMetrics: async (): Promise<SystemMetrics> => {
      return apiClient.get<SystemMetrics>('/super-admin/dashboard/system-metrics');
    },

    // Get security alerts from system metrics
    getSecurityAlerts: async (): Promise<SystemAlert[]> => {
      const systemMetrics = await apiClient.get<SystemMetrics>('/super-admin/dashboard/system-metrics');
      return systemMetrics.alerts;
    },

    // Get recent tenants
    getRecentTenants: async (limit: number = 5): Promise<RecentTenant[]> => {
      return apiClient.get<RecentTenant[]>(`/super-admin/dashboard/recent-tenants?limit=${limit}`);
    },

    // Get system reports
    getSystemReports: async (reportType: string, startDate?: Date, endDate?: Date) => {
      const params = new URLSearchParams();
      params.append('report_type', reportType);

      if (startDate) {
        params.append('start_date', startDate.toISOString());
      }

      if (endDate) {
        params.append('end_date', endDate.toISOString());
      }

      return apiClient.get(`/super-admin/reports?${params.toString()}`);
    },

    // Get audit logs with pagination
    getAuditLogs: async (params?: {
      skip?: number;
      limit?: number;
      user_id?: string;
      entity_type?: string;
      entity_id?: string;
      action?: string;
      tenant_id?: string;
      start_date?: string;
      end_date?: string;
    }): Promise<AuditLog[]> => {
      const queryParams = new URLSearchParams();
      if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
      if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
      if (params?.user_id) queryParams.append('user_id', params.user_id);
      if (params?.entity_type) queryParams.append('entity_type', params.entity_type);
      if (params?.entity_id) queryParams.append('entity_id', params.entity_id);
      if (params?.action) queryParams.append('action', params.action);
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);

      const url = `/v1/logging/super-admin/audit-logs${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      return apiClient.get<AuditLog[]>(url);
    },

    // Get combined audit logs (super-admin + tenant logs)
    getCombinedAuditLogs: async (params?: {
      skip?: number;
      limit?: number;
      user_id?: string;
      entity_type?: string;
      entity_id?: string;
      action?: string;
      tenant_id?: string;
      start_date?: string;
      end_date?: string;
      log_type?: 'super_admin' | 'tenant' | 'all';
    }): Promise<AuditLog[]> => {
      const queryParams = new URLSearchParams();
      if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
      if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
      if (params?.user_id) queryParams.append('user_id', params.user_id);
      if (params?.entity_type) queryParams.append('entity_type', params.entity_type);
      if (params?.entity_id) queryParams.append('entity_id', params.entity_id);
      if (params?.action) queryParams.append('action', params.action);
      if (params?.start_date) queryParams.append('start_date', params.start_date);
      if (params?.end_date) queryParams.append('end_date', params.end_date);
      if (params?.log_type) queryParams.append('log_type', params.log_type);

      const url = `/v1/logging/super-admin/audit-logs/all${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      return apiClient.get<AuditLog[]>(url);
    },

    // Get all available roles
    getRoles: async (): Promise<Role[]> => {
      return apiClient.get<Role[]>('/super-admin/roles');
    },

    // Enhanced user list with role filtering
    getUserList: async (params?: {
      skip?: number;
      limit?: number;
      email?: string;
      is_active?: boolean;
      tenant_id?: string;
      sort_by?: string;
      sort_order?: 'asc' | 'desc';
    }): Promise<UserWithRoles[]> => {
      const queryParams = new URLSearchParams();
      if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
      if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
      if (params?.email) queryParams.append('email', params.email);
      if (params?.is_active !== undefined) queryParams.append('is_active', params.is_active.toString());
      if (params?.sort_by) queryParams.append('sort_by', params.sort_by);
      if (params?.sort_order) queryParams.append('sort_order', params.sort_order);

      const url = `/super-admin/users${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      return apiClient.get<UserWithRoles[]>(url);
    },

    // Calculate role statistics from user data
    getRoleStatistics: async (): Promise<RoleStats[]> => {
      const users = await apiClient.get<UserWithRoles[]>('/super-admin/users?limit=1000');
      const roleStats: { [key: string]: number } = {};

      users.forEach(user => {
        user.roles.forEach(role => {
          roleStats[role.name] = (roleStats[role.name] || 0) + 1;
        });
      });

      const totalUsers = users.length;
      return Object.entries(roleStats).map(([name, count]) => ({
        name,
        count,
        percentage: totalUsers > 0 ? (count / totalUsers) * 100 : 0
      }));
    },

    // Create user in any tenant (cross-tenant)
    createUserCrossTenant: async (userData: UserCreateCrossTenant): Promise<UserCreateResponse> => {
      try {
        const requestData = {
          ...userData,
          password: userData.password === '' ? null : userData.password
        };

        const response = await apiClient.post<UserCreateResponse>(
          `/super-admin/users`,
          requestData
        );
        console.log('Backend response for user creation:', response);
        return response;
      } catch (error) {
        console.error('Error creating cross-tenant user:', error);
        throw error;
      }
    },

    // Update user
    updateUser: async (userId: string, userData: UserUpdate, tenant_id?: string): Promise<UserWithRoles> => {
      const url = `/super-admin/users/${userId}`;
      return apiClient.put<UserWithRoles>(url, userData);
    },

    // Activate tenant
    activateTenant: async (tenantId: string): Promise<void> => {
      return apiClient.post<void>(`/super-admin/tenants/${tenantId}/activate`, {});
    },

    // Deactivate tenant
    deactivateTenant: async (tenantId: string): Promise<void> => {
      return apiClient.post<void>(`/super-admin/tenants/${tenantId}/deactivate`, {});
    },
  }), [apiClient]);
}
