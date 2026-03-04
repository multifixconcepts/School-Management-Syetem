'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantService } from '@/services/api/tenant-service';
import { Tenant } from '@/types/tenant';
import TenantList from '@/components/tenant/tenant-list';
import TenantForm from '@/components/tenant/tenant-form';
import TenantCreationWizard from '@/components/tenant/tenant-creation-wizard';
import Pagination from '@/components/common/Pagination';
import { toast } from 'sonner';

import {
  useSuperAdminTenants,
  useSuperAdminActivateTenant,
  useSuperAdminDeactivateTenant
} from '@/hooks/queries/super-admin';

export default function TenantsManagementPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // TanStack Query Hooks
  const { data, isLoading, refetch } = useSuperAdminTenants({
    skip: (currentPage - 1) * itemsPerPage,
    limit: itemsPerPage
  });

  const activateTenant = useSuperAdminActivateTenant();
  const deactivateTenant = useSuperAdminDeactivateTenant();

  const tenants = data?.items ?? [];
  const totalTenants = data?.total ?? 0;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handleCreateTenant = () => {
    setSelectedTenant(null);
    setShowForm(true);
  };

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedTenant(null);
  };

  const handleFormSubmit = async () => {
    // TanStack query will handle invalidation if we add it to the implementation, 
    // but for now we manually refetch or assume a mutation triggers it.
    // In our super-admin hooks, we should add activate/deactivate mutations.
    await refetch();
    setShowForm(false);
    setSelectedTenant(null);
  };

  const handleActivateTenant = async (id: string) => {
    activateTenant.mutate(id, {
      onSuccess: () => {
        toast.success('Tenant activated successfully');
      },
      onError: (error) => {
        console.error('Activation error:', error);
        toast.error('Failed to activate tenant');
      }
    });
  };

  const handleDeactivateTenant = async (id: string) => {
    deactivateTenant.mutate(id, {
      onSuccess: () => {
        toast.success('Tenant deactivated successfully');
      },
      onError: (error) => {
        console.error('Deactivation error:', error);
        toast.error('Failed to deactivate tenant');
      }
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Tenant Management</h1>
        <button
          onClick={handleCreateTenant}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create Tenant
        </button>
      </div>


      {isLoading ? (
        <div className="text-center py-4">Loading tenants...</div>
      ) : (
        <>
          <TenantList
            tenants={tenants}
            onEdit={handleEditTenant}
            onRefresh={() => refetch()}
            onActivate={handleActivateTenant}
            onDeactivate={handleDeactivateTenant}
          />

          <Pagination
            currentPage={currentPage}
            totalItems={totalTenants}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </>
      )}

      {showForm && !selectedTenant && (
        <TenantCreationWizard
          onClose={handleFormClose}
          onComplete={handleFormSubmit}
        />
      )}

      {showForm && selectedTenant && (
        <TenantForm
          tenant={selectedTenant}
          onClose={handleFormClose}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}