<script setup lang="ts">
import type { GuestOrderLookupQuery } from "#gql/default";

definePageMeta({ title: 'lookup' });
const GqlInstance = useGql();
const form = reactive({ orderCode: '', phone: '' });
const state = ref<'idle' | 'loading' | 'found' | 'error'>('idle');
const overview = ref<GuestOrderLookupQuery["guestOrderLookup"] | null>(null);

async function submit() {
  if (!form.orderCode.trim() || !form.phone.trim()) return;
  state.value = 'loading';
  try {
    const res = await GqlInstance('GuestOrderLookup', {
      input: { orderCode: form.orderCode.trim(), phone: form.phone.trim() },
    });
    if (!res?.guestOrderLookup) throw new Error('not_found');
    overview.value = res.guestOrderLookup;
    state.value = 'found';
  } catch {
    state.value = 'error';
  }
}
</script>

<template>
  <main class="container mt-14">
    <h1 class="text-2xl font-semibold mb-6">{{ $t('messages.order.lookupTitle') }}</h1>
    <UAlert v-if="state === 'error'" color="error" :title="$t('messages.order.lookupNotFoundClass')" variant="outline" class="mb-4" />

    <form v-if="state !== 'found'" class="max-w-md space-y-3" @submit.prevent="submit">
      <UFormGroup :label="$t('messages.order.orderCodeLabel')">
        <UInput v-model="form.orderCode" :placeholder="$t('messages.order.orderCodePlaceholder')" :disabled="state==='loading'" />
      </UFormGroup>
      <UFormGroup :label="$t('messages.order.phoneLabel')">
        <UInput v-model="form.phone" type="tel" maxlength="11" :placeholder="$t('messages.order.phonePlaceholder')" :disabled="state==='loading'" />
      </UFormGroup>
      <UButton type="submit" :loading="state==='loading'" :label="$t('messages.order.lookupSubmit')" class="px-7" />
    </form>

    <section v-else class="max-w-md space-y-3">
      <template v-if="overview">
        <dl class="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 text-sm">
          <div><dt class="text-neutral-500">{{ $t('messages.shop.orderCode') }}</dt><dd class="font-mono">{{ overview.orderCode }}</dd></div>
          <div><dt class="text-neutral-500">{{ $t('messages.general.status') }}</dt><dd>{{ overview.state }}</dd></div>
          <div><dt class="text-neutral-500">{{ $t('messages.order.totalWithTax') }}</dt><dd>{{ overview.totalWithTax }} {{ overview.currencyCode }}</dd></div>
          <div v-if="overview.isPickup"><dt class="text-neutral-500">{{ $t('messages.shop.pickupCode') }}</dt><dd class="font-mono text-warning">{{ overview.pickupCode || '--' }}</dd></div>
        </dl>
        <div v-if="overview.isPickup" class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 text-sm space-y-1">
          <p class="font-medium">{{ overview.pickupLocation?.name }}</p>
          <p class="text-neutral-500">{{ overview.pickupLocation?.address }}</p>
          <p class="text-neutral-500">{{ overview.pickupLocation?.businessHours }}</p>
          <UBadge :color="overview.pickupClaimed ? 'success' : 'warning'" variant="outline">
            {{ overview.pickupClaimed ? $t('messages.shop.pickupClaimed') : $t('messages.shop.pickupPending') }}
          </UBadge>
        </div>
        <UButton variant="soft" @click="state='idle'; overview=null">{{ $t('messages.general.back') }}</UButton>
      </template>
    </section>
  </main>
</template>