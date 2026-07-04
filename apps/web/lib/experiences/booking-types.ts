export type CreateCheckoutSessionInput = {
  availabilityId: string
  qty: string // form-string; validated/parsed to an integer in validation
  guestEmail?: string // required when the caller is anon, ignored when signed in
}
