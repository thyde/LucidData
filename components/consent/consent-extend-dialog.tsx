'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useExtendConsent } from '@/lib/hooks/useConsent';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface ConsentExtendDialogProps {
  consentId: string;
  currentEndDate: Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConsentExtendDialog({
  consentId,
  currentEndDate,
  open,
  onOpenChange,
}: ConsentExtendDialogProps) {
  const { mutate, isPending } = useExtendConsent();

  const formSchema = z.object({
    endDate: z.string().refine(
      (val) => {
        const newDate = new Date(val);
        const now = new Date();
        if (newDate <= now) return false;
        if (currentEndDate && newDate <= new Date(currentEndDate)) return false;
        return true;
      },
      {
        message: currentEndDate
          ? 'New date must be after current expiration and in the future'
          : 'Date must be in the future',
      }
    ),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      endDate: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    mutate(
      {
        id: consentId,
        data: { endDate: new Date(values.endDate) },
      },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      }
    );
  };

  const addDays = (days: number) => {
    const date = currentEndDate ? new Date(currentEndDate) : new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 16);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend Consent</DialogTitle>
          <DialogDescription>
            Set a new expiration date for this consent
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {currentEndDate && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <span className="text-muted-foreground">Current expiration: </span>
                <span className="font-medium">
                  {format(new Date(currentEndDate), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            )}

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Expiration Date</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormDescription>
                    Extend by:
                  </FormDescription>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(addDays(30))}
                    >
                      +30 days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(addDays(90))}
                    >
                      +90 days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.onChange(addDays(365))}
                    >
                      +1 year
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
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Extending...' : 'Extend Consent'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
