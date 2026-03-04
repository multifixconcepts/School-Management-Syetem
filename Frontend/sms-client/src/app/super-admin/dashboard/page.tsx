'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useSuperAdminService } from '@/services/api/super-admin-service';
import {
  useSuperAdminTenantStats,
  useSuperAdminUserStats,
  useSuperAdminSystemMetrics,
  useSuperAdminRecentTenants,
  useSuperAdminUserList,
  useSuperAdminRoles,
  useSuperAdminRoleStatistics
} from '@/hooks/queries/super-admin';

// Dynamic role type - no longer static
type UserRole = string;

interface FilterState {
  search: string;
  tenantStatus: 'all' | 'active' | 'inactive';
  userRole: 'all' | UserRole;
  dateRange: 'all' | '7d' | '30d' | '90d';
}

export default function SuperAdminDashboard() {
  const { user: currentUser } = useAuth();

  // TanStack Query Hooks
  const { data: tenantStats, isLoading: tenantLoading } = useSuperAdminTenantStats();
  const { data: userStats, isLoading: userLoading } = useSuperAdminUserStats();
  const { data: systemMetrics, isLoading: systemLoading } = useSuperAdminSystemMetrics({ refetchInterval: 30000 });
  const { data: recentTenants, isLoading: recentLoading } = useSuperAdminRecentTenants();
  const { data: roles, isLoading: rolesLoading } = useSuperAdminRoles();
  const { data: roleStats, isLoading: roleStatsLoading } = useSuperAdminRoleStatistics();

  // Fetch users with a high limit for the overview table/analytics
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useSuperAdminUserList({ limit: 1000 });

  // Page state for filters and pagination
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    tenantStatus: 'all',
    userRole: 'all',
    dateRange: 'all'
  });

  const isLoading = tenantLoading || userLoading || systemLoading || recentLoading || rolesLoading || usersLoading || roleStatsLoading;

  // Filter functions with null safety
  const filteredUsers = Array.isArray(users) ? users.filter(user => {
    const matchesSearch = filters.search === '' ||
      (user.first_name?.toLowerCase() || '').includes(filters.search.toLowerCase()) ||
      (user.last_name?.toLowerCase() || '').includes(filters.search.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(filters.search.toLowerCase());

    const matchesRole = filters.userRole === 'all' ||
      user.roles.some(role => role.name === filters.userRole);

    return matchesSearch && matchesRole;
  }) : [];

  // Pagination calculations
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const currentUsers = filteredUsers.slice(startIndex, endIndex);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters.search, filters.userRole]);

  // Pagination handlers
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Get role badge color
  const getRoleBadgeColor = (roleName: string) => {
    const roleColors: { [key: string]: string } = {
      'super-admin': 'bg-red-100 text-red-800',
      'admin': 'bg-blue-100 text-blue-800',
      'financial-admin': 'bg-green-100 text-green-800',
      'academic-admin': 'bg-purple-100 text-purple-800',
      'tenant-admin': 'bg-orange-100 text-orange-800',
      'registrar': 'bg-indigo-100 text-indigo-800',
      'teacher': 'bg-yellow-100 text-yellow-800',
      'student': 'bg-gray-100 text-gray-800',
      'parent': 'bg-pink-100 text-pink-800',
      'counselor': 'bg-teal-100 text-teal-800',
      'accountant': 'bg-cyan-100 text-cyan-800'
    };
    return roleColors[roleName] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Welcome, {currentUser?.firstName || 'User'}!</h1>
        <Button onClick={() => refetchUsers()}>Refresh Data</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">Search Users</Label>
              <Input
                id="search"
                placeholder="Search by name or email..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="userRole">User Role</Label>
              <Select value={filters.userRole} onValueChange={(value) => setFilters(prev => ({ ...prev, userRole: value as UserRole }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {Array.isArray(roles) && roles.map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      {role.name.charAt(0).toUpperCase() + role.name.slice(1).replace('-', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dateRange">Date Range</Label>
              <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value as FilterState['dateRange'] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenantStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {tenantStats?.active || 0} active, {tenantStats?.inactive || 0} inactive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {userStats?.active || 0} active, {userStats?.inactive || 0} inactive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics?.cpuUsage || 0}%</div>
            <p className="text-xs text-muted-foreground">
              CPU Usage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Growth Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{tenantStats?.growthRate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {tenantStats?.newThisMonth || 0} new tenants this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Role Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>User Role Distribution</CardTitle>
          <CardDescription>Distribution of users across different roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.isArray(roleStats) && roleStats.map((stat) => (
              <div key={stat.name} className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold">{stat.count}</div>
                <div className="text-sm text-muted-foreground">{stat.name.replace('-', ' ')}</div>
                <div className="text-xs text-muted-foreground">{stat.percentage.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users Table with Pagination */}
        <Card>
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <CardDescription>Detailed user information with role assignments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Table */}
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.first_name} {user.last_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role) => (
                              <Badge key={role.id} className={getRoleBadgeColor(role.name)}>
                                {role.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? 'default' : 'secondary'}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredUsers.length)} of {filteredUsers.length} users
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPreviousPage}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>

                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
                          // Show first page, last page, current page, and pages around current
                          return page === 1 ||
                            page === totalPages ||
                            Math.abs(page - currentPage) <= 1;
                        })
                        .map((page, index, array) => {
                          // Add ellipsis if there's a gap
                          const prevPage = array[index - 1];
                          const showEllipsis = prevPage && page - prevPage > 1;

                          return (
                            <React.Fragment key={page}>
                              {showEllipsis && (
                                <span className="px-2 text-muted-foreground">...</span>
                              )}
                              <Button
                                variant={currentPage === page ? "default" : "outline"}
                                size="sm"
                                onClick={() => goToPage(page)}
                                className="w-8 h-8 p-0"
                              >
                                {page}
                              </Button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Tenants */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Tenants</CardTitle>
            <CardDescription>Latest tenant registrations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.isArray(recentTenants) && recentTenants.slice(0, 5).map((tenant) => (
                <div key={tenant.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">{tenant.name}</div>
                    <div className="text-sm text-muted-foreground">{tenant.domain}</div>
                  </div>
                  <Badge variant={tenant.isActive ? 'default' : 'secondary'}>
                    {tenant.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}