# 订单中心 + 地址簿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 nshop 订单/地址体验从「国外模板默认风」升级为国内电商闭环——补齐地址簿管理（增/删/改/默认/结算回填），并把订单中心做成可状态筛选、可查看详情、可取消、可再次购买的完整体验，同时以「消费既有后端 + 预留接口」方式纳入中国本地化的配送/支付/核销展示。

**Architecture:** 纯前端改造（后端 Vendure 零改动）——地址 CRUD 走 Vendure 原生 `createCustomerAddress/updateCustomerAddress/deleteCustomerAddress`；取消订单用原生 `transitionOrderToState('Cancelled')`；再次购买用原生 `addItemToOrder` 批量。新建 `layers/base/app/components/address/` 与 `components/order/` 组件目录，新建通用订单详情页 `account/orders/[code].vue`，并用 `components/order/*` 回改下单确认页复用；配送方式（快递/自提点/门店）由 `DeliveryInfo` 组件按 `deliveryType` 分流展示，物流轨迹/自提核销/卡密以类型字段与 slot 占位预留。

**Tech Stack:** Nuxt 4 (vue-tsc/Tailwind v4/NuxtUI v4)、nuxt-graphql-client 0.2.46（`useAsyncGql`/`GqlXxx` 自动生成）、VueUse、Valibot。后端 Vendure 3.6.4（原生订单状态机 + cjk-plugin 自提/COD + logistics-plugin `deliveryType`）。

---

## 文件总览（File Map）

**修改：**
- `layers/base/gql/queries/customer.gql` — 增补地址 CRUD 3 个 mutation
- `layers/base/gql/queries/order.gql` — `GetOrderHistory` 增补 `customFields(deliveryType,pickupClaimed,selectedPickupLocationId)`（可选枚字段）
- `layers/base/app/pages/account/orders.vue` — 改造成状态 Tab + 操作列
- `layers/base/app/pages/account/index.vue` — 首地址卡片改链接 + 增加「收货地址」入口
- `layers/base/app/components/account/AccountMenu.vue` — 增加「收货地址」菜单项
- `layers/base/app/pages/checkout/confirmation/[code].client.vue` — 复用 order 组件（商品/金额/地址替换为 OrderItems/OrderTotals/OrderAddress）
- `layers/base/i18n/locales/*.ts` — 新增 `messages.order` 与 `messages.account.address*` keys

**新增：**
- `types/address.ts` — 地址记录归一化类型
- `layers/base/app/composables/useAddressBook.ts` — 地址 CRUD + 默认 + 结算回填
- `layers/base/app/composables/useOrderActions.ts` — 取消/再次购买/复制链接
- `layers/base/app/utils/order-state.ts` — 状态→中文/徽标/Tab/进度 映射
- `layers/base/app/components/address/AddressList.vue`
- `layers/base/app/components/address/AddressFormModal.vue`
- `layers/base/app/components/address/AddressPicker.vue`
- `layers/base/app/components/order/OrderStateBadge.vue`
- `layers/base/app/components/order/OrderItems.vue`
- `layers/base/app/components/order/OrderTotals.vue`
- `layers/base/app/components/order/OrderAddress.vue`
- `layers/base/app/components/order/OrderProgress.vue`
- `layers/base/app/components/order/DeliveryInfo.vue`
- `layers/base/app/components/order/OrderActions.vue`
- `layers/base/app/pages/account/addresses.vue`
- `layers/base/app/pages/account/orders/[code].vue`

---

### Task 0: 刷新 GraphQL schema（前置依赖，含地址 mutations）

本地 `graphql.schema.json` 需包含 `createCustomerAddress/updateCustomerAddress/deleteCustomerAddress` 与 `transitionOrderToState` 类型，否则 codegen 无法为这些查询生成 TS。

**Files:**
- Modify: `d:\zhao\nshop\.env`（`GQL_HOST=https://e.joho.cn/shop-api`，已正确则跳过）
- Modify: `d:\zhao\nshop\graphql.schema.json`（将被下载覆盖）

- [ ] **Step 1: 重新生成 schema 与类型**

Run: `pnpm nuxi prepare`
Expected: `.nuxt/graphql-client/default/` 产物更新，包含 `CreateCustomerAddressMutation` / `UpdateCustomerAddressMutation` / `DeleteCustomerAddressMutation` 类型；无导出错误。

> nuxt-graphql-client 在 `nuxt prepare` 时按 `layers/base/nuxt.config.ts#graphql-client` 配置从 `GQL_HOST` 拉 schema 并 codegen。若网络/证书失败，`curl -s https://e.joho.cn/shop-api -H 'content-type: application/json' -d '{"query":"{ __schema { queryType { name } } }"}'` 人工拉下覆盖 `graphql.schema.json` 后重跑。

- [ ] **Step 2: 验证地址 mutation 类型已生成**

Grep: `createCustomerAddress` in `d:\zhao\nshop\graphql.schema.json`
Expected: 存在该字段（Vendure Shop API 自带顾客地址 CRUD）。

- [ ] **Step 3: Commit**

```bash
git add .env graphql.schema.json .nuxt 2>/dev/null
git commit -m "chore(gql): 刷新 graphql schema 纳入地址 CRUD 类型"
```

---

### Task 1: 地址 CRUD GQL mutations + 类型

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\customer.gql`
- Create: `d:\zhao\nshop\types\address.ts`

- [ ] **Step 1: 在 `customer.gql` 追加地址 mutation**

Append to `d:\zhao\nshop\layers\base\gql\queries\customer.gql`:

```graphql
mutation CreateCustomerAddress($input: CreateAddressInput!) {
  createCustomerAddress(input: $input) {
    __typename
    ... on Address {
      id
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}

mutation UpdateCustomerAddress($input: UpdateAddressInput!) {
  updateCustomerAddress(input: $input) {
    __typename
    ... on Address {
      id
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}

mutation DeleteCustomerAddress($id: ID!) {
  deleteCustomerAddress(id: $id) {
    __typename
    ... on Success {
      success
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
```

> 字段以 `graphql.schema.json` 为准。若 schema 中无 `__typename` 顶层要求，去掉映射字段前的 `__typename` 亦可通过。

- [ ] **Step 2: codegen 校验**

Run: `pnpm nuxi prepare`
Expected: `GqlCreateCustomerAddress` / `GqlUpdateCustomerAddress` / `GqlDeleteCustomerAddress` 客户端函数生成，无语法错误。

- [ ] **Step 3: 新建 `types/address.ts`**

Create `d:\zhao\nshop\types\address.ts`:

```ts
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
```

> 说明：`GetCustomerAddresses` 返回的地址 `country` 是 `{ code, name }`。这里用扁平 `AddressRecord`（`countryCode`/`countryName`），composable 负责服务端地址 → 扁平记录 的双向映射。`AddressDraft` 为表单提交形状。

- [ ] **Step 4: Commit**

```bash
git add layers/base/gql/queries/customer.gql types/address.ts
git commit -m "feat(gql): 地址簿 CRUD mutations + AddressRecord 类型"
```

---

### Task 2: useAddressBook composable

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\composables\useAddressBook.ts`

- [ ] **Step 1: 实现 composable**

Create `d:\zhao\nshop\layers\base\app\composables\useAddressBook.ts`:

```ts
import type { AddressRecord, AddressDraft } from "~~/types/address";

function toRecord(a: any): AddressRecord {
  return {
    id: a.id,
    fullName: a.fullName ?? null,
    streetLine1: a.streetLine1 ?? null,
    streetLine2: a.streetLine2 ?? null,
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

  function toCreateInput(d: AddressDraft) {
    return {
      fullName: d.fullName,
      streetLine1: d.streetLine1,
      streetLine2: d.streetLine2,
      city: d.city,
      postalCode: d.postalCode,
      countryCode: d.countryCode,
      phoneNumber: d.phoneNumber,
    };
  }

  function toUpdateInput(id: string, d: AddressDraft) {
    return { id, ...toCreateInput(d) };
  }

  async function createAddress(d: AddressDraft): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const { createCustomerAddress: res } = await GqlCreateCustomerAddress({
        input: toCreateInput(d),
      });
      if (res?.__typename === "Address") return true;
      error.value = (res as any)?.message ?? "failed to create address";
      return false;
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
      const { updateCustomerAddress: res } = await GqlUpdateCustomerAddress({
        input: toUpdateInput(id, d),
      });
      if (res?.__typename === "Address") return true;
      error.value = (res as any)?.message ?? "failed to update address";
      return false;
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
      if (res?.__typename === "Success" && res.success) return true;
      error.value = (res as any)?.message ?? "failed to delete address";
      return false;
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
```

> 依赖 Task 1 生成的 `GqlCreateCustomerAddress / GqlUpdateCustomerAddress / GqlDeleteCustomerAddress / GqlGetCustomerAddresses`。若文件名以 `use` 开头在同目录 auto-import 冲突，仅在本文件内通过 `#imports` 的 `useAsyncGql` 不可用于 mutation，故统一用客户端 `GqlXxx`。

- [ ] **Step 2: 类型校验**

Run: `pnpm typecheck`
Expected: 无新增类型错误（`Address` 相关 union 已在 Task 0 schema 刷新后可用）。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/composables/useAddressBook.ts
git commit -m "feat(address): useAddressBook composable（CRUD + 默认首条 + 回填）"
```

---

### Task 3: 地址簿组件（列表 / 编辑弹窗 / 结算选择器）

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\components\address\AddressList.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\address\AddressFormModal.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\address\AddressPicker.vue`

- [ ] **Step 1: `AddressList.vue`**

Create `d:\zhao\nshop\layers\base\app\components\address\AddressList.vue`:

```vue
<script setup lang="ts">
import type { AddressRecord } from "~~/types/address";

const props = defineProps<{
  addresses: AddressRecord[];
  defaultId?: string | null;
  loading?: boolean;
}>();
const emit = defineEmits<{
  (e: "edit", record: AddressRecord): void;
  (e: "delete", id: string): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="!loading && !addresses.length"
    class="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700"
  >
    {{ t("messages.account.noAddresses") }}
  </div>
  <div
    v-else
    class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
  >
    <USkeleton
      v-for="i in 3"
      v-if="loading"
      :key="i"
      class="h-36 rounded-lg"
    />
    <div
      v-for="record in addresses"
      :key="record.id"
      class="relative rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <UBadge
        v-if="record.id === defaultId"
        color="brand"
        variant="outline"
        class="mb-2"
      >
        {{ t("messages.account.defaultAddress") }}
      </UBadge>
      <div class="text-sm font-medium">{{ record.fullName }}</div>
      <address class="mt-1 not-italic text-sm text-neutral-500">
        <div>{{ record.streetLine1 }}</div>
        <div v-if="record.streetLine2">{{ record.streetLine2 }}</div>
        <div>{{ record.city }} {{ record.postalCode }}</div>
        <div>{{ record.countryName }}</div>
        <div v-if="record.phoneNumber">{{ record.phoneNumber }}</div>
      </address>
      <div class="mt-3 flex gap-2">
        <UButton
          size="sm"
          variant="soft"
          icon="i-lucide-pencil"
          @click="emit('edit', record)"
        >
          {{ t("messages.account.edit") }}
        </UButton>
        <UButton
          size="sm"
          color="error"
          variant="ghost"
          icon="i-lucide-trash"
          @click="emit('delete', record.id)"
        >
          {{ t("messages.account.delete") }}
        </UButton>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: `AddressFormModal.vue`**

Create `d:\zhao\nshop\layers\base\app\components\address\AddressFormModal.vue`:

```vue
<script setup lang="ts">
import { object, pipe, string, nonEmpty, optional } from "valibot";
import type { InferOutput } from "valibot";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { AddressDraft } from "~~/types/address";

const isOpen = defineModel<boolean>({ default: false });
const emit = defineEmits<{
  (e: "submit", draft: AddressDraft): void;
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
  fullName: pipe(string(), nonEmpty(t("messages.billing.firstName") + " required")),
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

function openWith(draft?: AddressDraft | null) {
  state.value = {
    fullName: draft?.fullName ?? "",
    streetLine1: draft?.streetLine1 ?? "",
    streetLine2: draft?.streetLine2 ?? "",
    city: draft?.city ?? "",
    postalCode: draft?.postalCode ?? "",
    countryCode: draft?.countryCode ?? "",
    phoneNumber: draft?.phoneNumber ?? "",
  };
}

async function onSubmit(event: FormSubmitEvent<InferOutput<typeof schema>>) {
  submitting.value = true;
  emit("submit", { ...event.data });
}

defineExpose({ openWith });
</script>

<template>
  <UModal v-model="isOpen" :title="t('messages.account.addAddress')">
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
          color="brand"
          :loading="submitting"
          @click="formRef?.submit()"
        />
      </div>
    </template>
  </UModal>
</template>
```

> 父组件用 `addressModalRef.value?.openWith(recordToDraft(record))` 编辑初始化。新增时直接打开（不调 `openWith`）。提交通过 `@submit` 事件上抛，由父组件调用 `useAddressBook` 的 create/update。

- [ ] **Step 3: `AddressPicker.vue`（结算页地址簿选择/回填）**

Create `d:\zhao\nshop\layers\base\app\components\address\AddressPicker.vue`:

```vue
<script setup lang="ts">
import type { AddressRecord } from "~~/types/address";

const props = defineProps<{
  addresses: AddressRecord[];
  defaultId?: string | null;
}>();
const emit = defineEmits<{
  (e: "select", record: AddressRecord): void;
}>();

const { t } = useI18n();
</script>

<template>
  <USelectMenu
    :items="[...addresses]"
    value-key="id"
    value-attribute=""
    option-attribute="fullName"
    :placeholder="t('messages.account.selectAddress')"
    class="w-full"
    @update:model-value="emit('select', $event as AddressRecord)"
  >
    <template #label="{ item }">
      <span class="line-clamp-1">
        {{ (item as AddressRecord).fullName }} ·
        {{ (item as AddressRecord).streetLine1 }}
        <UBadge v-if="props.defaultId === (item as AddressRecord).id" color="brand" size="sm">
          {{ t("messages.account.defaultAddress") }}
        </UBadge>
      </span>
    </template>
  </USelectMenu>
</template>
```

> 「结算页地址簿选择/回填」：本组件提供选择能力；实际把选中记录写入 `setOrderShippingAddress` 的回填逻辑在 Task 5 的结算页接入中完成（复用 `useOrderStore.setOrderShippingAddress`）。

- [ ] **Step 4: 语法与类型校验**

Run: `pnpm typecheck && pnpm dev`
Expected: 无类型错误；三个组件可被 auto-import（`<AddressList/>`/`<AddressFormModal/>`/`<AddressPicker/>`）。

- [ ] **Step 5: Commit**

```bash
git add layers/base/app/components/address/
git commit -m "feat(address): AddressList / AddressFormModal / AddressPicker 组件"
```

---

### Task 4: 地址簿管理页 + 账户入口集成

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\pages\account\addresses.vue`
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\index.vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\account\AccountMenu.vue`

- [ ] **Step 1: 地址簿管理页 `addresses.vue`**

Create `d:\zhao\nshop\layers\base\app\pages\account\addresses.vue`:

```vue
<script setup lang="ts">
const { t } = useI18n();
const localePath = useLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());
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

const modalRef = useTemplateRef("modalRef");
const modalOpen = ref(false);
const editingId = ref<string | null>(null);

definePageMeta({ layout: "account" });

onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo(localePath("/account/login"), { replace: true });
    return;
  }
  await fetchAddresses();
});

async function openCreate() {
  editingId.value = null;
  modalOpen.value = true;
}

async function openEdit(record: any) {
  editingId.value = record.id;
  modalRef.value?.openWith(recordToDraft(record));
  modalOpen.value = true;
}

async function handleSubmit(draft: any) {
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
        color="brand"
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
      ref="modalRef"
      v-model="modalOpen"
      @submit="handleSubmit"
    />
  </main>
</template>

<style lang="css" scoped></style>
```

> `definePageMeta({ layout: "account" })`：若项目 `app/layouts` 或 base 无 `account` layout 则删除该行使用默认 layout（以实际项目 layout 为准；查 `layers/base/app/layouts` 与 `app/layouts` 决定是否保留）。

- [ ] **Step 2: 账户主页 `index.vue` 增加地址入口**

Modify `d:\zhao\nshop\layers\base\app\pages\account\index.vue` 的「account-actions」section，追加地址簿按钮：

```vue
    <section aria-labelledby="account-actions" class="mb-14">
      <h2 id="account-actions" class="sr-only">Account Actions</h2>
      <div class="flex flex-wrap gap-3">
        <UButton :to="localePath('/account/orders')" class="px-7">
          {{ t("messages.account.orders") }}
        </UButton>
        <UButton
          :to="localePath('/account/addresses')"
          variant="soft"
          class="px-7"
        >
          {{ t("messages.account.addresses") }}
        </UButton>
      </div>
    </section>
```

- [ ] **Step 3: 账户菜单 `AccountMenu.vue` 增加地址项**

Modify `d:\zhao\nshop\layers\base\app\components\account\AccountMenu.vue` 的 `userItems` 第二个数组（含 orders 项）后追加：

```ts
    {
      label: t("messages.account.addresses"),
      icon: "i-lucide-map-pin",
      to: localePath("/account/addresses"),
      class: "items-center",
    },
```

- [ ] **Step 4: 校验**

Run: `pnpm dev`
Expected: 登录后 `/account` 出现「收货地址」按钮；`/account/addresses` 页面可选进入，新增/编辑/删除地址生效并刷新列表（后端修改反馈可见）。

- [ ] **Step 5: Commit**

```bash
git add layers/base/app/pages/account/addresses.vue layers/base/app/pages/account/index.vue layers/base/app/components/account/AccountMenu.vue
git commit -m "feat(address): 地址簿管理页 + 账户入口/菜单集成"
```

---

### Task 5: 结算页地址簿选择/回填

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\checkout\index.vue`（接入 `AddressPicker`）

> 结算地址逻辑集中在 `layers/base/app/pages/checkout/index.vue` 与 `components/checkout/AddressForm.vue`。当前 `AddressForm.vue` 的 `onMounted` 已自动回填 `activeCustomer.addresses[0]`。本任务在该页面增加「从地址簿选择」控件：选中地址 → 调用 `useOrderStore.setOrderShippingAddress` 回填表单。

- [ ] **Step 1: 在结算页接入 AddressPicker（确认当前结算页结构后接线）**

先在 `d:\zhao\nshop\layers\base\app\pages\checkout\index.vue` 的 `<script setup>` 增加：

```ts
const { addresses, fetchAddresses } = useAddressBook();
const activeId = ref<string | null>(null);

onMounted(async () => {
  if (isAuthenticated.value) await fetchAddresses();
});

function applyAddress(record: AddressRecord) {
  activeId.value = record.id;
  orderStore.setOrderShippingAddress({
    fullName: record.fullName ?? undefined,
    streetLine1: record.streetLine1 ?? "",
    streetLine2: record.streetLine2 ?? undefined,
    city: record.city ?? undefined,
    postalCode: record.postalCode ?? undefined,
    countryCode: record.countryCode ?? "",
    phoneNumber: record.phoneNumber ?? undefined,
  });
}
```

在 `<template>` 的地址表单区块上方插入（仅登录态显示）：

```vue
<AddressPicker
  v-if="isAuthenticated && addresses.length"
  :addresses="addresses"
  :default-id="activeId"
  @select="applyAddress"
  class="mb-4"
/>
```

> **注意**：`checkout/index.vue` 使用 `useState<CheckoutState>("checkoutState")` 驱动三表提交。若页面结构与本计划假设不符，以实际文件为准：核心目标是在结算地址区提供一个「从地址簿选地址并回填 `setOrderShippingAddress`」的入口。若该页面已在提交时统一调用 `setOrderShippingAddress`，回填仅需填充 `checkoutState.value.addressForm` 的对应字段（`streetLine1/city/postalCode/countryCode`）即可，不必重复提交。

- [ ] **Step 2: 校验**

Run: `pnpm dev`
Expected: 登录用户在结算页看到地址簿选择器，选中后表单字段（街道/城市/邮编/国家）被回填。

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/pages/checkout/index.vue
git commit -m "feat(checkout): 结算页地址簿选择/回填"
```

---

### Task 6: 订单状态映射工具 + useOrderActions

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\utils\order-state.ts`
- Create: `d:\zhao\nshop\layers\base\app\composables\useOrderActions.ts`

- [ ] **Step 1: 状态映射工具 `order-state.ts`**

Create `d:\zhao\nshop\layers\base\app\utils\order-state.ts`:

```ts
export type OrderTabKey =
  | "ALL"
  | "PAYMENT_PENDING"
  | "TO_SHIP"
  | "TO_RECEIVE"
  | "COMPLETED"
  | "CANCELLED";

export const ORDER_TABS: { key: OrderTabKey; labelKey: string }[] = [
  { key: "ALL", labelKey: "order.tabAll" },
  { key: "PAYMENT_PENDING", labelKey: "order.tabPaymentPending" },
  { key: "TO_SHIP", labelKey: "order.tabToShip" },
  { key: "TO_RECEIVE", labelKey: "order.tabToReceive" },
  { key: "COMPLETED", labelKey: "order.tabCompleted" },
  { key: "CANCELLED", labelKey: "order.tabCancelled" },
];

const PAYMENT_PENDING = new Set(["AddingItems", "ArrangingPayment"]);
const TO_SHIP = new Set([
  "PaymentAuthorized",
  "PaymentSettled",
  "ArrangingAdditionalPayment",
]);
const TO_RECEIVE = new Set(["PartiallyShipped", "Shipped"]);
const COMPLETED = new Set(["PartiallyDelivered", "Delivered"]);
const CANCELLED = new Set(["Cancelled"]);

export function tabOfState(state: string): OrderTabKey {
  if (PAYMENT_PENDING.has(state)) return "PAYMENT_PENDING";
  if (TO_SHIP.has(state)) return "TO_SHIP";
  if (TO_RECEIVE.has(state)) return "TO_RECEIVE";
  if (COMPLETED.has(state)) return "COMPLETED";
  if (CANCELLED.has(state)) return "CANCELLED";
  return "ALL";
}

export interface StateBadge {
  labelKey: string;
  color: "neutral" | "warning" | "info" | "success" | "error";
}

export function stateBadge(state: string): StateBadge {
  switch (state) {
    case "AddingItems":
    case "ArrangingPayment":
      return { labelKey: "order.statePaymentPending", color: "warning" };
    case "PaymentAuthorized":
    case "PaymentSettled":
      return { labelKey: "order.statePaid", color: "info" };
    case "PartiallyShipped":
    case "Shipped":
      return { labelKey: "order.stateShipped", color: "info" };
    case "PartiallyDelivered":
    case "Delivered":
      return { labelKey: "order.stateDelivered", color: "success" };
    case "Cancelled":
      return { labelKey: "order.stateCancelled", color: "error" };
    default:
      return { labelKey: "order.stateProcessing", color: "neutral" };
  }
}

// 订单进度条四步：下单 → 支付 → 发货 → 完成
export const ORDER_PROGRESS_STEPS = [
  "order.progressPlaced",
  "order.progressPaid",
  "order.progressShipped",
  "order.progressCompleted",
];

export function progressIndex(state: string): number {
  if (CANCELLED.has(state)) return -1;
  if (TO_SHIP.has(state)) return 1;
  if (TO_RECEIVE.has(state)) return 2;
  if (COMPLETED.has(state)) return 3;
  return 0;
}
```

- [ ] **Step 2: `useOrderActions.ts`**

Create `d:\zhao\nshop\layers\base\app\composables\useOrderActions.ts`:

```ts
export function useOrderActions() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const orderStore = useOrderStore();
  const toast = useToast();
  const { t, locale } = useI18n();
  const localePath = useLocalePath();
  const { copy } = useClipboard();
  const { i18NBaseUrl } = useRuntimeConfig().public;

  const canCancel = (state: string) =>
    state === "AddingItems" || state === "ArrangingPayment";

  async function cancelOrder(state: string): Promise<boolean> {
    if (!canCancel(state)) {
      toast.add({ title: t("order.cancelNotAllowed"), color: "warning" });
      return false;
    }
    loading.value = true;
    error.value = null;
    try {
      const result = (await GqlTransitionToState({
        state: "Cancelled",
      })).transitionOrderToState;
      const ok =
        result?.__typename === "Order" ||
        result?.__typename === "OrderDetail";
      if (ok) {
        toast.add({ title: t("order.cancelSuccess"), color: "success" });
      } else {
        error.value = (result as any)?.message ?? null;
        toast.add({ title: error.value ?? t("order.cancelFailed"), color: "error" });
      }
      return ok;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "cancel failed";
      toast.add({ title: t("order.cancelFailed"), color: "error" });
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function reorder(lines: { productVariantId: string; quantity: number }[]) {
    loading.value = true;
    error.value = null;
    let ok = 0;
    try {
      for (const line of lines) {
        const { addItemToOrder: res } = await GqlAddItemToOrder({
          variantId: line.productVariantId,
          quantity: line.quantity,
        });
        if (res && res.__typename !== undefined && res.__typename.startsWith("Order")) ok += 1;
      }
      // 至少成功一件即视为成功
      if (ok > 0) {
        toast.add({ title: t("order.reorderSuccess"), color: "success" });
      }
      return ok > 0;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "reorder failed";
      toast.add({ title: t("order.reorderFailed"), color: "error" });
      return false;
    } finally {
      loading.value = false;
    }
  }

  function copyOrderLink(code: string) {
    const path = localePath(`/order/${code}`);
    copy(`${i18NBaseUrl}${path}`);
    toast.add({
      title: t("messages.general.getLinkSuccess"),
      color: "success",
    });
  }

  return { loading, error, canCancel, cancelOrder, reorder, copyOrderLink };
}
```

> `reorder` 依赖 `GqlAddItemToOrder`（`AddItemToOrder` mutation 返回带 `__typename`，`OrderBase` 的 typename 为 `Order`）。成功判定用 `__typename.startsWith("Order")`，与现有 `AddItemToOrder` gql 的 `__typename` 输出一致。

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/utils/order-state.ts layers/base/app/composables/useOrderActions.ts
git commit -m "feat(order): 状态映射工具 + useOrderActions（取消/再次购买/复制链接）"
```

---

### Task 7: 订单展示组件（components/order/*）

**Files:**
- Create: `layers/base/app/components/order/OrderStateBadge.vue`
- Create: `layers/base/app/components/order/OrderItems.vue`
- Create: `layers/base/app/components/order/OrderTotals.vue`
- Create: `layers/base/app/components/order/OrderAddress.vue`
- Create: `layers/base/app/components/order/OrderProgress.vue`
- Create: `layers/base/app/components/order/OrderActions.vue`
- Create: `layers/base/app/components/order/DeliveryInfo.vue`

- [ ] **Step 1: `OrderStateBadge.vue`**

Create `d:\zhao\nshop\layers\base\app\components\order\OrderStateBadge.vue`:

```vue
<script setup lang="ts">
import { stateBadge } from "~/utils/order-state";

const props = defineProps<{ state: string }>();
const { t } = useI18n();
const badge = computed(() => stateBadge(props.state));
</script>

<template>
  <UBadge :color="badge.color" variant="outline">
    {{ t(badge.labelKey) }}
  </UBadge>
</template>
```

- [ ] **Step 2: `OrderItems.vue`**

Create `d:\zhao\nshop\layers\base\app\components\order\OrderItems.vue`:

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "~~/.nuxt/gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t } = useI18n();
const { locale } = useI18n();

const fmt = (amount: number) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: props.order.currencyCode || "CNY",
  }).format(amount / 100);
</script>

<template>
  <ul class="divide-y">
    <li
      v-for="line in order.lines"
      :key="line.id"
      class="flex items-center gap-4 py-4"
    >
      <NuxtImg
        :src="line.featuredAsset?.preview"
        :alt="line.productVariant?.name ?? ''"
        class="h-20 w-20 rounded object-cover"
        format="webp"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">{{ line.productVariant?.name }}</p>
        <p class="text-sm text-neutral-500">
          {{ t("messages.shop.price") }}: {{ fmt(line.unitPriceWithTax) }}
        </p>
      </div>
      <div class="text-right">
        <p class="text-sm">×{{ line.quantity }}</p>
        <p class="font-semibold">{{ fmt(line.linePriceWithTax) }}</p>
      </div>
    </li>
  </ul>
</template>
```

- [ ] **Step 3: `OrderTotals.vue`**

Create `d:\zhao\nshop\layers\base\app\components\order\OrderTotals.vue`:

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "~~/.nuxt/gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t } = useI18n();
const { locale } = useI18n();
const fmt = (amount: number) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: props.order.currencyCode || "CNY",
  }).format(amount / 100);
</script>

<template>
  <dl class="space-y-2 text-sm">
    <div class="flex justify-between">
      <dt>{{ t("messages.shop.subtotal") }}</dt>
      <dd>{{ fmt(order.subTotal) }}</dd>
    </div>
    <div class="flex justify-between">
      <dt>{{ t("messages.general.shipping") }}</dt>
      <dd>{{ fmt(order.shippingWithTax) }}</dd>
    </div>
    <template v-for="d in order.discounts" :key="d.description">
      <div class="flex justify-between text-error">
        <dt>{{ d.description }}</dt>
        <dd>-{{ fmt(d.amountWithTax) }}</dd>
      </div>
    </template>
    <div class="flex justify-between border-t pt-2 text-base font-bold">
      <dt>{{ t("messages.shop.total") }}</dt>
      <dd>{{ fmt(order.totalWithTax) }}</dd>
    </div>
  </dl>
</template>
```

- [ ] **Step 4: `OrderAddress.vue`**

Create `d:\zhao\nshop\layers\base\app\components\order\OrderAddress.vue`:

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "~~/.nuxt/gql/default";
import type { OrderAddress } from "~~/.nuxt/gql/default";

const props = defineProps<{
  address?: OrderAddress | null;
}>();
const { t } = useI18n();
</script>

<template>
  <address v-if="address" class="not-italic">
    <div class="font-medium">
      {{ t("messages.general.shippingAddress") }}
    </div>
    <div class="mt-1 text-neutral-500">
      <div>{{ address.fullName }}</div>
      <div>{{ address.streetLine1 }}</div>
      <div v-if="address.streetLine2">{{ address.streetLine2 }}</div>
      <div>{{ address.city }} {{ address.postalCode }}</div>
      <div>{{ address.country }}</div>
    </div>
  </address>
  <p v-else class="text-neutral-500">{{ t("order.noAddress") }}</p>
</template>
```

> 类型导入若 `OrderAddress` 未直接导出，改用 `NonNullable<GetOrderByCodeQuery["orderByCode"]["shippingAddress"]>` 作为 prop 类型，并去掉多余的 `OrderAddress` 导入（以 schema 实际导出为准）。

- [ ] **Step 5: `OrderProgress.vue`**

Create `d:\zhao\nshop\layers\base\app\components\order\OrderProgress.vue`:

```vue
<script setup lang="ts">
import { ORDER_PROGRESS_STEPS, progressIndex } from "~/utils/order-state";

const props = defineProps<{ state: string }>();
const { t } = useI18n();
const current = computed(() => progressIndex(props.state));
const isCancelled = computed(() => props.state === "Cancelled");
</script>

<template>
  <ol class="flex items-center gap-1 text-xs">
    <template v-for="(step, i) in ORDER_PROGRESS_STEPS" :key="step">
      <li class="flex items-center gap-1">
        <div
          class="rounded-full px-2 py-0.5"
          :class="
            !isCancelled && i <= current ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-500'
          "
        >
          {{ t(step) }}
        </div>
      </li>
      <li v-if="i < ORDER_PROGRESS_STEPS.length - 1" class="h-px w-4 bg-neutral-300"></li>
    </template>
  </ol>
</template>
```

- [ ] **Step 6: `OrderActions.vue`**

Create `d:\zhao\nshop\layers\base\app\components\order\OrderActions.vue`:

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "~~/.nuxt/gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const emit = defineEmits<{
  (e: "updated"): void;
}>();
const { t } = useI18n();
const localePath = useLocalePath();
const router = useRouter();
const { loading, canCancel, cancelOrder, reorder, copyOrderLink } = useOrderActions();

const lines = computed(() =>
  (props.order.lines ?? []).map((l) => ({
    productVariantId: l.productVariant?.id ?? "",
    quantity: l.quantity,
  })),
);

async function onCancel() {
  const ok = await cancelOrder(props.order.state);
  if (ok) emit("updated");
}

async function onReorder() {
  const ok = await reorder(lines.value);
  if (ok) router.push(localePath("/checkout"));
}
</script>

<template>
  <div class="flex flex-wrap gap-3">
    <UButton
      v-if="canCancel(order.state)"
      icon="i-lucide-x"
      color="error"
      variant="soft"
      :loading="loading"
      :label="t('order.cancel')"
      @click="onCancel"
    />
    <UButton
      icon="i-lucide-shopping-cart"
      color="brand"
      :loading="loading"
      :label="t('order.reorder')"
      @click="onReorder"
    />
    <UButton
      icon="i-lucide-link"
      variant="ghost"
      :label="t('messages.general.getLink')"
      @click="copyOrderLink(order.code)"
    />
  </div>
</template>
```

- [ ] **Step 7: `DeliveryInfo.vue`（本地化配送 + 预留接口）**

Create `d:\zhao\nshop\layers\base\app\components\order\DeliveryInfo.vue`:

```vue
<script setup lang="ts">
import type { GetOrderByCodeQuery } from "~~/.nuxt/gql/default";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t } = useI18n();

// 配送方式类型：delivery(快递/就近配送) | pickup(自提：门店/自提点)
const deliveryType = computed(() => props.order.customFields?.deliveryType ?? "delivery");
const isPickup = computed(() => deliveryType.value === "pickup");
const pickupLocation = computed(
  () => props.order.customFields?.selectedPickupLocationId ?? null,
);
const pickupType = computed(() => props.order.customFields?.pickupType ?? null);
const pickupClaimed = computed(
  () => props.order.customFields?.pickupClaimed ?? false,
);

// ── 预留接口 ─────────────────────────────────────────
// 物流轨迹：当后端 logistics-api-plugin(快递100) 就绪后填充
const expressCompany = computed<string | null>(() => null); // 预留
const expressNo = computed<string | null>(() => null); // 预留
const trackingUrl = computed<string | null>(() => null); // 预留
// 自提核销/提货码：当后端提供顾客端核销 mutation 后填充
const pickupCode = computed<string | null>(() => null); // 预留
// 商品级卡密/兑换码：未来虚拟商品/已购可兑换内容展示区
</script>

<template>
  <section class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
    <h3 class="mb-3 font-medium">{{ t("order.delivery") }}</h3>

    <!-- 自提：门店 self / 自提点 point / 企业 employee -->
    <div v-if="isPickup" class="space-y-2 text-sm">
      <div class="font-medium">{{ pickupLocation?.name }}</div>
      <p class="text-neutral-500">{{ pickupLocation?.address }}</p>
      <p class="text-neutral-500">{{ pickupLocation?.businessHours }}</p>
      <div class="flex items-center gap-2">
        <UBadge :color="pickupClaimed ? 'success' : 'warning'" variant="outline">
          {{
            pickupClaimed
              ? t("messages.shop.pickupClaimed")
              : t("messages.shop.pickupPending")
          }}
        </UBadge>
        <!-- 预留：提货码展示（后端顾客核销 mutation 就绪后填充） -->
        <span v-if="pickupCode" class="font-mono">{{ pickupCode }}</span>
      </div>
    </div>

    <!-- 快递/就近配送 -->
    <div v-else class="space-y-2 text-sm">
      <p>
        {{ t("messages.general.shippingSelect") }}:
        {{ props.order.shippingLines?.[0]?.shippingMethod?.name }}
      </p>
      <p v-if="expressNo">
        {{ t("order.expressNo") }}: <span class="font-mono">{{ expressNo }}</span>
      </p>
      <p v-if="expressCompany">{{ t("order.expressCompany") }}: {{ expressCompany }}</p>
      <!-- 预留：物流轨迹 slot -->
      <slot name="tracking" :url="trackingUrl" />
    </div>

    <!-- 预留：卡密/兑换码展示区 -->
    <slot name="redeem" />
  </section>
</template>
```

- [ ] **Step 8: typecheck + 渲染校验**

Run: `pnpm typecheck && pnpm dev`
Expected: 七个组件 auto-import 成功，无类型错误。

- [ ] **Step 9: Commit**

```bash
git add layers/base/app/components/order/
git commit -m "feat(order): 订单展示组件集合（含 DeliveryInfo 本地化配送预留）"
```

---

### Task 8: 通用订单详情页 `account/orders/[code].vue`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\pages\account\orders\[code].vue`

- [ ] **Step 1: 详情页**

Create `d:\zhao\nshop\layers\base\app\pages\account\orders\[code].vue`:

```vue
<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const localePath = useLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());
const code = route.params.code as string;

const {
  data: orderData,
  error,
  refresh,
} = await useAsyncGql("GetOrderByCode", { code });

const order = computed(() => orderData.value?.orderByCode ?? null);
const hasError = computed(() => !!error.value || !order.value);

onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo(localePath("/account/login"), { replace: true });
    return;
  }
});
</script>

<template>
  <BaseLoader v-if="!isAuthenticated" width="sm:w-xs md:w-md" />
  <UError
    v-else-if="hasError"
    :error="{
      statusCode: 404,
      statusMessage: t('messages.error.noOrder'),
      message: t('messages.error.orderNotFound'),
    }"
  />
  <main v-else-if="order" class="container mb-14">
    <header class="my-14">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{{ t("messages.shop.orderDetails") }}</h1>
        <OrderStateBadge :state="order.state" />
      </div>
      <ULink :to="localePath('/account/orders')" class="mt-2 text-sm">
        {{ t("messages.account.orders") }}
      </ULink>
      <p class="mt-2 text-sm text-neutral-500">
        {{ t("messages.shop.orderCode") }}: {{ order.code }}
      </p>
    </header>

    <OrderProgress :state="order.state" class="mb-8" />

    <section class="mb-10">
      <h2 class="mb-3 text-lg font-semibold">{{ t("messages.shop.orderSummary") }}</h2>
      <OrderItems :order="order" />
    </section>

    <div class="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
      <OrderAddress :address="order.shippingAddress" />
      <DeliveryInfo :order="order" />
    </div>

    <section class="mb-10 max-w-md">
      <h2 class="mb-3 text-lg font-semibold">{{ t("messages.general.amount") }}</h2>
      <OrderTotals :order="order" />
    </section>

    <OrderActions :order="order" @updated="refresh" class="mb-10" />
  </main>
</template>

<style lang="css" scoped></style>
```

> 路由 `/account/orders/[code].vue` 与确认页别名 `/order/:code` 并存，二者指向不同页面；本页为订单中心通用详情。节点语义若与确认页重复属预期（分场景载体不同）。`refresh` 在操作成功后重拉，更新 `state` 徽标/进度/操作按钮态。

- [ ] **Step 2: 校验**

Run: `pnpm dev`
Expected: 登录后从订单列表点行进 `/account/orders/{code}`，完整展示进度/商品/地址/配送/金额/操作。仅待支付态显示「取消订单」，点击后刷新状态。

- [ ] **Step 3: Commit**

```bash
git add "layers/base/app/pages/account/orders/[code].vue"
git commit -m "feat(order): 通用订单详情页 account/orders/[code]"
```

---

### Task 9: 订单列表页增强（状态 Tab + 操作列）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\account\orders.vue`

- [ ] **Step 1: 改造脚本（Tab 筛选 + 操作列）**

Replacing `layers/base/app/pages/account/orders.vue` `<script setup>` 逻辑（保留 `GetOrderHistory` 拉取），新增 Tab 与操作：

```ts
const route = useRoute();
const router = useRouter();
const activeTab = ref<string>("ALL"); // 与地址栏 ?tab= 同步可选

const orders = computed(() =>
  (orderHistory.value.activeCustomer?.orders?.items ?? []).filter(
    (o) => o.state !== "AddingItems" || tabOfState(o.state) !== "PAYMENT_PENDING",
  ),
);

const filteredOrders = computed(() =>
  activeTab.value === "ALL"
    ? orders.value
    : orders.value.filter((o) => tabOfState(o.state) === activeTab.value),
);
```

同时把 `tableData` 的 `status` 列改为通过 `stateBadge` 渲染（注入 `OrderStateBadge`），并在 actions 下拉增加「取消/再次购买」。

> 说明：原逻辑 `filter((o) => o.state !== "AddingItems")` 会误删「待支付」用户尚未提交的草稿单。为保留「待支付」Tab，改用：草稿单（`AddingItems`/`ArrangingPayment`）归入「待支付」，用 `tabOfState` 过滤而非硬删。
> 若仍需沿用旧行为可保留，但推荐按下述映射让所有状态可见。

- [ ] **Step 2: 增加状态 Tab 工具栏**

在 `<template>` 的 `<UTable>` 上方插入：

```vue
<UTabs
  v-model="activeTab"
  :items="ORDER_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), slot: 'content' }))"
/>
```

- [ ] **Step 3: 校验**

Run: `pnpm dev`
Expected: 订单列表显示状态 Tab，点 Tab 过滤；点「详情」进 `/account/orders/{code}`；待支付单行有「取消」，所有行有「再次购买」。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/pages/account/orders.vue
git commit -m "feat(order): 订单列表状态 Tab 筛选 + 操作列"
```

---

### Task 10: 下载确认页复用 order 组件 + i18n keys

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\checkout\confirmation\[code].client.vue`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\*.ts`（zh-CN.ts / en-US.ts + 其余 8 个同键加英文值）

- [ ] **Step 1: 确认页商品表/金额替换为复用组件**

在 `confirmation/[code].client.vue` 的「3. Order summary」与「4. Order details」区块，把内联 `UTable`（商品表）与金额 `dl` 替换为：

```vue
    <!-- 3. Order summary -->
    <section aria-labelledby="order-summary-heading" class="mb-14">
      <h2 id="order-summary-heading" class="text-xl font-semibold underline">
        {{ t("messages.shop.orderSummary") }}
      </h2>
      <OrderItems :order="order" />
    </section>
```

并在「4. Order details」的金额列替换为 `<OrderTotals :order="order" />`（保留 shipping/payment 信息列）。`OrderAddress` 可用于替换 shipping address 列。自提信息区块保留现状（已含核销）。

> 目的：消除确认页与列表/详情页重复的商品/金额渲染代码，统一复用 `components/order/*`。改动以不改变确认页支付/轮询行为为准。

- [ ] **Step 2: 增加 i18n keys**

在 `layers/base/i18n/locales/zh-CN.ts` 的 `messages` 下新增 `order` 块（同时加 `messages.account` 的 `addresses/addAddress/edit/delete/defaultAddress/noAddresses/selectAddress/saveSuccess/deleteSuccess/backToAccount/contactName/phone`）：

```ts
order: {
  tabAll: "全部",
  tabPaymentPending: "待支付",
  tabToShip: "待发货",
  tabToReceive: "待收货",
  tabCompleted: "已完成",
  tabCancelled: "已取消",
  statePaymentPending: "待支付",
  statePaid: "待发货",
  stateShipped: "待收货",
  stateDelivered: "已完成",
  stateCancelled: "已取消",
  stateProcessing: "处理中",
  progressPlaced: "下单",
  progressPaid: "支付",
  progressShipped: "发货",
  progressCompleted: "完成",
  delivery: "配送方式",
  expressNo: "运单号",
  expressCompany: "物流公司",
  cancel: "取消订单",
  cancelNotAllowed: "已付款/已发货订单请在客服协助下处理",
  cancelSuccess: "订单已取消",
  cancelFailed: "取消失败",
  reorder: "再次购买",
  reorderSuccess: "已加入购物车",
  reorderFailed: "加入购物车失败",
  noAddress: "无收货地址",
},
```

在 `messages.account` 新增：

```ts
addresses: "收货地址",
addAddress: "新增地址",
edit: "编辑",
delete: "删除",
defaultAddress: "默认",
noAddresses: "暂无收货地址",
selectAddress: "从地址簿选择",
saveSuccess: "保存成功",
deleteSuccess: "已删除",
backToAccount: "返回我的账户",
contactName: "联系人",
phone: "联系电话",
```

在 `layers/base/i18n/locales/en-US.ts` 加等价的英文 `order` 块与 `account` keys。其余 8 个 locale 文件复制相同形状（值用英文兜底，避免缺键告警）。

> 尊重项目 i18n 既有平铺结构（如 `messages.shop.*`、`messages.general.*`、`messages.billing.*`）。若发现 `messages` 层级实际是别名引用，以 zh-CN.ts 实际结构为准同级新增即可。

- [ ] **Step 3: 校验**

Run: `pnpm dev`
Expected: 确认页、订单中心各区块正常渲染新文案；无 i18n 缺键报错。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/pages/checkout/confirmation/\[code\].client.vue layers/base/i18n/locales/
git commit -m "feat(i18n): 订单中心/地址簿文案 + 确认页复用 order 组件"
```

---

### Task 11: 类型检查 + 本地构建 + 部署（遵守部署铁律）

**Files:**
- Review: `d:\zhao\nshop\scripts\deploy.mjs`
- Verify on server: pm2 进程、URL

- [ ] **Step 1: 本地全量类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误（所有新组件/props/query 类型对齐）。

- [ ] **Step 2: 本地联调**

Run: `pnpm dev`
Expected: 账号登录后验证——地址 CRUD / 默认高亮 / 结算页回填；订单 Tab 筛选、详情、待支付取消、再次购买；自提订单详情展示核销。回归：购物车/结算/确认页/登录正常。

- [ ] **Step 3: 本地构建**

Run: `pnpm build`
Expected: 构建成功，`.output/` 产物生成，无 `Cannot find module`。

- [ ] **Step 4: 后端零改动确认**

Run: `git -C d:\zhao\vendure status`
Expected: 无改动（后端零改动验证）。

- [ ] **Step 5: 部署到服务器**

Run: `pnpm deploy`（= `node scripts/deploy.mjs`：本地 build → scp `.output/` → pm2 restart `nshop`）
Expected: 遵守铁律——服务器不 install/build；部署脚本输出上传与重启成功。

- [ ] **Step 6: 线上验证**

```bash
# 账户页 200
ssh qing "curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/account/orders"
```
Expected: 200；登录后订单列表/详情/地址页可达，无 500、无 `Cannot find module`。

- [ ] **Step 7: 回归**

访问线上 `www.youshop.cn` 首页、分类、商品详情、购物车、结算、账号主页 → 功能正常，无回归。

- [ ] **Step 8: Commit（若有产物/脚本改动）**

```bash
git add .output scripts/ 2>/dev/null
git commit -m "chore(deploy): 订单中心+地址簿部署产物"
```
（无改动则跳过本步。）

---

## 自审备注（Self-Review）

- **Spec 覆盖**：地址 CRUD(Task1-4)、设为默认(Task2 `defaultAddress`=首条 + Task4 徽标)、结算回填(Task5)、状态 Tab(Task6/9)、通用详情(Task8)、取消(Task6/7/9)、再次购买(Task6/7/9)、配送方式含自提(DeliveryInfo Task7)、本地化预留接口(DeliveryInfo 内 slot/预留字段)、核销状态展示(Task7)、支付 code 原文+保留翻译(DeliveryInfo/确认页)。均落在对应任务。
- **后端零新增**：全计划仅前端，消费 Vendure 原生地址/订单/支付/自提能力。
- **占位扫描**：所有 GQL 具体定义/组件完整代码均已给出；无 TBD（`pickupCode/expressNo` 只是运行时空值的预留变量，非计划占位）。
- **类型一致性**：`AddressRecord/AddressDraft`、`OrderTabKey`、`stateBadge/StateBadge`、`progressIndex`、`tabOfState` 命名在 Task1/6/7 中前后一致；新旧 `useAddressBook` 返回名在 Task4 解构处一对一对应。