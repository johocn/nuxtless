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
