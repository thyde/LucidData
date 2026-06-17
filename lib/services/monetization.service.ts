import * as monetizationRepo from '@/lib/repositories/monetization.repository'
import { createAuditEntry } from '@/lib/services/audit.service'
import type { VaultFieldMonetization, SalePreferences } from '@/types/database.types'
import type { FieldMonetizationInput, SalePreferencesInput } from '@/lib/validations/marketplace'

export async function getFieldMonetization(
  vaultDataId: string,
  userId: string
): Promise<VaultFieldMonetization[]> {
  return monetizationRepo.findFieldsByVault(vaultDataId, userId)
}

export async function getAllFieldMonetization(userId: string): Promise<VaultFieldMonetization[]> {
  return monetizationRepo.findFieldsByUser(userId)
}

/** Set per-field $/lock toggles for one vault entry. */
export async function setFieldMonetization(
  userId: string,
  input: FieldMonetizationInput
): Promise<void> {
  for (const field of input.fields) {
    await monetizationRepo.upsertField({
      vault_data_id: input.vault_data_id,
      user_id: userId,
      field_key: field.field_key,
      category: input.category,
      opted_in: field.opted_in,
    })
  }
  const optedIn = input.fields.filter((f) => f.opted_in).length
  await createAuditEntry({
    userId,
    eventType: 'field_monetization_updated',
    action: `Updated monetization for ${input.fields.length} field(s) (${optedIn} opted in)`,
    vaultDataId: input.vault_data_id,
    metadata: { vault_data_id: input.vault_data_id },
  })
}

export async function getSalePreferences(userId: string): Promise<SalePreferences | null> {
  return monetizationRepo.findSalePreferences(userId)
}

export async function setSalePreferences(
  userId: string,
  input: SalePreferencesInput
): Promise<SalePreferences> {
  const prefs = await monetizationRepo.upsertSalePreferences({
    user_id: userId,
    allowed_purposes: input.allowed_purposes,
    blocked_buyer_orgs: input.blocked_buyer_orgs,
    min_price_cents: input.min_price_cents,
    auto_optin: input.auto_optin,
  })
  await createAuditEntry({
    userId,
    eventType: 'sale_preferences_updated',
    action: 'Updated data sale preferences',
  })
  return prefs
}
