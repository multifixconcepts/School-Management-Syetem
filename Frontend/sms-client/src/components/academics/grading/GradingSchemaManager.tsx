import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Edit, Save, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useGradingSchemas, useCreateGradingSchema, useUpdateGradingSchema, useDeleteGradingSchema } from '@/hooks/queries/grading';
import { Loader2 } from 'lucide-react';
import type { GradingSchemaCreate } from '@/services/api/grading-service';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import { useAcademicYear } from '@/contexts/academic-year-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function GradingSchemaManager() {
    const { data: schemas, isLoading } = useGradingSchemas();
    const createSchemaMutation = useCreateGradingSchema();
    const updateSchemaMutation = useUpdateGradingSchema();
    const deleteSchemaMutation = useDeleteGradingSchema();

    const { academicYears: ayList } = useAcademicYear();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSchema, setEditingSchema] = useState<any | null>(null);
    const [formData, setFormData] = useState<GradingSchemaCreate>({
        name: '',
        description: '',
        academic_year_id: '',
        categories: [{ name: '', weight: 0 }]
    });

    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [schemaToDelete, setSchemaToDelete] = useState<string | null>(null);

    const totalWeight = formData.categories.reduce((sum, cat) => sum + Number(cat.weight || 0), 0);

    const handleAddCategory = () => {
        setFormData(prev => ({
            ...prev,
            categories: [...prev.categories, { name: '', weight: 0 }]
        }));
    };

    const handleRemoveCategory = (index: number) => {
        if (formData.categories.length === 1) {
            toast.error('At least one grading category is required');
            return;
        }
        setFormData(prev => ({
            ...prev,
            categories: prev.categories.filter((_, i) => i !== index)
        }));
    };

    const handleCategoryChange = (index: number, field: string, value: any) => {
        setFormData(prev => {
            const newCategories = [...prev.categories];
            newCategories[index] = { ...newCategories[index], [field]: value };
            return { ...prev, categories: newCategories };
        });
    };

    const handleSave = async () => {
        if (!formData.name) {
            toast.error('Schema name is required');
            return;
        }

        if (totalWeight !== 100) {
            toast.error(`Total weight must be exactly 100%. Current: ${totalWeight}%`);
            return;
        }

        if (!formData.academic_year_id) {
            toast.error('Academic year selection is required');
            return;
        }

        try {
            if (editingSchema) {
                await updateSchemaMutation.mutateAsync({ id: editingSchema.id, data: formData });
                toast.success('Grading schema updated successfully');
            } else {
                await createSchemaMutation.mutateAsync(formData);
                toast.success('Grading schema created successfully');
            }
            setIsDialogOpen(false);
            resetForm();
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Failed to save schema');
        }
    };

    const resetForm = () => {
        setEditingSchema(null);
        setFormData({
            name: '',
            description: '',
            academic_year_id: '',
            categories: [{ name: '', weight: 0 }]
        });
    };

    const handleEdit = (schema: any) => {
        setEditingSchema(schema);
        setFormData({
            name: schema.name,
            description: schema.description || '',
            academic_year_id: schema.academic_year_id || '',
            categories: schema.categories.map((c: any) => ({ name: c.name, weight: c.weight, description: c.description }))
        });
        setIsDialogOpen(true);
    };

    const handleDeleteClick = (id: string) => {
        setSchemaToDelete(id);
        setIsConfirmModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!schemaToDelete) return;
        try {
            await deleteSchemaMutation.mutateAsync(schemaToDelete);
            toast.success('Grading schema deleted successfully');
            setIsConfirmModalOpen(false);
            setSchemaToDelete(null);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Failed to delete schema');
        }
    };

    if (isLoading) return <div>Loading schemas...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Grading Schemas</h2>
                    <p className="text-muted-foreground">Manage rules and weight distributions for class evaluations.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                }}>
                    <Button onClick={() => setIsDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Schema
                    </Button>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingSchema ? 'Edit Schema' : 'Create New Grading Schema'}</DialogTitle>
                            <DialogDescription>
                                Define the categories and weights for this grading rule set.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6 py-4">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Schema Name</Label>
                                    <Input
                                        id="name"
                                        placeholder="e.g. Assessment Schema"
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="academic_year">Academic Year</Label>
                                    <Select
                                        value={formData.academic_year_id}
                                        onValueChange={(val) => setFormData(prev => ({ ...prev, academic_year_id: val }))}
                                    >
                                        <SelectTrigger id="academic_year">
                                            <SelectValue placeholder="Select Academic Year" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ayList.map((ay) => (
                                                <SelectItem key={ay.id} value={ay.id}>{ay.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Input
                                        id="description"
                                        placeholder="Optional description"
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-md font-semibold">Categories & Weights</h3>
                                    <Badge variant={totalWeight === 100 ? 'default' : 'destructive'}>
                                        Total: {totalWeight}%
                                    </Badge>
                                </div>

                                <Progress value={totalWeight} className="h-2" />

                                <div className="space-y-3">
                                    {formData.categories.map((cat, index) => (
                                        <div key={index} className="flex gap-3 items-end">
                                            <div className="flex-1 space-y-1">
                                                <Label className="text-xs">Category Name</Label>
                                                <Input
                                                    placeholder="Exam, Quiz, etc."
                                                    value={cat.name}
                                                    onChange={(e) => handleCategoryChange(index, 'name', e.target.value)}
                                                />
                                            </div>
                                            <div className="w-24 space-y-1">
                                                <Label className="text-xs">Weight (%)</Label>
                                                <Input
                                                    type="number"
                                                    placeholder="%"
                                                    value={cat.weight}
                                                    onChange={(e) => handleCategoryChange(index, 'weight', Number(e.target.value))}
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive h-10 w-10"
                                                onClick={() => handleRemoveCategory(index)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>

                                <Button variant="outline" size="sm" onClick={handleAddCategory} className="w-full">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Category
                                </Button>
                            </div>

                            {totalWeight !== 100 && (
                                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>The total weight must equal exactly 100% to save.</span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={createSchemaMutation.isPending || updateSchemaMutation.isPending}>Cancel</Button>
                            <Button onClick={handleSave} disabled={totalWeight !== 100 || createSchemaMutation.isPending || updateSchemaMutation.isPending}>
                                {(createSchemaMutation.isPending || updateSchemaMutation.isPending) && (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                )}
                                {editingSchema ? 'Update Schema' : 'Create Schema'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {schemas?.map((schema) => (
                    <Card key={schema.id} className="relative overflow-hidden group">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-lg">{schema.name}</CardTitle>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(schema)}>
                                        <Edit className="w-4 h-4 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteClick(schema.id)}>
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                            <CardDescription>{schema.description || 'No description provided.'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {schema.categories.map((cat) => (
                                    <div key={cat.id} className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">{cat.name}</span>
                                        <Badge variant="outline">{cat.weight}%</Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                        {schema.is_active && (
                            <div className="absolute top-0 right-0 p-1">
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 py-0.5 px-1.5 text-[10px] rounded-bl-sm">ACTIVE</Badge>
                            </div>
                        )}
                    </Card>
                ))}
                {(schemas === undefined || schemas.length === 0) && (
                    <div className="col-span-full py-16 text-center border-2 border-dashed rounded-2xl bg-muted/10 space-y-4">
                        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                            <Plus className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-lg font-medium">No grading schemas configured yet.</p>
                            <p className="text-sm text-muted-foreground">Create rules and weight distributions for class evaluations.</p>
                        </div>
                        <Button onClick={() => setIsDialogOpen(true)} variant="outline">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Your First Schema
                        </Button>
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={isConfirmModalOpen}
                title="Delete Grading Schema"
                message="Are you sure you want to delete this grading schema? This action cannot be undone and may affect existing evaluations."
                confirmButtonText="Yes, Delete"
                onConfirm={handleConfirmDelete}
                onCancel={() => setIsConfirmModalOpen(false)}
                isLoading={deleteSchemaMutation.isPending}
            />
        </div>
    );
}
