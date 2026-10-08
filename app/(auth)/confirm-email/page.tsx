import type { Metadata } from 'next';
import Link from 'next/link';
import { confirmEmailAction } from '@/lib/actions/email-confirmation.actions';
import { ConfirmEmailButton } from '@/components/auth/confirm-email-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Confirm your email address | LucidData',
  robots: { index: false, follow: false },
};

/**
 * LD-610. The link in the confirmation email lands here. Nothing happens until
 * the person presses the button, because mail scanners open links to inspect
 * them and would otherwise use up the link first.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const complete = Boolean(tokenHash && type);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle as="h1" className="text-2xl font-bold text-center">Confirm your email address</CardTitle>
        <CardDescription className="text-center">
          {complete
            ? 'Press the button to confirm this address. You will sign in next, and your vault is set up then.'
            : 'This link is missing part of its address. Open the link in the email again.'}
        </CardDescription>
      </CardHeader>
      {complete ? (
        <form action={confirmEmailAction}>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <CardFooter className="flex flex-col space-y-4">
            <ConfirmEmailButton />
          </CardFooter>
        </form>
      ) : (
        <CardContent>
          <p className="text-sm text-center text-muted-foreground">
            <Link href="/login" className="text-primary underline">
              Go to sign in
            </Link>
          </p>
        </CardContent>
      )}
    </Card>
  );
}
