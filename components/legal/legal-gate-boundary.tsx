'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LEGAL_GATE_EXEMPT_PATHS, type IndividualDocument } from '@/lib/constants/legal';
import { LegalAcceptanceGate } from '@/components/legal/legal-acceptance-gate';

interface LegalGateBoundaryProps {
  outstanding: IndividualDocument[];
  returning: boolean;
  children: ReactNode;
}

/**
 * LD-110. Decides per page whether to show the acceptance prompt. It has to run
 * on the client, because the App Router keeps a shared layout across client
 * navigations, so a decision made in the layout would follow the person from
 * the dashboard into settings.
 */
export function LegalGateBoundary({ outstanding, returning, children }: LegalGateBoundaryProps) {
  const pathname = usePathname();
  const exempt = LEGAL_GATE_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (outstanding.length > 0 && !exempt) {
    return <LegalAcceptanceGate outstanding={outstanding} returning={returning} />;
  }
  return <>{children}</>;
}
