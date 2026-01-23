'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateVault } from '@/lib/hooks/useVault';
import { vaultDataSchema } from '@/lib/validations/vault';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  FormTextField,
  FormTextAreaField,
  FormSelectField,
  FormTagsField,
  FormDateField,
} from '@/components/common/form-fields';

// Extend schema to handle JSON string input and date string from form
const formSchema = vaultDataSchema.omit({ expiresAt: true }).extend({
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
  expiresAt: z.string().optional().refine(
    (val) => !val || val === '' || !isNaN(Date.parse(val)),
    { message: 'Invalid date format' }
  ),
});

type FormValues = z.infer<typeof formSchema>;

export function VaultCreateDialog() {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useCreateVault();

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

  const onSubmit = (values: FormValues) => {
    // Parse JSON string to object
    const parsedData = JSON.parse(values.data);

    // Convert form values to API payload
    const payload = {
      label: values.label,
      category: values.category,
      description: values.description || undefined,
      tags: values.tags || [],
      data: parsedData,
      dataType: values.dataType,
      schemaType: values.schemaType || undefined,
      schemaVersion: values.schemaVersion,
      expiresAt: values.expiresAt ? new Date(values.expiresAt) : undefined,
    };

    mutate(payload, {
      onSuccess: () => {
        form.reset();
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Vault Entry</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Vault Entry</DialogTitle>
          <DialogDescription>
            Create a new encrypted vault entry. All data will be encrypted before storage.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormTextField
              control={form.control}
              name="label"
              label="Label"
              placeholder="Enter a label for this entry"
            />

            <FormSelectField
              control={form.control}
              name="category"
              label="Category"
              placeholder="Select a category"
              options={[
                { value: 'personal', label: 'Personal' },
                { value: 'health', label: 'Health' },
                { value: 'financial', label: 'Financial' },
                { value: 'credentials', label: 'Credentials' },
                { value: 'other', label: 'Other' },
              ]}
            />

            <FormTextAreaField
              control={form.control}
              name="description"
              label="Description"
              placeholder="Optional description"
            />

            <FormTagsField
              control={form.control}
              name="tags"
              label="Tags"
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

            <FormTextField
              control={form.control}
              name="schemaType"
              label="Schema Type"
              placeholder="Optional schema type"
            />

            <FormDateField
              control={form.control}
              name="expiresAt"
              label="Expires At"
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
