'use client';

import { useState } from 'react';

interface SignOutButtonProps {
  className?: string;
}

/**
 * Expire this browser's Supabase session cookies. Used when the server could
 * not end the session, such as offline, so the browser at least forgets it.
 */
function forgetSession(): void {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    if (name?.startsWith('sb-')) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    let ended = false;
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
      });
      ended = response.ok;
    } catch (error) {
      console.error('Signout error:', error);
    } finally {
      if (!ended) forgetSession();
      // Leave whatever the answer was: a session that had already ended
      // answers 401, and the tab must drop what it decrypted all the same.
      // A full page load rather than a client-side navigation is what
      // discards everything, from the vault key to cached entries, and
      // replace() takes this page out of the history so Back cannot restore
      // it from the browser's page cache.
      window.location.replace('/login');
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className={className}
      type="button"
    >
      {loading ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
