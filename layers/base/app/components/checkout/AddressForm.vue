<script setup lang="ts">
import { createBillingAddressSchema } from "~~/layers/base/validators/addressForm";
import type { AddressForm } from "~~/layers/base/validators/addressForm";

import type { FormSubmitEvent } from "@nuxt/ui";
import type { DistrictNode } from "~~/.nuxt/gql/default";
import type { ReverseGeocodeInfo } from "~~/types/location";
import type { ActiveCustomerDetail } from "~~/types/customer";
import type { CheckoutState } from "~~/types/general";
import { isActiveCustomerDetail } from "~~/types/guard";

const isSubmitted = defineModel<boolean>({ default: false });

const { t } = useI18n();
// 校验提示随 locale 切换（中文/英文）
const billingSchema = computed(() =>
  createBillingAddressSchema((k) => t(k)),
);
const addressForm = useTemplateRef("addressForm");
const submitAddress = () => addressForm.value?.submit();
defineExpose({ submitAddress });

const { isAuthenticated } = storeToRefs(useAuthStore());
const orderStore = useOrderStore();
const locationStore = useLocationStore();
const { customer } = storeToRefs(useCustomerStore());
const { fetchCustomer } = useCustomerStore();
const countryCodeDefault = "CN";
const isMounted = ref(false);

if (!isActiveCustomerDetail(customer.value)) {
  await fetchCustomer("detail");
}

const activeCustomer = computed<ActiveCustomerDetail | null>(() =>
  isActiveCustomerDetail(customer.value) ? customer.value : null,
);

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.addressForm;

const { data: countriesData } = await useAsyncGql("GetChannelCountries");

const countries = computed(
  () =>
    countriesData.value?.activeChannel?.defaultShippingZone?.members.map(
      (c) => ({
        label: c.name,
        code: c.code,
      }),
    ) ?? [],
);

// ===== 省市区街道四级联动（高德行政区划逐级下钻）=====
interface LevelList {
  current: string;
  items: DistrictNode[];
}
const provinceSel = ref<LevelList>({ current: "", items: [] });
const citySel = ref<LevelList>({ current: "", items: [] });
const districtSel = ref<LevelList>({ current: "", items: [] });
const streetSel = ref<LevelList>({ current: "", items: [] });
const districtsLoading = ref(false);

function fullAddress(): string {
  return [provinceSel.value.current, citySel.value.current, districtSel.value.current, streetSel.value.current]
    .filter(Boolean)
    .join(" ");
}

function syncState() {
  state.province = provinceSel.value.current;
  state.city = citySel.value.current;
  state.district = districtSel.value.current;
  state.street = streetSel.value.current;
  state.streetLine1 = fullAddress();
}

async function loadDistrict(parentAdcode: string | null, target: LevelList) {
  districtsLoading.value = true;
  try {
    const { mapDistricts } = await GqlGetMapDistricts({ parentAdcode });
    target.items = (mapDistricts ?? []) as DistrictNode[];
  } finally {
    districtsLoading.value = false;
  }
}

async function loadSub(
  node: DistrictNode | undefined,
  resetTarget: LevelList[],
  target: LevelList,
) {
  for (const l of resetTarget) {
    l.current = "";
    l.items = [];
  }
  if (node) await loadDistrict(node.adcode, target);
}

async function onProvinceChange() {
  state.province = provinceSel.value.current;
  const node = provinceSel.value.items.find((p) => p.name === provinceSel.value.current);
  await loadSub(node, [citySel.value, districtSel.value, streetSel.value], citySel.value);
  syncState();
}

async function onCityChange() {
  state.city = citySel.value.current;
  const node = citySel.value.items.find((c) => c.name === citySel.value.current);
  await loadSub(node, [districtSel.value, streetSel.value], districtSel.value);
  syncState();
}

async function onDistrictChange() {
  state.district = districtSel.value.current;
  const node = districtSel.value.items.find((d) => d.name === districtSel.value.current);
  await loadSub(node, [streetSel.value], streetSel.value);
  syncState();
}

function onStreetChange() {
  state.street = streetSel.value.current;
  syncState();
}

// 在给定候选名中尽量找到匹配节点；无匹配且列表只剩唯一项时自动选中该唯一项
function pickBest(
  level: LevelList,
  ...names: Array<string | null | undefined>
): DistrictNode | null {
  if (!level.items.length) return null;
  const candidates = names.filter(Boolean) as string[];
  for (const n of candidates) {
    const exact = level.items.find((x) => x.name === n);
    if (exact) return exact;
    const incl = level.items.find((x) => x.name.includes(n) || n.includes(x.name));
    if (incl) return incl;
  }
  if (level.items.length === 1) return level.items[0] ?? null;
  return null;
}

// 按定位逆地理结果（geo）自动默认选中 省→市→区→街道（街道唯一项也自动选）
async function cascadeGeo(geo: ReverseGeocodeInfo) {
  // 直辖市：省下直挂区/县（level != city），此时把区/县当作「市」级处理
  const firstNode = citySel.value.items[0];
  const isMunicipality = !!firstNode && firstNode.level !== "city";

  const cityNode = pickBest(
    citySel.value,
    ...(isMunicipality ? [geo.district, geo.city] : [geo.city]),
  );
  if (!cityNode) {
    if (citySel.value.items.length === 1) {
      citySel.value.current = citySel.value.items[0]?.name ?? "";
    }
    return;
  }
  citySel.value.current = cityNode.name;

  if (isMunicipality) {
    // 直辖市：cityNode 实为区/县，其子级即街道
    await loadDistrict(cityNode.adcode, streetSel.value);
  } else {
    await loadDistrict(cityNode.adcode, districtSel.value);
    const distNode = pickBest(districtSel.value, geo.district);
    if (distNode) {
      districtSel.value.current = distNode.name;
      await loadDistrict(distNode.adcode, streetSel.value);
    } else if (districtSel.value.items.length === 1) {
      districtSel.value.current = districtSel.value.items[0]?.name ?? "";
    }
  }

  // 街道：匹配定位值；否则唯一一项自动选中
  const streetNode = pickBest(streetSel.value, geo.street);
  if (streetNode) streetSel.value.current = streetNode.name;
  else if (streetSel.value.items.length === 1) {
    streetSel.value.current = streetSel.value.items[0]?.name ?? "";
  }
}

// 按定位自动默认省/市（优先完整逆地理 geo；无则用坐标补一次反查）
async function preselectByLocation() {
  let geo = locationStore.geo;
  if (!geo && locationStore.coords) {
    geo = await useGeoLocation().reverseGeocode(
      locationStore.coords.lat,
      locationStore.coords.lng,
    );
  }
  if (!geo) return;

  await loadDistrict(null, provinceSel.value);
  const prov = pickBest(provinceSel.value, geo.province);
  if (!prov) return;
  provinceSel.value.current = prov.name;

  await loadDistrict(prov.adcode, citySel.value);
  await cascadeGeo(geo);
  syncState();
}

async function applyExistingState() {
  // 从已有 state 恢复四级下拉：先加载省列表，再逐级下钻子级，回填 current
  // （否则只设 current 不填 items，下拉选项为空导致无法继续选择/更改）
  await loadDistrict(null, provinceSel.value);
  if (state.province) {
    const prov = provinceSel.value.items.find((p) => p.name === state.province);
    if (prov) {
      provinceSel.value.current = prov.name;
      await loadDistrict(prov.adcode, citySel.value);
      if (state.city) {
        const city = citySel.value.items.find((c) => c.name === state.city);
        if (city) {
          citySel.value.current = city.name;
          await loadDistrict(city.adcode, districtSel.value);
          if (state.district) {
            const district = districtSel.value.items.find((d) => d.name === state.district);
            if (district) {
              districtSel.value.current = district.name;
              await loadDistrict(district.adcode, streetSel.value);
              if (state.street) {
                streetSel.value.current = state.street;
              }
            }
          }
        }
      }
    }
  }
}

onMounted(async () => {
  isMounted.value = true;

  const { fetchAddresses } = useAddressBook();
  const list = isAuthenticated.value ? await fetchAddresses() : [];

  if (list.length) {
    const first = list[0];
    if (first) {
      state.fullName = first.fullName ?? "";
      state.emailAddress = activeCustomer.value?.emailAddress ?? state.emailAddress ?? "";
      state.streetLine1 = first.streetLine1 ?? "";
      state.streetLine2 = first.streetLine2 ?? "";
      state.city = first.city ?? "";
      state.province = first.province ?? "";
      state.phoneNumber = first.phoneNumber ?? "";
      state.countryCode = first.countryCode ?? countryCodeDefault;
      // 从省市区文本回填四级下拉选中项（含逐级加载子级选项）
      await applyExistingState();
      syncState();
    }
  } else {
    state.fullName = activeCustomer.value?.firstName ?? "";
    state.countryCode = state.countryCode || countryCodeDefault;
    // 无省市区，按定位城市默认省/市
    await preselectByLocation();
  }
});

async function onSubmit(event: FormSubmitEvent<AddressForm>) {
  orderStore.error = null;

  if (!isAuthenticated.value) {
    await orderStore.setCustomerForOrder({
      firstName: state.fullName,
      lastName: "",
      emailAddress: state.emailAddress,
    });
    if (orderStore.error) return;
  }

  await orderStore.setOrderShippingAddress({
    fullName: state.fullName,
    streetLine1: state.streetLine1 || fullAddress(),
    streetLine2: state.streetLine2,
    city: state.city,
    province: state.province ?? "",
    postalCode: state.postalCode,
    countryCode: state.countryCode,
    phoneNumber: state.phoneNumber,
  });

  if (orderStore.error) return;

  // 设为默认收货地址：登录用户保存到地址簿（首位=默认）
  if (state.isDefault && isAuthenticated.value) {
    orderStore.error = null;
    const { createAddress, fetchAddresses } = useAddressBook();
    const ok = await createAddress({
      fullName: state.fullName,
      streetLine1: state.streetLine1 || fullAddress(),
      streetLine2: state.streetLine2,
      city: state.city,
      province: state.province ?? "",
      postalCode: state.postalCode,
      countryCode: state.countryCode,
      phoneNumber: state.phoneNumber,
      isDefault: true,
    });
    if (ok) await fetchAddresses();
  }

  if (orderStore.error) return;

  isSubmitted.value = true;
}

async function onError() {
  isSubmitted.value = false;
}
</script>

<template>
  <UForm
    ref="addressForm"
    :schema="billingSchema"
    :state="state"
    :disabled="!isMounted"
    class="grid grid-cols-2 gap-4"
    @submit="onSubmit"
    @error="onError"
  >
    <!-- 收货人（必填，单一字段） -->
    <UFormField
      :label="t('messages.billing.recipient')"
      class="col-span-2"
      name="fullName"
      size="xl"
    >
      <UInput
        v-model="state.fullName"
        :placeholder="t('messages.billing.recipientPlaceholder')"
        class="w-full"
        type="text"
      />
    </UFormField>

    <!-- 联系电话（必填） -->
    <UFormField
      :label="t('messages.billing.phoneNumber')"
      class="col-span-2"
      name="phoneNumber"
      size="xl"
    >
      <UInput
        v-model="state.phoneNumber"
        :placeholder="t('messages.billing.phoneNumberPlaceholder')"
        class="w-full"
        type="tel"
      />
    </UFormField>

    <!-- 国家 -->
    <UFormField
      :label="t('messages.billing.country')"
      name="countryCode"
      class="col-span-2"
      size="xl"
    >
      <USelectMenu
        v-model="state.countryCode"
        value-key="code"
        :items="countries"
        class="w-full"
      />
    </UFormField>

    <!-- 省 / 市 / 区 / 街道 四级联动 -->
    <div class="col-span-2 flex flex-col gap-4 md:grid md:grid-cols-2 lg:grid-cols-4 lg:gap-2">
      <UFormField
        :label="t('messages.billing.province')"
        name="province"
        class="w-full"
        size="xl"
      >
        <USelectMenu
          v-model="provinceSel.current"
          :items="provinceSel.items.map((p) => p.name)"
          :disabled="districtsLoading"
          @update:model-value="onProvinceChange"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('messages.billing.city')"
        name="city"
        class="w-full"
        size="xl"
      >
        <USelectMenu
          v-model="citySel.current"
          :items="citySel.items.map((c) => c.name)"
          :disabled="districtsLoading"
          @update:model-value="onCityChange"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('messages.billing.district')"
        name="district"
        class="w-full"
        size="xl"
      >
        <USelectMenu
          v-model="districtSel.current"
          :items="districtSel.items.map((d) => d.name)"
          :disabled="districtsLoading"
          @update:model-value="onDistrictChange"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('messages.billing.street')"
        name="street"
        class="w-full"
        size="xl"
      >
        <USelectMenu
          v-model="streetSel.current"
          :items="streetSel.items.map((s) => s.name)"
          :disabled="districtsLoading"
          @update:model-value="onStreetChange"
          class="w-full"
        />
      </UFormField>
    </div>
    <p v-if="districtsLoading" class="col-span-2 -mt-2 text-xs text-neutral-400">
      {{ t("messages.billing.loadingDistricts") }}
    </p>

    <!-- 详细地址（联动生成，自动带上省市区街道） -->
    <UFormField
      :label="t('messages.billing.address1')"
      class="col-span-2"
      name="streetLine1"
      size="xl"
    >
      <UInput v-model="state.streetLine1" class="w-full" type="text" />
    </UFormField>

    <!-- 地址 2（必填） -->
    <UFormField
      :label="t('messages.billing.address2')"
      class="col-span-2"
      name="streetLine2"
      size="xl"
    >
      <UInput v-model="state.streetLine2" class="w-full" type="text" />
    </UFormField>

    <!-- 邮编 -->
    <UFormField
      :label="t('messages.billing.zip')"
      class="col-span-2 md:col-span-1"
      name="postalCode"
      size="xl"
    >
      <UInput v-model="state.postalCode" class="w-full" type="text" />
    </UFormField>

    <!-- 设为默认收货地址 -->
    <div class="col-span-2 flex items-center">
      <UFormField name="isDefault">
        <UToggle v-model="state.isDefault" />
      </UFormField>
      <span class="ml-2 text-sm text-neutral-600 dark:text-neutral-400">
        {{ t("messages.billing.isDefault") }}
      </span>
    </div>

    <!-- 邮箱（选填，放最后） -->
    <UFormField
      :label="t('messages.billing.email')"
      class="col-span-2"
      name="emailAddress"
      size="xl"
    >
      <UInput
        v-model="state.emailAddress"
        :disabled="isAuthenticated && isMounted"
        class="w-full"
        type="email"
      />
    </UFormField>
  </UForm>
</template>

<style lang="css" scoped></style>