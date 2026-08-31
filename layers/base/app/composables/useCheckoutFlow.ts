import type {
  CheckoutDeliveryMode,
} from "~~/layers/base/app/utils/checkout-config";

/**
 * checkout 全页联动的「单一事实源」：
 * - `deliveryMode` 用 useState 跨页面/跨组件共享；切换时对应功能块显隐联动。
 * - 提交采用 provide/inject：各功能块向 `CheckoutFlowContext` 注册自己的提交函数，
 *   页面 `submitAll()` 按 地址 → (物流|自提) → 支付 顺序门闩式推进。
 */

export interface CheckoutSubmitFns {
  /** 提交地址（仅配送模式调用），返回是否成功 */
  submitAddress?: (() => Promise<boolean>) | null;
  /** 提交配送方式（仅配送模式调用，默认/唯一物流直接选） */
  submitDelivery?: (() => Promise<boolean>) | null;
  /** 提交自提单（自提箱的承运方式 + 自提点） */
  submitPickup?: (() => Promise<boolean>) | null;
  /** 提交到店领取联系人（需要联系方式的档案才调用） */
  submitContact?: (() => Promise<boolean>) | null;
  /** 提交支付方式 */
  submitPayment?: (() => Promise<boolean>) | null;
}

export interface CheckoutFlowContext {
  mode: Ref<CheckoutDeliveryMode>;
  setMode: (mode: CheckoutDeliveryMode) => void;
  submitFns: CheckoutSubmitFns;
}

const FLOW_KEY = Symbol("checkoutFlow");
const MODE_KEY = "checkoutDeliveryMode";

/** 提供侧：页面建立全页流程上下文 */
export function provideCheckoutFlow() {
  const mode = useState<CheckoutDeliveryMode>(MODE_KEY, () => "shipping");
  const submitFns: CheckoutSubmitFns = {
    submitAddress: null,
    submitDelivery: null,
    submitPickup: null,
    submitContact: null,
    submitPayment: null,
  };
  const ctx: CheckoutFlowContext = {
    mode,
    setMode: (m: CheckoutDeliveryMode) => {
      mode.value = m;
    },
    submitFns,
  };
  provide(FLOW_KEY, ctx);
  return ctx;
}

/** 注入侧：功能块读取当前模式 / 注册提交函数 */
export function useCheckoutFlow(): CheckoutFlowContext {
  const ctx = inject<CheckoutFlowContext>(FLOW_KEY);
  if (!ctx) {
    // 未提供时（理论上只会在页面之下使用），退化到独立状态，避免报错
    throw new Error("useCheckoutFlow 必须在提供 checkoutFlow 的页面下使用");
  }
  return ctx;
}