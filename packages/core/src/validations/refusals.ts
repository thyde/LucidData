/**
 * Codes the vault answers a refused write with. Every client branches on these
 * rather than on the wording, so they live here, once.
 */

/** Health data needs the person's separate consent before it is stored (LD-110). */
export const HEALTH_CONSENT_REQUIRED = 'health_consent_required'

/** A new vault stores nothing until recovery is set up or declined (LD-105). */
export const RECOVERY_REQUIRED = 'recovery_required'
