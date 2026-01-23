'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateConsent } from '@/lib/hooks/useConsent';
import { useVaultList } from '@/lib/hooks/useVault';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// Extend schema for form handling - use form-friendly string types
const formSchema = z.object({
  vaultDataId: z.string().optional(),
  grantedTo: z.string().min(1, 'Organization identifier is required'),
  grantedToName: z.string().min(1, 'Organization name is required'),
  grantedToEmail: z.string().refine(
    (val) => {
      if (!val || val === '') return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    },
    { message: 'Invalid email address' }
  ).optional(),
  accessLevel: z.enum(['read', 'export', 'verify']),
  purpose: z.string().min(10, 'Purpose must be at least 10 characters').max(500, 'Purpose must be 500 characters or less'),
  endDate: z.string().optional().refine(
    (val) => !val || val === '' || new Date(val) > new Date(),
    { message: 'End date must be in the future' }
  ),
  termsVersion: z.string().default('1.0'),
});

type FormValues = z.infer<typeof formSchema>;

interface ConsentCreateDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preselectedVaultDataId?: string;
  trigger?: React.ReactNode;
}

export function ConsentCreateDialog({
  open: controlledOpen,
  onOpenChange,
  preselectedVaultDataId,
  trigger,
}: ConsentCreateDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const { mutate, isPending } = useCreateConsent();
  const { data: vaultEntries } = useVaultList();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vaultDataId: preselectedVaultDataId || '',
      grantedTo: '',
      grantedToName: '',
      grantedToEmail: '',
      accessLevel: 'read',
      purpose: '',
      endDate: '',
      termsVersion: '1.0',
    },
  });

  const onSubmit = (values: FormValues) => {
    const payload = {
      vaultDataId: values.vaultDataId || undefined,
      grantedTo: values.grantedTo,
      grantedToName: values.grantedToName,
      grantedToEmail: values.grantedToEmail || undefined,
      accessLevel: values.accessLevel,
      purpose: values.purpose,
      endDate: values.endDate ? new Date(values.endDate) : undefined,
      termsVersion: values.termsVersion,
    };

    mutate(payload, {
      onSuccess: () => {
        form.reset();
        setOpen(false);
      },
    });
  };

  // Calculate preset dates
  const getPresetDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 16);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button>Grant Consent</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grant Consent</DialogTitle>
          <DialogDescription>
            Grant an organization access to your vault data. You can revoke this consent at any time.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="vaultDataId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vault Data to Share (Optional)</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">No specific data</option>
                      {vaultEntries?.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label} ({entry.category})
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>
                    Select which vault entry to share, or leave blank for general consent
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="grantedToName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Acme Healthcare" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="grantedTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Identifier</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., org-12345 or email@organization.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    Unique identifier for the organization
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="grantedToEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Email (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="contact@organization.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accessLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Level</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-start space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="read" />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal">
                            Read - View data only
                          </FormLabel>
                          <FormDescription>
                            Organization can view the shared data
                          </FormDescription>
                        </div>
                      </FormItem>
                      <FormItem className="flex items-start space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="export" />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal">
                            Export - Download/export data
                          </FormLabel>
                          <FormDescription>
                            Organization can download and export the data
                          </FormDescription>
                        </div>
                      </FormItem>
                      <FormItem className="flex items-start space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="verify" />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal">
                            Verify - Verify authenticity
                          </FormLabel>
                          <FormDescription>
                            Organization can verify data authenticity
                          </FormDescription>
                        </div>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explain why this organization needs access to your data..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Minimum 10 characters, maximum 500
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiration Date (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Quick presets:
                  </FormDescription>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(getPresetDate(30))}
                    >
                      30 days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(getPresetDate(90))}
                    >
                      90 days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(getPresetDate(365))}
                    >
                      1 year
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange('')}
                    >
                      Indefinite
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
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
                {isPending ? 'Granting...' : 'Grant Consent'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
