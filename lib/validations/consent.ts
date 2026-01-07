import { z } from 'zod';

export const consentSchema = z.object({
  vaultDataId: z.string().uuid('Invalid vault data ID').optional(),
  grantedTo: z.string().min(1, 'Organization identifier is required'),
  grantedToName: z.string().min(1, 'Organization name is required'),
  grantedToEmail: z.string().email('Invalid email address').optional(),
  accessLevel: z.enum(['read', 'export', 'verify']),
  purpose: z.string().min(1, 'Purpose is required').max(500, 'Purpose must be 500 characters or less'),
  endDate: z.date().optional(),
  termsVersion: z.string().default('1.0'),
});

export type ConsentInput = z.infer<typeof consentSchema>;

export const revokeConsentSchema = z.object({
  revokedReason: z.string().min(1, 'Reason for revocation is required').max(500),
});

export type RevokeConsentInput = z.infer<typeof revokeConsentSchema>;

export const updateConsentSchema = z.object({
  endDate: z.date().optional(),
});

export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;
