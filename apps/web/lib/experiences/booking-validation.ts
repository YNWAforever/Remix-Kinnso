import type { CreateCheckoutSessionInput } from '@/lib/experiences/booking-types'

export type ValidationErrors = Record<string, string[]>
export type ParsedCheckoutInput = { availabilityId: string; qty: number; guestEmail: string | null }
export type CheckoutValidation =
  | { ok: true; parsed: ParsedCheckoutInput }
  | { ok: false; errors: ValidationErrors }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_QTY = 10

export function validateCheckoutInput(
  input: CreateCheckoutSessionInput,
  options: { requireGuestEmail: boolean },
): CheckoutValidation {
  const errors: ValidationErrors = {}

  if (!input.availabilityId) errors.availabilityId = ['required']

  const qtyRaw = input.qty.trim()
  const qty = Number(qtyRaw)
  if (!qtyRaw || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
    errors.qty = ['invalid_number']
  }

  let guestEmail: string | null = null
  if (options.requireGuestEmail) {
    const normalized = String(input.guestEmail ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(normalized) || normalized.length > 254) {
      errors.guestEmail = ['invalid_email']
    } else {
      guestEmail = normalized
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, parsed: { availabilityId: input.availabilityId, qty, guestEmail } }
}
