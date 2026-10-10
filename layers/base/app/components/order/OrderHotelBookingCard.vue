<script setup lang="ts">
// 订单详情「酒店预订卡」（P3 Task 12，方案 A 行程步骤条式 mockup 定稿）：
// 数据源 myHotelBookings（按登录顾客过滤），组件内按 orderCode 二次筛选；
// 无酒店预订单时整卡隐藏（零侵入非酒店订单）。
// 状态机：pendingDeposit → confirmed（入住码+取消截止）→ checkedIn → completed；cancelled/noShow 终态提示。
const { t, locale } = useI18n();
const gql = useGql();

const props = withDefaults(defineProps<{
  order: any;
  /** 版式变体：jd=方角白卡 / mall=大圆角描边 / 其他=中性圆角卡（与核销卡同语言） */
  variant?: "cn" | "jd" | "mall" | "classic";
}>(), { variant: "cn" });

interface HotelBooking {
  id: number | string;
  orderCode: string;
  productVariantId: number | string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomCount: number;
  status: string;
  ratePlanCode?: string | null;
  totalCent: number;
  guestName?: string | null;
  guestPhone?: string | null;
  bookingCode?: string | null;
  cancelDeadlineAt?: string | null;
}

const bookings = ref<HotelBooking[]>([]);

onMounted(async () => {
  try {
    const res: any = await gql("GetMyHotelBookings", {});
    const all: HotelBooking[] = res?.myHotelBookings ?? [];
    bookings.value = all.filter((b) => b.orderCode === props.order?.code);
  } catch {
    bookings.value = [];
  }
});

/** 流转中的状态才显示步骤条（终态显示提示条） */
const FLOW = ["pendingDeposit", "confirmed", "checkedIn", "completed"];
const isFlow = (s: string) => FLOW.includes(s);

const STEP_KEYS = ["hotelStepPending", "hotelStepConfirmed", "hotelStepCheckedIn", "hotelStepCompleted"];
/** 步骤 i（0..3）在状态下的 dot/连线/文字样式；idx = 当前状态在 FLOW 中的序号 */
function stepCls(i: number, status: string) {
  const idx = FLOW.indexOf(status);
  if (idx < 0) return {};
  return {
    dot:
      i < idx
        ? "border-brand-500 bg-brand-500"
        : i === idx
          ? "border-brand-500 bg-brand-500 ring-4 ring-brand-500/20"
          : "",
    ln: i > 0 && i <= idx ? "bg-brand-500" : "",
    txt:
      i < idx
        ? "text-neutral-800 dark:text-neutral-200"
        : i === idx
          ? "text-brand-700 font-medium dark:text-brand-500"
          : "",
  };
}

const BADGE: Record<string, string> = {
  pendingDeposit: "bg-orange-100 text-orange-600",
  confirmed: "bg-brand-50 text-brand-700",
  checkedIn: "bg-brand-600 text-white",
  completed: "bg-neutral-200 text-neutral-600",
  cancelled: "bg-red-100 text-red-600",
  noShow: "bg-red-100 text-red-600",
};
const badgeCls = (s: string) => "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " + (BADGE[s] ?? BADGE.completed);
const stKey = (s: string) => "messages.order.hotelSt" + s.charAt(0).toUpperCase() + s.slice(1);

/** 房型名：按 productVariantId 回订单行匹配（匹配不到回退「客房」） */
function roomName(b: HotelBooking) {
  const line = (props.order?.lines ?? []).find(
    (l: any) => String(l?.productVariant?.id) === String(b.productVariantId),
  );
  return line?.productVariant?.name || t("messages.order.hotelRoomGeneric");
}

const parseLocal = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtMD = (s: string) => {
  const d = parseLocal(s);
  return isNaN(d.getTime()) ? s : `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const weekday = (s: string) => {
  const d = parseLocal(s);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale.value, { weekday: "short" }).format(d);
};
const maskPhone = (p?: string | null) =>
  p ? (String(p).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") || p) : "";

const money = (c: number) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: props.order?.currencyCode || "CNY",
  }).format((c || 0) / 100);

/** 免费取消倒计时（仅 confirmed 且截止点有效） */
function deadlineInfo(b: HotelBooking) {
  if (b.status !== "confirmed" || !b.cancelDeadlineAt) return null;
  const t0 = new Date(b.cancelDeadlineAt);
  if (isNaN(t0.getTime())) return null;
  const diff = t0.getTime() - Date.now();
  const dt = `${pad2(t0.getMonth() + 1)}-${pad2(t0.getDate())} ${pad2(t0.getHours())}:${pad2(t0.getMinutes())}`;
  if (diff <= 0) return { ended: true, dt };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const left =
    days > 0
      ? t("messages.order.hotelLeftDays", { d: days, h: hours })
      : t("messages.order.hotelLeftHours", { h: hours });
  return { ended: false, dt, left };
}
const dl = (b: HotelBooking) => deadlineInfo(b);

/** 联系酒店：暂取订单级 hotelPhone 自定义字段（无则隐藏按钮；P4 后端补酒店电话字段后换数据源） */
const hotelPhone = computed(() => props.order?.customFields?.hotelPhone || null);

const sectionCls = computed(() => {
  if (props.variant === "jd") return "mb-4 overflow-hidden rounded-md bg-white shadow-[0_1px_2px_#0000000d]";
  if (props.variant === "mall")
    return "mb-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900";
  return "mb-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
});
const cellCls = "rounded-lg bg-neutral-100 dark:bg-neutral-800";
</script>

<template>
  <section v-if="bookings.length" :class="sectionCls">
    <header class="px-4 pb-1 pt-3">
      <h2 class="font-semibold">{{ t("messages.order.hotelBookingTitle") }}</h2>
    </header>

    <div v-for="b in bookings" :key="b.id" class="px-4 pb-4 pt-2">
      <div
        class="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
        :class="(b.status === 'cancelled' || b.status === 'noShow') && 'opacity-80'"
      >
        <!-- 标题行：房型/客人 + 状态徽标 -->
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ roomName(b) }}</p>
            <p class="text-xs text-neutral-500">{{ b.guestName }}<template v-if="b.guestPhone"> · {{ maskPhone(b.guestPhone) }}</template></p>
          </div>
          <span :class="badgeCls(b.status)">{{ t(stKey(b.status)) }}</span>
        </div>

        <!-- 步骤条（仅流转中状态） -->
        <div v-if="isFlow(b.status)" class="mt-4 flex">
          <div v-for="(s, i) in STEP_KEYS" :key="s" class="relative flex flex-1 flex-col items-center gap-1">
            <span
              v-if="i > 0"
              class="absolute left-[-50%] top-[7px] h-0.5 w-full"
              :class="stepCls(i, b.status).ln || 'bg-neutral-200 dark:bg-neutral-700'"
            />
            <span
              class="relative z-10 h-3 w-3 rounded-full border-2"
              :class="stepCls(i, b.status).dot || 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900'"
            />
            <span class="text-xs" :class="stepCls(i, b.status).txt || 'text-neutral-500'">{{ t("messages.order." + s) }}</span>
          </div>
        </div>

        <!-- 日期区间块 -->
        <div :class="['mt-3 flex items-center p-3', cellCls]">
          <div class="flex-1">
            <p class="text-xs text-neutral-500">{{ t("messages.order.hotelCheckinLabel") }}</p>
            <p class="font-semibold">{{ fmtMD(b.checkIn) }}</p>
            <p class="text-xs text-neutral-500">{{ weekday(b.checkIn) }}</p>
          </div>
          <div class="flex-1 text-center text-xs font-medium text-brand-700 dark:text-brand-500">
            {{ t("messages.order.hotelNightsRooms", { n: b.nights, r: b.roomCount }) }}
          </div>
          <div class="flex-1 text-right">
            <p class="text-xs text-neutral-500">{{ t("messages.order.hotelCheckoutLabel") }}</p>
            <p class="font-semibold">{{ fmtMD(b.checkOut) }}</p>
            <p class="text-xs text-neutral-500">{{ weekday(b.checkOut) }}</p>
          </div>
        </div>

        <!-- 状态区：待付订金 / 终态提示 / 入住码 -->
        <div v-if="b.status === 'pendingDeposit'" :class="['mt-3 flex items-center justify-between p-3', cellCls]">
          <p class="text-xs">{{ t("messages.order.hotelCodeMasked") }}</p>
          <p class="font-mono text-sm font-semibold">{{ money(b.totalCent) }}</p>
        </div>
        <div
          v-else-if="b.status === 'cancelled' || b.status === 'noShow'"
          :class="['mt-3 p-3 text-xs', cellCls]"
        >
          <span class="text-red-600 dark:text-red-400">
            {{ t(b.status === "cancelled" ? "messages.order.hotelCancelReleased" : "messages.order.hotelNoShowTip") }}
          </span>
        </div>
        <div v-else :class="['mt-3 border border-dashed border-brand-500/40 p-3 text-center', cellCls]">
          <p class="text-xs text-neutral-500">{{ t("messages.order.hotelCodeLabel") }}</p>
          <p class="my-1 font-mono text-2xl font-bold tracking-[0.3em] text-brand-700 dark:text-brand-500">
            {{ b.bookingCode || "--" }}
          </p>
          <p class="text-xs text-neutral-500">{{ t("messages.order.hotelCodeHint") }}</p>
        </div>

        <!-- 底部：免费取消倒计时 + 联系酒店 -->
        <div v-if="dl(b) || hotelPhone" class="mt-3 flex items-center justify-between gap-2">
          <p v-if="dl(b)" class="min-w-0 text-xs" :class="dl(b)!.ended ? 'text-neutral-500' : 'text-orange-600'">
            {{ dl(b)!.ended
              ? t("messages.order.hotelFreeCancelEnded")
              : t("messages.order.hotelFreeCancelUntil", { dt: dl(b)!.dt }) + " · " + dl(b)!.left }}
          </p>
          <a v-if="hotelPhone" :href="'tel:' + hotelPhone" class="shrink-0 rounded-full border border-neutral-300 px-3.5 py-1.5 text-xs font-medium dark:border-neutral-700">
            {{ t("messages.order.hotelContact") }}
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
