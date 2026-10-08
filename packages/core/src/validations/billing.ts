import { z } from 'zod'

/** Self-serve plans a customer can check out into via Stripe. */
export const checkoutPlanSchema = z.enum(['starter', 'growth'])
export type CheckoutPlan = z.infer<typeof checkoutPlanSchema>
