'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSuperAdminService, UserWithRoles } from '@/services/api/super-admin-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import UserEditModal from '@/components/common/UserEditModal';
import { PasswordResetDialog } from '@/components/common/PasswordResetDialog';
import { Edit, UserCheck, UserX, Plus, RefreshCw, KeyRound, UserPlus } from 'lucide-react';
import { UserUpdate, UserCreateCrossTenant } from '@/services/api/super-admin-service';
import UserCreateModal from '@/components/common/UserCreateModal';
import { toast } from 'sonner';

import {
  useSuperAdminUserList,
  useSuperAdminCreateUser,
  useSuperAdminUpdateUser
} from '@/hooks/queries/super-admin';

export default function UserManagementPage() {
  const [modalAction, setModalAction] = useState<'activate' | 'deactivate' | 'edit' | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [resettingUser, setResettingUser] = useState<UserWithRoles | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // TanStack Query Hooks
  const { data: users = [], isLoading, refetch } = useSuperAdminUserList();
  const createUser = useSuperAdminCreateUser();
  const updateUser = useSuperAdminUpdateUser();

  const isModalLoading = createUser.isPending || updateUser.isPending;

  // Modal state helpers
  const isConfirmationModalOpen = (modalAction === 'activate' || modalAction === 'deactivate') && selectedUserId !== null;
  const isEditModalOpen = modalAction === 'edit' && selectedUserId !== null;
  const selectedUser = users.find(user => user.id === selectedUserId);

  const closeModal = () => {
    setModalAction(null);
    setSelectedUserId(null);
  };

  // Handle user creation
  const handleCreateSave = async (userData: UserCreateCrossTenant) => {
    createUser.mutate(userData, {
      onSuccess: (response) => {
        toast.success(`User ${userData.email} created successfully${response.generated_password ? `. Generated password: ${response.generated_password}` : ''}`);
        setIsCreateModalOpen(false);
      },
      onError: (error: any) => {
        console.error('Failed to create user:', error);
        const detail = error.response?.data?.detail || 'Failed to create user. Please try again.';
        toast.error(detail);
      }
    });
  };

  // Handle modal confirmation for activate/deactivate
  const handleModalConfirm = async () => {
    if (!selectedUser || !modalAction) return;

    const isActivating = modalAction === 'activate';
    updateUser.mutate({
      userId: selectedUser.id,
      userData: { is_active: isActivating },
      tenantId: selectedUser.tenant_id
    }, {
      onSuccess: () => {
        toast.success(`User ${isActivating ? 'activated' : 'deactivated'} successfully`);
        closeModal();
      },
      onError: (error) => {
        console.error('Failed to update user status:', error);
        toast.error(`Failed to ${modalAction} user. Please try again.`);
      }
    });
  };

  // Handle user edit save
  const handleEditSave = async (userData: { first_name: string; last_name: string; email: string }) => {
    if (!selectedUser) return;

    updateUser.mutate({
      userId: selectedUser.id,
      userData,
      tenantId: selectedUser.tenant_id
    }, {
      onSuccess: () => {
        toast.success('User updated successfully');
        closeModal();
      },
      onError: (error) => {
        console.error('Failed to update user:', error);
        toast.error('Failed to update user. Please try again.');
      }
    });
  };

  // Show modal for actions
  const showActivateModal = (userId: string) => {
    setSelectedUserId(userId);
    setModalAction('activate');
  };

  const showDeactivateModal = (userId: string) => {
    setSelectedUserId(userId);
    setModalAction('deactivate');
  };

  const showEditModal = (userId: string) => {
    setSelectedUserId(userId);
    setModalAction('edit');
  };

  const showCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleResetPassword = (user: UserWithRoles) => {
    setResettingUser(user);
  };

  const handlePasswordResetSubmit = async (userId: string, newPassword: string, newEmail?: string) => {
    try {
      const updatePayload: UserUpdate = {};
      if (newPassword) updatePayload.password = newPassword;
      if (newEmail) updatePayload.email = newEmail;

      // We can use the mutation here as well for consistency
      updateUser.mutate({ userId, userData: updatePayload });
    } catch (error) {
      throw error;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={showCreateModal}>
            <Plus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </div>
      </div>

      {isLoading && users.length === 0 && (
        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading users...</p>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>User Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-600 font-medium">Total Users</p>
              <p className="text-2xl font-bold text-blue-800">{users.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-sm text-green-600 font-medium">Active Users</p>
              <p className="text-2xl font-bold text-green-800">{users.filter(u => u.is_active).length}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <p className="text-sm text-red-600 font-medium">Inactive Users</p>
              <p className="text-2xl font-bold text-red-800">{users.filter(u => !u.is_active).length}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <p className="text-sm text-purple-600 font-medium">Super Admins</p>
              <p className="text-2xl font-bold text-purple-800">{users.filter(u => u.roles.some(role => role.name === 'super-admin')).length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading users...</p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>User List ({users.length} users)</CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">No users found</p>
                <Button onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        {user.first_name} {user.last_name}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map(role => (
                            <span
                              key={role.id}
                              className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                            >
                              {role.displayName || role.name}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                          }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {user.tenant_id || 'Global'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => showEditModal(user.id)}
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="Edit user"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResetPassword(user)}
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Reset Password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>

                          {user.is_active ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => showDeactivateModal(user.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Deactivate user"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => showActivateModal(user.id)}
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Activate user"
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Modal for Activate/Deactivate */}
      {isConfirmationModalOpen && selectedUser && modalAction && (
        <ConfirmationModal
          isOpen={isConfirmationModalOpen}
          onConfirm={handleModalConfirm}
          onCancel={closeModal}
          title={modalAction === 'activate' ? 'Activate User' : 'Deactivate User'}
          message={`Are you sure you want to ${modalAction === 'activate' ? 'activate' : 'deactivate'} ${selectedUser.first_name} ${selectedUser.last_name}? ${modalAction === 'activate' ? 'This will allow the user to log in and access the system.' : 'This will prevent the user from logging in.'}`}
          confirmButtonText={modalAction === 'activate' ? 'Activate User' : 'Deactivate User'}
          confirmButtonColor={modalAction === 'activate' ? 'green' : 'red'}
          isLoading={isModalLoading}
        />
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && selectedUser && (
        <UserEditModal
          isOpen={isEditModalOpen}
          user={selectedUser}
          isLoading={isModalLoading}
          onSave={handleEditSave}
          onCancel={closeModal}
        />
      )}

      {/* Password Reset Dialog */}
      {resettingUser && (
        <PasswordResetDialog
          isOpen={!!resettingUser}
          onClose={() => setResettingUser(null)}
          userId={resettingUser.id}
          userName={`${resettingUser.first_name} ${resettingUser.last_name}`}
          userEmail={resettingUser.email}
          userType="User"
          onReset={handlePasswordResetSubmit}
        />
      )}

      {/* Create User Modal */}
      <UserCreateModal
        isOpen={isCreateModalOpen}
        isLoading={isModalLoading}
        onSave={handleCreateSave}
        onCancel={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}