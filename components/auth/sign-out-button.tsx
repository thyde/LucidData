'use client';

import { useState } from 'react';

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className }: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
      });

      if (response.ok) {
        // Force a hard redirect to ensure clean state
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Signout error:', error);
      setLoading(false);
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
