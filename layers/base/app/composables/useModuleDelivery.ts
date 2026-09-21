import type { DeliveryMethod } from '../utils/productVisibility';

const STORAGE_KEY = 'nshop:module-delivery';

interface ModuleDeliveryState {
  [moduleId: string]: DeliveryMethod;
}

function readStore(): ModuleDeliveryState {
  if (!import.meta.client) return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ModuleDeliveryState;
  } catch {
    return {};
  }
}

export function useModuleDelivery(moduleId: string, initial?: DeliveryMethod) {
  const methods = useState<ModuleDeliveryState>(STORAGE_KEY, readStore);
  const current = computed<DeliveryMethod>(() => methods.value[moduleId] ?? initial ?? 'MAIL');
  function set(d: DeliveryMethod) {
    methods.value = { ...methods.value, [moduleId]: d };
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(methods.value));
  }
  return { current, setDelivery: set };
}

interface ChannelDeliveryCapability {
  modes: DeliveryMethod[];
  bothSupported: boolean;
  source: 'profile' | 'fallback';
  /** 渠道级 facet 映射 `{ MAIL: id, SELF_PICKUP: id }`；facet 未建/未同步时为 null */
  facetValueIds?: Record<string, string> | null;
}

/**
 * 渠道级配送能力（服务端由配送档案派生，唯一真源）。
 * 用于决定首页/列表的「邮寄 / 自提」筛选条是否渲染：
 * 只有该渠道同时支持两种方式时才显示选择框；单一方式时锁定该方式、不渲染选择框。
 * 能力未知（查询失败/未返回）时按「显示」处理，保持既有行为不倒退。
 */
export function useChannelDeliveryCapability() {
  const { data } = useAsyncData(
    'channel-delivery-capability',
    async () => {
      const res = await useAsyncGql('ChannelDeliveryCapability', {}, { server: true });
      return (res.data.value?.channelDeliveryCapability ?? null) as ChannelDeliveryCapability | null;
    },
    { server: true },
  );
  const capability = computed<ChannelDeliveryCapability | null>(() => data.value ?? null);
  return {
    capability,
    /** 渠道级 facet 映射（服务端筛选入参用）；未同步时为 null */
    facetValueIds: computed<Record<string, string> | null>(() => capability.value?.facetValueIds ?? null),
    /** 筛选条渲染条件：渠道双能力才显示；能力未知时保守显示 */
    showDeliveryPicker: computed(() => capability.value?.bothSupported ?? true),
    /** 单能力渠道下锁定的唯一方式（双能力或未知时为 null） */
    lockedMode: computed<DeliveryMethod | null>(() => {
      const cap = capability.value;
      if (!cap || cap.bothSupported) return null;
      return cap.modes?.[0] ?? null;
    }),
  };
}
