export interface AddressRecord {
  id: string;
  fullName: string | null;
  streetLine1: string | null;
  streetLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryCode: string | null;
  countryName: string | null;
  phoneNumber?: string | null;
}

export interface AddressDraft {
  fullName: string;
  streetLine1: string;
  streetLine2?: string;
  city?: string;
  postalCode?: string;
  countryCode: string;
  phoneNumber?: string;
}