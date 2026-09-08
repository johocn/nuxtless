<script setup lang="ts">
import { createBillingAddressSchema } from "~~/layers/base/validators/addressForm";
import type { AddressForm } from "~~/layers/base/validators/addressForm";

import type { FormSubmitEvent } from "@nuxt/ui";
import type { ActiveCustomerDetail } from "~~/types/customer";
import type { CheckoutState } from "~~/types/general";
import type { RegionValue } from "~~/types/region";
import { isActiveCustomerDetail } from "~~/types/guard";

const isSubmitted = defineModel<boolean>({ default: false });

const { t } = useI18n();
const props = defineProps<{ blank?: boolean }>();
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
// 国家默认值随首页语言推导（zh→CN，en→US；频道可用国家不含该值时回退到列表内默认）
function localeToCountry(locale: string): string | null {
  const l = (locale || "").toLowerCase();
  if (l.startsWith("zh")) return "CN";
  if (l.startsWith("en")) return "US";
  return null;
}
const { locale } = useI18n();
const countryDefault = computed(() => {
  const desired = localeToCountry(locale.value) ?? "CN";
  if (countries.value.some((c) => c.code === desired)) return desired;
  if (countries.value.some((c) => c.code === "CN")) return "CN";
  return countries.value[0]?.code ?? "";
});
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
// 国家名按 code 映射为中文（China→中国），未映射到则回退后端返回名，保证中国区显示"中国"
const CN_COUNTRY_NAMES: Record<string, string> = {
  CN: "中国",
  US: "美国",
  GB: "英国",
  JP: "日本",
  KR: "韩国",
  DE: "德国",
  FR: "法国",
  AU: "澳大利亚",
  CA: "加拿大",
  SG: "新加坡",
  HK: "中国香港",
  MO: "中国澳门",
  TW: "中国台湾",
};
const countries = computed(
  () =>
    countriesData.value?.activeChannel?.defaultShippingZone?.members.map(
      (c) => ({ label: CN_COUNTRY_NAMES[c.code] ?? c.name, code: c.code }),
    ) ?? [],
);

// ===== 省市区街道级联走共享组件 AmapRegionSelect，避免维护第二份 =====
const regionRef = useTemplateRef("AmapRegionSelect");
const region = computed<RegionValue>({
  get: () => ({
    province: state.province ?? "",
    city: state.city ?? "",
    district: state.district ?? "",
    street: state.street ?? "",
  }),
  set: (v) => {
    // 仅在选中项非空时才覆盖 state，避免地址簿回填后因下拉未能匹配而清空已存省市区
    if (v.province) state.province = v.province;
    if (v.city) state.city = v.city;
    if (v.district) state.district = v.district;
    if (v.street) state.street = v.street;
    // 街道并入“详细地址”文本框人工填写，切换省市区时不得覆盖用户已输入的门牌号
    if (!state.streetLine1) {
      const addr = [v.province, v.city, v.district, v.street].filter(Boolean).join(" ");
      if (addr) state.streetLine1 = addr;
    }
  },
});

function fullAddress(): string {
  return [region.value.province, region.value.city, region.value.district, region.value.street]
    .filter(Boolean)
    .join(" ");
}

onMounted(async () => {
  isMounted.value = true;

  const { fetchAddresses } = useAddressBook();
  // 新增模式（blank）：不预填地址簿，走空白 + 高德/首页城市兜底
  const list = isAuthenticated.value && !props.blank ? await fetchAddresses() : [];

  const amap = regionRef.value;
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
      state.countryCode = first.countryCode ?? countryDefault.value;
      // 从省市区文本回填四级下拉选中项（含逐级加载子级选项）
      await amap?.applyValue(region.value);
    }
  } else {
    state.fullName = activeCustomer.value?.firstName ?? "";
    state.countryCode = state.countryCode || countryDefault.value;
    // 无地址簿：仍先加载省列表，再按定位城市默认省/市
    let geo = locationStore.geo;
    if (!geo && locationStore.coords) {
      geo = await useGeoLocation().reverseGeocode(
        locationStore.coords.lat,
        locationStore.coords.lng,
      );
    }
    await amap?.preselectByLocation(geo, locationStore.city);
    if (!state.streetLine1 && geo?.formattedAddress) {
      state.streetLine1 = geo.formattedAddress;
    }
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
    company: state.company,
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
      company: state.company,
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

    <!-- 国家 / 省 / 市 / 区 显示在一行（4格，含手机 390px 也强制一行） -->
    <AmapRegionSelect
      ref="AmapRegionSelect"
      v-model:region="region"
      v-model:country-code="state.countryCode"
      :countries="countries"
      :disabled="!isMounted"
    />

    <!-- 详细地址（联动生成，自动带上省市区街道） -->
    <UFormField
      :label="t('messages.billing.address1')"
      class="col-span-2"
      name="streetLine1"
      size="xl"
    >
      <UInput
        v-model="state.streetLine1"
        class="w-full"
        type="text"
        :placeholder="t('messages.billing.address1Placeholder')"
      />
    </UFormField>

    <!-- 地址 2（选填） -->
    <UFormField
      :label="t('messages.billing.address2')"
      class="col-span-2"
      name="streetLine2"
      size="xl"
    >
      <UInput v-model="state.streetLine2" class="w-full" type="text" />
    </UFormField>

    <!-- 公司（选填，公司/单位名称） -->
    <UFormField
      :label="t('messages.billing.company')"
      class="col-span-2"
      name="company"
      size="xl"
    >
      <UInput v-model="state.company" class="w-full" type="text" />
    </UFormField>

    <!-- 邮编（物流必填） -->
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