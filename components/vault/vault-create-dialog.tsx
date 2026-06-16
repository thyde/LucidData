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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  FormTextField,
  FormTextAreaField,
  FormSelectField,
  FormTagsField,
  FormDateField,
} from '@/components/common/form-fields';
import { VAULT_SCHEMA_TYPES, type VaultSchemaType } from '@/lib/schemas/vault-schemas';
import { SCHEMA_FORM_FIELDS } from '@/lib/schemas/form-fields';
import { SchemaForm } from './schema-form';

// Form schema for the non-data fields (label, category, description, tags, expiresAt)
const metaFormSchema = vaultDataSchema.omit({ data: true, expiresAt: true }).extend({
  expiresAt: z.string().optional().refine(
    (val) => !val || val === '' || !isNaN(Date.parse(val)),
    { message: 'Invalid date format' }
  ),
});

type MetaFormValues = z.infer<typeof metaFormSchema>;

export function VaultCreateDialog() {
  const [open, setOpen] = useState(false);
  const [schemaType, setSchemaType] = useState<VaultSchemaType>('custom');
  const [schemaData, setSchemaData] = useState<Record<string, unknown>>({});
  const [customJson, setCustomJson] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const { mutate, isPending } = useCreateVault();

  const form = useForm<MetaFormValues>({
    resolver: zodResolver(metaFormSchema),
    defaultValues: {
      label: '',
      category: '',
      description: '',
      tags: [],
      dataType: 'json',
      schemaType: '',
      schemaVersion: '1.0',
      expiresAt: undefined,
    },
  });

  const handleSchemaTypeChange = (type: VaultSchemaType) => {
    setSchemaType(type);
    setSchemaData({});
    setCustomJson('{}');
    setJsonError(null);
    form.setValue('category', VAULT_SCHEMA_TYPES[type].category);
    form.setValue('schemaType', type === 'custom' ? '' : type);
  };

  const onSubmit = (values: MetaFormValues) => {
    let parsedData: Record<string, unknown>;

    if (schemaType !== 'custom') {
      parsedData = schemaData;
    } else {
      try {
        parsedData = JSON.parse(customJson);
        setJsonError(null);
      } catch {
        setJsonError('Invalid JSON');
        return;
      }
    }

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
        setSchemaType('custom');
        setSchemaData({});
        setCustomJson('{}');
        setJsonError(null);
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
            {/* Schema type selector */}
            <div className="space-y-2">
              <Label htmlFor="schema-type-select">Data type</Label>
              <select
                id="schema-type-select"
                title="Data type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={schemaType}
                onChange={e => handleSchemaTypeChange(e.target.value as VaultSchemaType)}
              >
                {Object.entries(VAULT_SCHEMA_TYPES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              {schemaType !== 'custom' && (
                <p className="text-xs text-muted-foreground">
                  {VAULT_SCHEMA_TYPES[schemaType].description}
                </p>
              )}
            </div>

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

            {/* Dynamic data form or JSON textarea */}
            <div className="space-y-2">
              <Label>
                {schemaType !== 'custom' ? 'Entry data' : 'Data (JSON)'}
              </Label>
              {schemaType !== 'custom' && SCHEMA_FORM_FIELDS[schemaType] ? (
                <SchemaForm
                  fields={SCHEMA_FORM_FIELDS[schemaType]}
                  value={schemaData}
                  onChange={setSchemaData}
                />
              ) : (
                <>
                  <textarea
                    aria-label="Data"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none"
                    value={customJson}
                    onChange={e => {
                      setCustomJson(e.target.value);
                      setJsonError(null);
                    }}
                    placeholder='{"key": "value"}'
                    rows={6}
                  />
                  {jsonError && (
                    <p className="text-sm font-medium text-destructive">{jsonError}</p>
                  )}
                </>
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
