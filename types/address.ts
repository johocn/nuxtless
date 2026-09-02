export interface AddressRecord {
  id: string;
  defaultShippingAddress: boolean;
  fullName: string | null;
  company?: string | null;
  streetLine1: string | null;
  streetLine2?: string | null;
  province?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryCode: string | null;
  countryName: string | null;
  phoneNumber?: string | null;
}

export interface AddressDraft {
  fullName: string;
  company?: string;
  streetLine1: string;
  streetLine2?: string;
  province?: string;
  city?: string;
  postalCode?: string;
  countryCode: string;
  phoneNumber?: string;
  isDefault?: boolean;
}