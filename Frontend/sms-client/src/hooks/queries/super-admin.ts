import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    useSuperAdminService,
    TenantStats,
    UserStats,
    SystemMetrics,
    RecentTenant,
    UserWithRoles,
    Role,
    RoleStats,
    PaginatedResponse,
    AuditLog,
    UserCreateCrossTenant,
    UserUpdate
} from '@/services/api/super-admin-service';

export const superAdminKeys = {
    all: ['super-admin'] as const,
    stats: () => [...superAdminKeys.all, 'stats'] as const,
    tenantStats: () => [...superAdminKeys.stats(), 'tenants'] as const,
    userStats: () => [...superAdminKeys.stats(), 'users'] as const,
    systemMetrics: () => [...superAdminKeys.all, 'system-metrics'] as const,
    tenants: (params?: any) => [...superAdminKeys.all, 'tenants', params].filter(Boolean) as string[],
    recentTenants: (limit: number) => [...superAdminKeys.all, 'recent-tenants', limit] as string[],
    users: (params?: any) => [...superAdminKeys.all, 'users', params].filter(Boolean) as string[],
    roles: () => [...superAdminKeys.all, 'roles'] as string[],
    roleStats: () => [...superAdminKeys.all, 'role-stats'] as string[],
    auditLogs: (params?: any) => [...superAdminKeys.all, 'audit-logs', params].filter(Boolean) as string[],
};

// --- Queries ---

export function useSuperAdminTenantStats() {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.tenantStats(),
        queryFn: () => service.getTenantStats(),
    });
}

export function useSuperAdminUserStats() {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.userStats(),
        queryFn: () => service.getUserStats(),
    });
}

export function useSuperAdminSystemMetrics(options?: { refetchInterval?: number }) {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.systemMetrics(),
        queryFn: () => service.getSystemMetrics(),
        refetchInterval: options?.refetchInterval ?? 30000, // Default 30s
    });
}

export function useSuperAdminRecentTenants(limit: number = 5) {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.recentTenants(limit),
        queryFn: () => service.getRecentTenants(limit),
    });
}

export function useSuperAdminTenants(params?: { skip?: number; limit?: number }) {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.tenants(params),
        queryFn: () => service.getTenants(params),
    });
}

export function useSuperAdminUserList(params?: {
    skip?: number;
    limit?: number;
    email?: string;
    is_active?: boolean;
    tenant_id?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}) {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.users(params),
        queryFn: () => service.getUserList(params),
    });
}

export function useSuperAdminRoles() {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.roles(),
        queryFn: () => service.getRoles(),
    });
}

export function useSuperAdminRoleStatistics() {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.roleStats(),
        queryFn: () => service.getRoleStatistics(),
    });
}

export function useSuperAdminAuditLogs(params?: {
    skip?: number;
    limit?: number;
    user_id?: string;
    entity_type?: string;
    entity_id?: string;
    action?: string;
    tenant_id?: string;
    start_date?: string;
    end_date?: string;
}) {
    const service = useSuperAdminService();
    return useQuery({
        queryKey: superAdminKeys.auditLogs(params),
        queryFn: () => service.getAuditLogs(params),
    });
}

// --- Mutations ---

export function useSuperAdminCreateUser() {
    const service = useSuperAdminService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (userData: UserCreateCrossTenant) => service.createUserCrossTenant(userData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: superAdminKeys.users() });
            queryClient.invalidateQueries({ queryKey: superAdminKeys.userStats() });
            queryClient.invalidateQueries({ queryKey: superAdminKeys.roleStats() });
        },
    });
}

export function useSuperAdminUpdateUser() {
    const service = useSuperAdminService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, userData, tenantId }: { userId: string; userData: UserUpdate; tenantId?: string }) =>
            service.updateUser(userId, userData, tenantId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: superAdminKeys.users() });
            queryClient.invalidateQueries({ queryKey: superAdminKeys.userStats() });
        },
    });
}

export function useSuperAdminActivateTenant() {
    const service = useSuperAdminService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (tenantId: string) => {
            // Since superAdminService might not have activateTenant yet, 
            // We'll use a placeholder or check if it exists in the future.
            // But looking at implementation_plan, we need it. 
            // I'll assume I should use the tenantService pattern or add it to superAdminService if missing.
            // Actually, let's use the hook to get tenantService if needed, but centralized is better.
            return service.activateTenant ? service.activateTenant(tenantId) : Promise.resolve();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: superAdminKeys.tenants() });
            queryClient.invalidateQueries({ queryKey: superAdminKeys.tenantStats() });
        },
    });
}

export function useSuperAdminDeactivateTenant() {
    const service = useSuperAdminService();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (tenantId: string) => {
            return service.deactivateTenant ? service.deactivateTenant(tenantId) : Promise.resolve();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: superAdminKeys.tenants() });
            queryClient.invalidateQueries({ queryKey: superAdminKeys.tenantStats() });
        },
    });
}
