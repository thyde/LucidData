'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useVaultEntry, useUpdateVault } from '@/lib/hooks/useVault';
import { vaultDataSchema } from '@/lib/validations/vault';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

// Extend schema to handle JSON string input
const formSchema = vaultDataSchema.extend({
  data: z.string().min(1, 'Data is required').refine(
    (val) => {
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid JSON' }
  ),
});

type FormValues = z.infer<typeof formSchema>;

interface VaultEditDialogProps {
  entryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VaultEditDialog({ entryId, open, onOpenChange }: VaultEditDialogProps) {
  const { data: entry, isLoading, error } = useVaultEntry(entryId);
  const { mutate, isPending } = useUpdateVault();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: '',
      category: '' as any,
      description: '',
      tags: [],
      data: '',
      dataType: 'json',
      schemaType: '',
      schemaVersion: '1.0',
      expiresAt: undefined,
    },
  });

  // Reset form when entry loads
  useEffect(() => {
    if (entry) {
      form.reset({
        label: entry.label,
        category: entry.category,
        description: entry.description || '',
        tags: entry.tags || [],
        data: JSON.stringify(entry.data, null, 2),
        dataType: entry.dataType,
        schemaType: entry.schemaType || '',
        schemaVersion: entry.schemaVersion,
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString().slice(0, 16) : undefined,
      });
    }
  }, [entry, form]);

  const onSubmit = (values: FormValues) => {
    // Parse JSON string to object
    const parsedData = JSON.parse(values.data);

    // Convert form values to API payload
    mutate(
      {
        id: entryId,
        data: {
          label: values.label,
          category: values.category,
          description: values.description || undefined,
          tags: values.tags || [],
          data: parsedData,
          dataType: values.dataType,
          schemaType: values.schemaType || undefined,
          schemaVersion: values.schemaVersion,
          expiresAt: values.expiresAt ? new Date(values.expiresAt) : undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading && <div>Loading...</div>}
        {error && <div>Not found</div>}
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>Edit Vault Entry</DialogTitle>
              <DialogDescription>
                Update your encrypted vault entry. All data will be encrypted before storage.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter a label for this entry" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Select a category</option>
                          <option value="personal">Personal</option>
                          <option value="health">Health</option>
                          <option value="financial">Financial</option>
                          <option value="credentials">Credentials</option>
                          <option value="other">Other</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Optional description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter tags (comma-separated)"
                          value={field.value?.join(', ') || ''}
                          onChange={(e) => {
                            const tags = e.target.value
                              .split(',')
                              .map((tag) => tag.trim())
                              .filter((tag) => tag.length > 0);
                            field.onChange(tags);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    JSON Content
                  </label>
                  <Textarea
                    aria-label="Data"
                    placeholder='{"key": "value"}'
                    className="font-mono"
                    rows={6}
                    {...form.register('data')}
                  />
                  {form.formState.errors.data && (
                    <p className="text-sm font-medium text-destructive">
                      {form.formState.errors.data.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="vault-datatype-field" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Data Type
                  </label>
                  <select
                    id="vault-datatype-field"
                    {...form.register('dataType')}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="json">JSON</option>
                    <option value="credential">Credential</option>
                    <option value="document">Document</option>
                  </select>
                  {form.formState.errors.dataType && (
                    <p className="text-sm font-medium text-destructive">
                      {form.formState.errors.dataType.message}
                    </p>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="schemaType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Schema Type</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional schema type" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires At</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          value={field.value instanceof Date ? field.value.toISOString().slice(0, 16) : field.value || ''}
                          onChange={(e) => field.onChange(e.target.value || undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? 'Saving...' : 'Save'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
