/** Immutable shipping address snapshot stored on every order at checkout time. */
export interface ShippingAddressSnapshot {
  fullName: string;
  phoneNumber: string;
  country: string;
  city: string;
  state: string | null;
  postalCode: string;
  streetAddress: string;
  addressLabel: string | null;
}
