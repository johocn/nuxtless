<script setup lang="ts">
import { object, pipe, string, nonEmpty, optional, boolean } from "valibot";
import type { InferOutput } from "valibot";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { AddressDraft } from "~~/types/address";
import type { RegionValue } from "~~/types/region";

const isOpen = defineModel<boolean>({ default: false });
const emit = defineEmits<{
  (e: "submit", draft: AddressDraft): void;
}>();

// 编辑时父组件通过 draft prop 注入待编辑数据；新增时为 null（空态）。
const props = defineProps<{
  draft?: AddressDraft | null;
}>();

const { t } = useI18n();
const formRef = useTemplateRef("formRef");
const submitting = ref(false);

// 复用已有国家下拉数据源
const { data: countriesData } = await useAsyncGql("GetChannelCountries");
const countries = computed(
  () =>
    countriesData.value?.activeChannel?.defaultShippingZone?.members.map(
      (c) => ({ label: c.name, code: c.code }),
    ) ?? [],
);

const schema = object({
  fullName: pipe(string(), nonEmpty(t("messages.account.contactName") + " required")),
  company: optional(string()),
  streetLine1: pipe(string(), nonEmpty(t("messages.billing.address1") + " required")),
  streetLine2: optional(string()),

  // 省/市经级联组件必填（联动手选，必然有值）
  province: pipe(string(), nonEmpty("Province is required")),
  city: pipe(string(), nonEmpty("City is required")),
  postalCode: pipe(string(), nonEmpty(t("messages.billing.requiredPostalCode"))),
  countryCode: pipe(string(), nonEmpty("Country is required")),
  phoneNumber: optional(string()),
  isDefault: optional(boolean()),
});

const state = ref<InferOutput<typeof schema>>({
  fullName: "",
  company: "",
  streetLine1: "",
  streetLine2: "",
  province: "",
  city: "",
  postalCode: "",
  countryCode: "",
  phoneNumber: "",
  isDefault: false,
});

// 级联组件的 v-model：双向映射到 state 的省市区
const region = computed<RegionValue>({
  get: () => ({
    province: state.value.province,
    city: state.value.city,
    district: "",
    street: "",
  }),
  set: (v) => {
    state.value.province = v.province;
    state.value.city = v.city;
    // 新增时自动生成“详细地址”前缀；编辑（已有 streetLine1）时不覆盖
    if (!state.value.streetLine1) {
      const addr = [v.province, v.city, v.district].filter(Boolean).join(" ");
      if (addr) state.value.streetLine1 = addr;
    }
  },
});

const regionSel = useTemplateRef("AmapRegionSelect");
const locationStore = useLocationStore();

// draft 变化（打开编辑弹窗）时填充表单；新增时为 null 重置为空态
watch(
  () => props.draft,
  (draft) => {
    // 重置省市区，由下面的 isOpen 监听按新增/编辑分别初始化级联
    state.value = {
      fullName: draft?.fullName ?? "",
      company: draft?.company ?? "",
      streetLine1: draft?.streetLine1 ?? "",
      streetLine2: draft?.streetLine2 ?? "",
      province: draft?.province ?? "",
      city: draft?.city ?? "",
      postalCode: draft?.postalCode ?? "",
      countryCode: draft?.countryCode ?? "",
      phoneNumber: draft?.phoneNumber ?? "",
      isDefault: !!draft?.isDefault,
    };
  },
  { immediate: true },
);

// 打开时初始化省市区级联：编辑→恢复已有选项；新增→按定位预选
watch(isOpen, async (open) => {
  if (!open) {
    submitting.value = false;
    return;
  }
  await nextTick();
  const amap = regionSel.value;
  if (!amap) return;
  if (props.draft) {
    await amap.applyValue(region.value);
  } else {
    await amap.preselectByLocation(
      locationStore.geo ?? null,
      locationStore.city ?? null,
    );
  }
});

async function onSubmit(event: FormSubmitEvent<InferOutput<typeof schema>>) {
  submitting.value = true;
  emit("submit", { ...event.data });
}
</script>

<template>
  <UModal v-model:open="isOpen" :title="t('messages.account.addAddress')">
    <template #body>
      <UForm
        ref="formRef"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField :label="t('messages.account.contactName')" name="fullName">
          <UInput v-model="state.fullName" class="w-full" />
        </UFormField>
        <UFormField :label="t('messages.billing.phoneNumber')" name="phoneNumber">
          <UInput v-model="state.phoneNumber" class="w-full" type="tel" />
        </UFormField>

        <!-- 国家 / 省 / 市 / 区：复用共享高德级联组件 -->
        <AmapRegionSelect
          ref="AmapRegionSelect"
          v-model:region="region"
          v-model:country-code="state.countryCode"
          :countries="countries"
        />

        <UFormField :label="t('messages.billing.address1')" name="streetLine1">
          <UInput v-model="state.streetLine1" class="w-full" />
        </UFormField>
        <UFormField :label="t('messages.billing.address2')" name="streetLine2">
          <UInput v-model="state.streetLine2" class="w-full" />
        </UFormField>
        <UFormField :label="t('messages.billing.company')" name="company">
          <UInput v-model="state.company" class="w-full" />
        </UFormField>
        <UFormField :label="t('messages.billing.zip')" name="postalCode">
          <UInput v-model="state.postalCode" class="w-full" />
        </UFormField>
        <UFormField
          name="isDefault"
          class="flex items-center justify-between rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
        >
          <span class="text-sm">{{ t("messages.account.defaultAddress") }}</span>
          <USwitch v-model="state.isDefault" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton variant="ghost" :label="t('messages.general.cancel')" @click="isOpen = false" />
        <UButton
          :label="t('messages.general.save')"
          color="primary"
          :loading="submitting"
          @click="formRef?.submit()"
        />
      </div>
    </template>
  </UModal>
</template>