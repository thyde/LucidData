'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRevokeConsent } from '@/lib/hooks/useConsent';
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
  FormDescription,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';

const formSchema = z.object({
  revokedReason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must confirm to proceed',
  }),
});

interface ConsentRevokeDialogProps {
  consentId: string;
  consentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConsentRevokeDialog({
  consentId,
  consentName,
  open,
  onOpenChange,
}: ConsentRevokeDialogProps) {
  const { mutate, isPending } = useRevokeConsent();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      revokedReason: '',
      confirm: false,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutate(
      { id: consentId, reason: values.revokedReason },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Revoke Consent
          </DialogTitle>
          <DialogDescription>
            You are about to revoke consent for <strong>{consentName}</strong>. This action will
            immediately terminate their access to your data.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="revokedReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Revocation</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explain why you are revoking this consent..."
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
              name="confirm"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      I understand this action cannot be undone
                    </FormLabel>
                    <FormDescription>
                      The organization will lose access immediately
                    </FormDescription>
                    <FormMessage />
                  </div>
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
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending ? 'Revoking...' : 'Revoke Consent'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
