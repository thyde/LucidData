'use client';

import { createContext, useContext } from 'react';
import { failureCode } from '@/lib/actions/unwrap';
import { HEALTH_CONSENT_REQUIRED } from '@/lib/constants/legal';

export const HEALTH_CONSENT_DECLINED_MESSAGE =
  'Not saved. LucidData needs your consent before it stores health data.';

export interface HealthConsentContextValue {
  /** Ask for consent. Resolves true once it is recorded, false if the person declines. */
  requestHealthConsent: () => Promise<boolean>;
}

export const HealthConsentContext = createContext<HealthConsentContextValue | null>(null);

/** Outside the dashboard there is nobody to ask, so the request is declined. */
const DECLINE: HealthConsentContextValue = { requestHealthConsent: async () => false };

export function useHealthConsent(): HealthConsentContextValue {
  return useContext(HealthConsentContext) ?? DECLINE;
}

/**
 * LD-110: run a write, and if the server refuses it for missing health data
 * consent, ask once and retry. Any other failure passes through untouched.
 */
export async function withHealthConsent<T>(
  run: () => Promise<T>,
  requestHealthConsent: () => Promise<boolean>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (failureCode(error) !== HEALTH_CONSENT_REQUIRED) throw error;
    if (!(await requestHealthConsent())) throw new Error(HEALTH_CONSENT_DECLINED_MESSAGE);
    return run();
  }
}
