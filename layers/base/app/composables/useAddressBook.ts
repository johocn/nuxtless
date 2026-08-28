import type { AddressRecord, AddressDraft } from "~~/types/address";

function toRecord(a: any): AddressRecord {
  return {
    id: a.id,
    fullName: a.fullName ?? null,
    streetLine1: a.streetLine1 ?? null,
    streetLine2: a.streetLine2 ?? null,
    province: a.province ?? null,
    city: a.city ?? null,
    postalCode: a.postalCode ?? null,
    countryCode: a.country?.code ?? null,
    countryName: a.country?.name ?? null,
    phoneNumber: a.phoneNumber ?? null,
  };
}

export function useAddressBook() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const addresses = ref<AddressRecord[]>([]);

  // Vendure 无重排 API：默认地址 = addresses 首条
  const defaultAddress = computed<AddressRecord | null>(
    () => addresses.value[0] ?? null,
  );

  async function fetchAddresses(): Promise<AddressRecord[]> {
    loading.value = true;
    error.value = null;
    try {
      const { activeCustomer } = await GqlGetCustomerAddresses();
      addresses.value = (activeCustomer?.addresses ?? []).map(toRecord);
      return addresses.value;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "failed to fetch addresses";
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function createAddress(d: AddressDraft): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await GqlCreateCustomerAddress({
        input: {
          fullName: d.fullName,
          streetLine1: d.streetLine1,
          streetLine2: d.streetLine2,
          province: d.province,
          city: d.city,
          postalCode: d.postalCode,
          countryCode: d.countryCode,
          phoneNumber: d.phoneNumber,
          defaultShippingAddress: d.isDefault ? true : false,
        },
      });
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "failed to create address";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function updateAddress(id: string, d: AddressDraft): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await GqlUpdateCustomerAddress({
        input: {
          id,
          fullName: d.fullName,
          streetLine1: d.streetLine1,
          streetLine2: d.streetLine2,
          province: d.province,
          city: d.city,
          postalCode: d.postalCode,
          countryCode: d.countryCode,
          phoneNumber: d.phoneNumber,
        },
      });
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "failed to update address";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function deleteAddress(id: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const { deleteCustomerAddress: res } = await GqlDeleteCustomerAddress({ id });
      return res?.success ?? false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "failed to delete address";
      return false;
    } finally {
      loading.value = false;
    }
  }

  function recordToDraft(r: AddressRecord): AddressDraft {
    return {
      fullName: r.fullName ?? "",
      streetLine1: r.streetLine1 ?? "",
      streetLine2: r.streetLine2 ?? "",
      province: r.province ?? "",
      city: r.city ?? "",
      postalCode: r.postalCode ?? "",
      countryCode: r.countryCode ?? "",
      phoneNumber: r.phoneNumber ?? "",
    };
  }

  return {
    loading,
    error,
    addresses,
    defaultAddress,
    fetchAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    recordToDraft,
  };
}