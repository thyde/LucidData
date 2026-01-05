'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { vaultDataSchema, type VaultDataInput } from '@/lib/validations/vault';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils';

export function CreateVaultForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Partial<VaultDataInput>>({
    resolver: zodResolver(vaultDataSchema.partial()),
    defaultValues: {
      tags: [],
      dataType: 'json',
      schemaVersion: '1.0',
    },
  });

  async function onSubmit(data: Partial<VaultDataInput>) {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to create vault entry',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Vault entry created successfully',
      });

      reset();
    } catch (error) {
      console.error('Error creating vault entry:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          placeholder="e.g., Medical Records"
          {...register('label')}
          className={cn(errors.label && 'border-destructive')}
        />
        {errors.label && (
          <p className="mt-1 text-sm text-destructive">{errors.label.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <Select {...register('category')}>
          <option value="">Select a category</option>
          <option value="personal">Personal</option>
          <option value="health">Health</option>
          <option value="financial">Financial</option>
          <option value="credentials">Credentials</option>
          <option value="other">Other</option>
        </Select>
        {errors.category && (
          <p className="mt-1 text-sm text-destructive">{errors.category.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="tags">Tags (comma-separated)</Label>
        <Input
          id="tags"
          placeholder="tag1, tag2, tag3"
          {...register('tags')}
        />
      </div>

      <div>
        <Label htmlFor="schemaType">Schema Type (optional)</Label>
        <Input
          id="schemaType"
          placeholder="e.g., MedicalRecord"
          {...register('schemaType')}
        />
      </div>

      <div>
        <Label htmlFor="expiresAt">Expires At (optional)</Label>
        <Input
          id="expiresAt"
          type="datetime-local"
          {...register('expiresAt')}
        />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create Vault Entry'}
      </Button>
    </form>
  );
}
