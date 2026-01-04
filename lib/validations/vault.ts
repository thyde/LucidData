import { z } from 'zod';

export const vaultDataSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  category: z.enum(['personal', 'health', 'financial', 'credentials', 'other']),
  dataType: z.enum(['json', 'credential', 'document']).default('json'),
  data: z.record(z.any()), // The actual data to be encrypted
  tags: z.array(z.string()).optional().default([]),
  schemaType: z.string().optional(),
  schemaVersion: z.string().optional().default('1.0'),
  expiresAt: z.date().optional(),
});

export type VaultDataInput = z.infer<typeof vaultDataSchema>;

export const updateVaultDataSchema = vaultDataSchema.partial();

export type UpdateVaultDataInput = z.infer<typeof updateVaultDataSchema>;
