'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export function ConfirmEmailButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Confirming...' : 'Confirm email address'}
    </Button>
  );
}
