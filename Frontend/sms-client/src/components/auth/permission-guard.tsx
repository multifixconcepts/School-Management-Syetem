'use client';

import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useTenantNavigation } from '@/hooks/use-tenant';

interface PermissionGuardProps {
  children: ReactNode;
  requiredRole?: string;
  requiredPermissions?: string[];
  fallback?: ReactNode;
}

export default function PermissionGuard({
  children,
  requiredRole = '',
  requiredPermissions = [],
  fallback = null
}: PermissionGuardProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { createTenantPath } = useTenantNavigation();

  // Modify the useEffect to handle super-admin users differently
  useEffect(() => {
    if (!user) {
      // Determine correct login path based on current context
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/super-admin')) {
        router.push('/super-admin/login');
      } else {
        // Use the tenant navigation hook for consistent routing
        router.push(createTenantPath('/login'));
      }
    }
  }, [user, router, createTenantPath]);

  // If no user is logged in, return null until the redirect happens
  if (!user) {
    return null;
  }

  // DEVELOPMENT MODE: Allow access to all pages during development
  // Remove or comment this line in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isDevelopment) {
    return <>{children}</>;
  }

  // Check if user has the required role - handle different possible structures
  const normalizeRoleName = (name?: string) => {
    const lower = (name || '').toLowerCase();
    if (!lower) return '';
    if (lower === 'super-admin' || lower === 'superadmin') return 'superadmin';
    // Treat tenant/financial/academic admins as 'admin' for gated admin pages
    if (['admin', 'tenant-admin', 'financial-admin', 'academic-admin'].includes(lower)) return 'admin';
    return lower;
  };

  const normalizedRoles = new Set<string>();
  if (typeof user.role === 'string') {
    normalizedRoles.add(normalizeRoleName(user.role));
  }
  if (Array.isArray(user.roles)) {
    user.roles.forEach((role: string | { name?: string }) => {
      const name = typeof role === 'string' ? role : role?.name;
      if (name) normalizedRoles.add(normalizeRoleName(name));
    });
  }

  const isSuperAdmin = normalizedRoles.has('superadmin');

  const hasRequiredRole =
    isSuperAdmin || !requiredRole || normalizedRoles.has(normalizeRoleName(requiredRole));

  // Check if user has all required permissions
  const hasRequiredPermissions =
    isSuperAdmin ||
    requiredPermissions.length === 0 ||
    (Array.isArray(user.permissions) &&
      requiredPermissions.every((permission) => user.permissions!.includes(permission)));

  // If user doesn't have required role or permissions, show fallback or null
  if (!hasRequiredRole || !hasRequiredPermissions) {
    return fallback;
  }

  // User has required role and permissions, render children
  return <>{children}</>;
}
