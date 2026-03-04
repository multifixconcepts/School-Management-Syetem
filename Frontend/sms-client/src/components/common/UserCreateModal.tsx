'use client';

import { Fragment, useRef, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { UserPlus, Shield, Globe, Lock, Key, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSuperAdminService, RecentTenant, Role, UserCreateCrossTenant } from '@/services/api/super-admin-service';
import { toast } from 'sonner';

interface UserCreateModalProps {
    isOpen: boolean;
    isLoading?: boolean;
    onSave: (userData: UserCreateCrossTenant) => void;
    onCancel: () => void;
}

export default function UserCreateModal({
    isOpen,
    isLoading = false,
    onSave,
    onCancel,
}: UserCreateModalProps) {
    const cancelButtonRef = useRef(null);
    const superAdminService = useSuperAdminService();

    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        tenant_id: '',
        role_id: '',
        generatePassword: true,
        customPassword: ''
    });

    const [tenants, setTenants] = useState<RecentTenant[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [fetchingData, setFetchingData] = useState(false);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        setFetchingData(true);
        try {
            const [tenantsRes, rolesRes] = await Promise.all([
                superAdminService.getTenants({ limit: 100 }),
                superAdminService.getRoles()
            ]);
            setTenants(tenantsRes.items);
            setRoles(rolesRes);
        } catch (error) {
            console.error('Failed to load tenants or roles:', error);
            toast.error('Failed to load metadata. Please try again.');
        } finally {
            setFetchingData(false);
        }
    };

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};

        if (!formData.first_name.trim()) newErrors.first_name = 'First name is required';
        if (!formData.last_name.trim()) newErrors.last_name = 'Last name is required';
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Valid email is required';
        }
        if (!formData.tenant_id) newErrors.tenant_id = 'Tenant selection is required';
        if (!formData.role_id) newErrors.role_id = 'Role selection is required';

        if (!formData.generatePassword && (!formData.customPassword || formData.customPassword.length < 8)) {
            newErrors.customPassword = 'Password must be at least 8 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleCreate = () => {
        if (validateForm()) {
            const payload: UserCreateCrossTenant = {
                first_name: formData.first_name,
                last_name: formData.last_name,
                email: formData.email,
                tenant_id: formData.tenant_id,
                role_id: formData.role_id,
                password: formData.generatePassword ? undefined : formData.customPassword,
                is_active: true
            };
            onSave(payload);
        }
    };

    const handleCancel = () => {
        setFormData({
            first_name: '',
            last_name: '',
            email: '',
            tenant_id: '',
            role_id: '',
            generatePassword: true,
            customPassword: ''
        });
        setErrors({});
        onCancel();
    };

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" initialFocus={cancelButtonRef} onClose={handleCancel}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                                <div className="bg-white px-4 pb-4 pt-5 sm:p-8 sm:pb-6">
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 sm:h-14 sm:w-14">
                                            <UserPlus className="h-7 w-7 text-blue-600" aria-hidden="true" />
                                        </div>
                                        <div className="text-left w-full">
                                            <Dialog.Title as="h3" className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
                                                Create New User
                                            </Dialog.Title>
                                            <p className="text-sm text-gray-500 mb-8 border-b pb-4">
                                                Enter the details below to create a new user account and assign them to a tenant and role.
                                            </p>

                                            <div className="space-y-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-semibold text-gray-700">First Name</label>
                                                        <Input
                                                            value={formData.first_name}
                                                            onChange={(e) => handleInputChange('first_name', e.target.value)}
                                                            placeholder="John"
                                                            className={`h-11 ${errors.first_name ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-200'}`}
                                                        />
                                                        {errors.first_name && <p className="text-xs font-medium text-red-500">{errors.first_name}</p>}
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-semibold text-gray-700">Last Name</label>
                                                        <Input
                                                            value={formData.last_name}
                                                            onChange={(e) => handleInputChange('last_name', e.target.value)}
                                                            placeholder="Doe"
                                                            className={`h-11 ${errors.last_name ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-200'}`}
                                                        />
                                                        {errors.last_name && <p className="text-xs font-medium text-red-500">{errors.last_name}</p>}
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-semibold text-gray-700">Email Address</label>
                                                    <div className="relative">
                                                        <Input
                                                            type="email"
                                                            value={formData.email}
                                                            onChange={(e) => handleInputChange('email', e.target.value)}
                                                            placeholder="john.doe@example.com"
                                                            className={`h-11 ${errors.email ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-200'}`}
                                                        />
                                                    </div>
                                                    {errors.email && <p className="text-xs font-medium text-red-500">{errors.email}</p>}
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                                            <Globe className="h-4 w-4 text-blue-500" /> Tenant Selection
                                                        </label>
                                                        <Select
                                                            value={formData.tenant_id}
                                                            onValueChange={(val) => handleInputChange('tenant_id', val)}
                                                            disabled={fetchingData}
                                                        >
                                                            <SelectTrigger className={`h-11 ${errors.tenant_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-200'}`}>
                                                                <SelectValue placeholder={fetchingData ? "Loading..." : "Assign to Tenant"} />
                                                            </SelectTrigger>
                                                            <SelectContent position="popper" className="z-[60]">
                                                                {tenants.map(t => (
                                                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {errors.tenant_id && <p className="text-xs font-medium text-red-500">{errors.tenant_id}</p>}
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                                            <Shield className="h-4 w-4 text-indigo-500" /> Assigned Role
                                                        </label>
                                                        <Select
                                                            value={formData.role_id}
                                                            onValueChange={(val) => handleInputChange('role_id', val)}
                                                            disabled={fetchingData}
                                                        >
                                                            <SelectTrigger className={`h-11 ${errors.role_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-200'}`}>
                                                                <SelectValue placeholder={fetchingData ? "Loading..." : "Select Permissions Role"} />
                                                            </SelectTrigger>
                                                            <SelectContent position="popper" className="z-[60]">
                                                                {roles.map(r => (
                                                                    <SelectItem key={r.id} value={r.id}>{r.displayName || r.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {errors.role_id && <p className="text-xs font-medium text-red-500">{errors.role_id}</p>}
                                                    </div>
                                                </div>

                                                <div className="pt-6 border-t border-gray-100">
                                                    <p className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                        <Lock className="h-4 w-4 text-gray-400" /> Security Settings
                                                    </p>
                                                    <div className="grid grid-cols-1 gap-3">
                                                        <label className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-all ${formData.generatePassword ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500/10' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                                            <div className="mt-1">
                                                                <input
                                                                    type="radio"
                                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                                    checked={formData.generatePassword}
                                                                    onChange={() => handleInputChange('generatePassword', true)}
                                                                />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-semibold text-gray-900">Auto-generate secure password</p>
                                                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">System will create a high-entropy password. User will need to reset it on first login.</p>
                                                            </div>
                                                        </label>
                                                        <label className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-all ${!formData.generatePassword ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500/10' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                                                            <div className="mt-1">
                                                                <input
                                                                    type="radio"
                                                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                                                    checked={!formData.generatePassword}
                                                                    onChange={() => handleInputChange('generatePassword', false)}
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="text-sm font-semibold text-gray-900">Set custom password</p>
                                                                {!formData.generatePassword && (
                                                                    <div className="mt-3">
                                                                        <Input
                                                                            type="password"
                                                                            value={formData.customPassword}
                                                                            onChange={(e) => handleInputChange('customPassword', e.target.value)}
                                                                            placeholder="At least 8 characters"
                                                                            className={`h-10 ${errors.customPassword ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-200'}`}
                                                                        />
                                                                        {errors.customPassword && <p className="text-xs font-medium text-red-500 mt-1">{errors.customPassword}</p>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-6 py-5 sm:flex sm:flex-row-reverse sm:px-8 gap-3 border-t border-gray-100">
                                    <Button
                                        onClick={handleCreate}
                                        disabled={isLoading || fetchingData}
                                        className="w-full sm:w-auto px-8 h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all shadow-lg shadow-blue-500/20"
                                    >
                                        {isLoading ? (
                                            <span className="flex items-center gap-2">
                                                <RefreshCw className="h-4 w-4 animate-spin" /> Creating...
                                            </span>
                                        ) : 'Create Account'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={handleCancel}
                                        ref={cancelButtonRef}
                                        disabled={isLoading}
                                        className="w-full sm:w-auto px-6 h-11 text-gray-600 hover:text-gray-900 hover:bg-gray-100 font-medium"
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
}
