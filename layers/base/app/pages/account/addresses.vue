<script setup lang="ts">
definePageMeta({ middleware: "account" });

import type { AddressRecord, AddressDraft } from "~~/types/address";

const { t } = useI18n();
const localePath = useLocalePath();
const toast = useToast();
const {
  addresses,
  defaultAddress,
  loading,
  fetchAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  recordToDraft,
} = useAddressBook();

const modalOpen = ref(false);
const editingId = ref<string | null>(null);
// 编辑时注入到弹窗的表单草稿；新增时为 null
const editingDraft = ref<AddressDraft | null>(null);

onMounted(async () => {
  await fetchAddresses();
});

function openCreate() {
  editingId.value = null;
  editingDraft.value = null;
  modalOpen.value = true;
}

function openEdit(record: AddressRecord) {
  editingId.value = record.id;
  editingDraft.value = recordToDraft(record);
  modalOpen.value = true;
}

async function handleSubmit(draft: AddressDraft) {
  const ok = editingId.value
    ? await updateAddress(editingId.value, draft)
    : await createAddress(draft);
  if (ok) {
    await fetchAddresses();
    modalOpen.value = false;
    toast.add({
      title: t("messages.account.saveSuccess"),
      color: "success",
    });
  } else {
    toast.add({ title: t("messages.error.generalMessage"), color: "error" });
  }
}

async function handleDelete(id: string) {
  const ok = await deleteAddress(id);
  if (ok) {
    await fetchAddresses();
    toast.add({ title: t("messages.account.deleteSuccess"), color: "success" });
  } else {
    toast.add({ title: t("messages.error.generalMessage"), color: "error" });
  }
}
</script>

<template>
  <BaseLoader v-if="loading && !addresses.length" width="sm:w-xs md:w-md" />
  <main v-else class="container">
    <header class="my-14 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">{{ t("messages.account.addresses") }}</h1>
        <ULink :to="localePath('/account')" class="mt-2 text-sm">
          {{ t("messages.account.backToAccount") }}
        </ULink>
      </div>
      <UButton
        icon="i-lucide-plus"
        :label="t('messages.account.addAddress')"
        color="primary"
        @click="openCreate"
      />
    </header>

    <AddressList
      :addresses="addresses"
      :default-id="defaultAddress?.id"
      @edit="openEdit"
      @delete="handleDelete"
    />

    <AddressFormModal
      v-model="modalOpen"
      :draft="editingDraft"
      @submit="handleSubmit"
    />
  </main>
</template>

<style lang="css" scoped></style>