import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { DesktopNav } from '@/components/layout/desktop-nav';
import { MobileNav } from '@/components/layout/mobile-nav';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Building2, Settings } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
    redirect('/two-factor');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4 md:space-x-8">
            <MobileNav />
            <Link href="/dashboard" className="text-2xl font-bold">
              Lucid
            </Link>
            <DesktopNav />
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/org"
              aria-label="Organizations"
              title="Organizations"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Building2 className="h-5 w-5" />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <NotificationBell />
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <SignOutButton className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
