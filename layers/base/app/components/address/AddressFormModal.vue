<script setup lang="ts">
import { object, pipe, string, nonEmpty, optional } from "valibot";
import type { InferOutput } from "valibot";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { AddressDraft } from "~~/types/address";

const isOpen = defineModel<boolean>({ default: false });
const emit = defineEmits<{
  (e: "submit", draft: AddressDraft): void;
}>();

// 编辑时父组件通过 draft prop 注入待编辑数据；新增时为 null（空态）。
// 不用子组件方法（openWith + defineExpose）注入，避免 async setup 组件
// 经 Nuxt auto-import + useTemplateRef 时暴露方法不可用的问题。
const props = defineProps<{
  draft?: AddressDraft | null;
}>();

const { t } = useI18n();
const formRef = useTemplateRef("formRef");
const submitting = ref(false);

// 复用已有的国家下拉数据源
const { data: countriesData } = await useAsyncGql("GetChannelCountries");
const countries = computed(
  () =>
    countriesData.value?.activeChannel?.defaultShippingZone?.members.map(
      (c) => ({ label: c.name, code: c.code }),
    ) ?? [],
);

// 默认空态表单（新增）；编辑时父组件通过 state 注入
const schema = object({
  fullName: pipe(string(), nonEmpty(t("messages.billing.recipient") + " required")),
  streetLine1: pipe(string(), nonEmpty(t("messages.billing.address1") + " required")),
  streetLine2: optional(string()),
  city: optional(string()),
  postalCode: optional(string()),
  countryCode: pipe(string(), nonEmpty("Country is required")),
  phoneNumber: optional(string()),
});

const state = ref<InferOutput<typeof schema>>({
  fullName: "",
  streetLine1: "",
  streetLine2: "",
  city: "",
  postalCode: "",
  countryCode: "",
  phoneNumber: "",
});

// draft 变化（打开编辑弹窗）时填充表单；新增时为 null 重置为空态
watch(
  () => props.draft,
  (draft) => {
    state.value = {
      fullName: draft?.fullName ?? "",
      streetLine1: draft?.streetLine1 ?? "",
      streetLine2: draft?.streetLine2 ?? "",
      city: draft?.city ?? "",
      postalCode: draft?.postalCode ?? "",
      countryCode: draft?.countryCode ?? "",
      phoneNumber: draft?.phoneNumber ?? "",
    };
  },
  { immediate: true },
);

// 提交后 submitting 置为 true，若父组件异步完成前弹窗被关闭（成功即关闭），
// 需在关闭时复位，否则该常驻组件实例的保存按钮会一直处于 loading/禁用态。
watch(isOpen, (open) => {
  if (!open) submitting.value = false;
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
        <UFormField :label="t('messages.billing.address1')" name="streetLine1">
          <UInput v-model="state.streetLine1" class="w-full" />
        </UFormField>
        <UFormField :label="t('messages.billing.address2')" name="streetLine2">
          <UInput v-model="state.streetLine2" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField :label="t('messages.billing.city')" name="city">
            <UInput v-model="state.city" class="w-full" />
          </UFormField>
          <UFormField :label="t('messages.billing.zip')" name="postalCode">
            <UInput v-model="state.postalCode" class="w-full" />
          </UFormField>
        </div>
        <UFormField :label="t('messages.billing.country')" name="countryCode">
          <USelectMenu
            v-model="state.countryCode"
            value-key="code"
            :items="countries"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('messages.account.phone')" name="phoneNumber">
          <UInput v-model="state.phoneNumber" class="w-full" />
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