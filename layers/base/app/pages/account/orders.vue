<script setup lang="ts">
import { h, resolveComponent } from "vue";
import { SortOrder } from "~~/types/default";

import type { TableColumn, TableRow } from "@nuxt/ui";
import type { OrderTableRow } from "~~/types/general";

import { ORDER_TABS, tabOfState } from "../../utils/order-state";
import type { OrderTabKey } from "../../utils/order-state";

const { i18NBaseUrl } = useRuntimeConfig().public;
const { locale, d, t } = useI18n();
const localePath = useLocalePath();
const router = useRouter();
const { copy } = useClipboard();
const toast = useToast();
const { customer } = storeToRefs(useCustomerStore());
const { isAuthenticated } = storeToRefs(useAuthStore());
const { canCancel, cancelOrder, reorder, loading: actionLoading } =
  useOrderActions();
const loading = ref(true);
const activeTab = ref<OrderTabKey>("ALL");

const UButton = resolveComponent("UButton");
const UDropdownMenu = resolveComponent("UDropdownMenu");
const OrderStateBadge = resolveComponent("OrderStateBadge");

const options = {
  sort: { createdAt: SortOrder.DESC },
  take: 10,
};

const { data: orderHistory, refresh } = await useAsyncGql(
  "GetOrderHistory",
  {
    options,
  },
  {
    immediate: false,
    server: false,
  },
);

const orders = computed(
  () => orderHistory.value.activeCustomer?.orders?.items ?? [],
);

const filteredOrders = computed(() =>
  activeTab.value === "ALL"
    ? orders.value
    : orders.value.filter((o) => tabOfState(o.state) === activeTab.value),
);

const tableData = computed<OrderTableRow[]>(() =>
  filteredOrders.value.map((order, index) => ({
    id: index + 1,
    date: d(new Date(order.orderPlacedAt)),
    status: order.state,
    amount: (order.totalWithTax / 100).toFixed(2),
    currency: order.currencyCode,
    code: order.code,
  })),
);

const columns: TableColumn<OrderTableRow>[] = [
  {
    accessorKey: "id",
    header: "#",
    cell: ({ row }) => `#${row.getValue("id")}`,
  },
  {
    accessorKey: "date",
    header: t("messages.general.date"),
    cell: ({ row }) => `${row.getValue("date")}`,
  },
  {
    accessorKey: "status",
    header: t("messages.general.status"),
    cell: ({ row }) =>
      h(OrderStateBadge, { state: row.getValue("status") }),
  },
  {
    accessorKey: "amount",
    header: () =>
      h("div", { class: "text-right" }, t("messages.general.amount")),
    cell: ({ row }) => {
      const amount = Number.parseFloat(row.getValue("amount"));

      const formatted = new Intl.NumberFormat(locale.value, {
        style: "currency",
        currency: row.original.currency,
      }).format(amount);

      return h("div", { class: "text-right font-medium" }, formatted);
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return h(
        "div",
        { class: "text-right" },
        h(
          UDropdownMenu,
          {
            content: {
              align: "end",
            },
            items: getRowItems(row),
            "aria-label": "Actions dropdown",
          },
          () =>
            h(UButton, {
              icon: "i-lucide-ellipsis-vertical",
              color: "neutral",
              variant: "ghost",
              class: "ml-auto",
              "aria-label": "Actions dropdown",
              loading: actionLoading.value,
            }),
        ),
      );
    },
  },
];

function findOrder(code: string) {
  return orders.value.find((o) => o.code === code);
}

function getRowItems(row: TableRow<OrderTableRow>) {
  const code = row.original.code;

  return [
    {
      type: "label",
      label: t("messages.general.actions"),
    },
    {
      type: "separator",
    },
    {
      label: t("messages.general.getLink"),
      icon: "i-lucide-link",
      class: "items-center",
      onSelect() {
        const path = localePath(`/account/orders/${row.original.code}`);
        copy(`${i18NBaseUrl}${path}`);

        toast.add({
          title: t("messages.general.getLinkSuccess"),
          color: "success",
          icon: "i-lucide-clipboard-check",
        });
      },
    },
    ...(canCancel(row.original.status)
      ? [
          {
            label: t("order.cancel"),
            icon: "i-lucide-x",
            class: "items-center",
            async onSelect() {
              const ok = await cancelOrder(row.original.status);
              if (ok) await refresh();
            },
          },
        ]
      : []),
    {
      label: t("order.reorder"),
      icon: "i-lucide-shopping-cart",
      class: "items-center",
      async onSelect() {
        const target = findOrder(code);
        if (!target) return;
        const lines = target.lines.map((l) => ({
          productVariantId: l.productVariant.id,
          quantity: l.quantity,
        }));
        const ok = await reorder(lines);
        if (ok) router.push(localePath("/checkout"));
      },
    },
    {
      label: t("messages.general.details"),
      icon: "i-lucide-info",
      to: localePath(`/account/orders/${row.original.code}`),
      class: "items-center",
    },
  ];
}

onMounted(async () => {
  if (!isAuthenticated.value) {
    navigateTo(localePath("/account/login"), { replace: true });
    return;
  }

  await refresh();

  loading.value = false;
});
</script>

<template>
  <BaseLoader v-if="loading || !isAuthenticated" width="sm:w-xs md:w-sm" />
  <main v-else class="container">
    <header class="my-14">
      <h1 class="text-2xl font-semibold">{{ t("messages.account.orders") }}</h1>
      <ULink :to="localePath('/account')" class="mt-2">
        {{ customer?.emailAddress }}
      </ULink>
    </header>

    <div v-if="orders">
      <UTabs
        v-model="activeTab"
        :items="ORDER_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) }))"
        class="mb-6"
      />

      <UTable
        sticky
        :data="tableData"
        :columns="columns"
        caption="My Orders"
        class="max-h-[312px] flex-1"
      />
    </div>
  </main>
</template>

<style lang="css" scoped></style>