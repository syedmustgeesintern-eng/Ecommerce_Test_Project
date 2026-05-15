export interface ShippingAddressOverride {
  fullName: string;
  phoneNumber: string;
  country: string;
  city: string;
  state: string | null;
  postalCode: string;
  streetAddress: string;
}
