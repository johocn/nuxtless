<script setup lang="ts">
// 自提点导航弹层：内嵌高德地图展示「当前定位起点 → 自提点终点」驾车路线，
// 弹层内「去导航」用高德 URI 唤起 App。复用 usePickupNavigation 加载 SDK。
import type { PickupLocation } from "~~/.nuxt/gql/default";
import { parseCoordinates } from "~~/layers/base/app/utils/checkout-config";

// 父组件用 `v-model:open="navOpen"` 传入，defineModel 必须显式声明 name='open'，
// 否则默认绑定 modelValue 永远收不到父值，watch(open) 恒为 false。
const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{
  pickup?: PickupLocation | null;
}>();

const { t } = useI18n();
const nav = usePickupNavigation();
const locationStore = useLocationStore();
const toast = useToast();

const mapEl = useTemplateRef<HTMLDivElement>("mapEl");
const errorMsg = ref("");
const loading = ref(false);

let map: any = null;
let routeDrawn = false;

// 地图容器位于 <template #body> 插槽内，`useTemplateRef("mapEl")` 可能绑定不到插槽内元素，
// 这里用唯一 data 属性做 DOM 兜底探测，保证 rAF 轮询能稳定拿到容器。
function getMapEl(): HTMLDivElement | null {
  const refEl = mapEl.value;
  if (refEl) return refEl;
  if (typeof document !== "undefined") {
    return document.querySelector<HTMLDivElement>("[data-pickup-map-el]");
  }
  return null;
}

function initMap() {
  const pick = props.pickup;
  const end = parseCoordinates(pick?.coordinates);
  if (!end) {
    errorMsg.value = t("messages.checkout.navNoCoords");
    return;
  }
  const start = locationStore.coords
    ? { lat: locationStore.coords.lat, lng: locationStore.coords.lng }
    : null;
  const el = getMapEl();
  if (!el) return;

  loading.value = true;
  errorMsg.value = "";
  void nav.loadAmapSdk().then((AMap: any) => {
    loading.value = false;
    if (!AMap) {
      errorMsg.value = t("messages.checkout.navSdkFail");
      return;
    }
    try {
      map = new AMap.Map(el, {
        zoom: 13,
        center: [end.lng, end.lat],
        viewMode: "2D",
      });
      new AMap.Marker({
        position: [end.lng, end.lat],
        anchor: "bottom-center",
        map,
      });
      if (start && routeDrawn === false) {
        new AMap.Marker({
          position: [start.lng, start.lat],
          anchor: "bottom-center",
          map,
        });
        routeDrawn = true;
        AMap.plugin("AMap.Driving", () => {
          try {
            const driving = new AMap.Driving({
              policy: AMap.DrivingPolicy?.LEAST_TIME,
              map,
              panel: false,
            });
            driving.search(
              [start.lng, start.lat],
              [end.lng, end.lat],
              (status: string, result: any) => {
                if (status !== "complete" || !result?.routes?.length) {
                  map?.setFitView?.();
                }
              },
            );
          } catch {
            map?.setFitView?.();
          }
        });
      } else {
        map.setFitView();
      }
    } catch {
      errorMsg.value = t("messages.checkout.navSdkFail");
    }
  });
}

// UModal 内容经 teleport/过渡异步挂载，弹层打开瞬间 mapEl 可能尚未渲染或高度为 0，
// 直接 init 会静默失败（地图空白、AMap 从未创建）。用 rAF 轮询等容器就绪（有元素且高度>0）再初始化。
function initWhenReady() {
  let frames = 0;
  const loop = () => {
    const el = getMapEl();
    if (el && el.offsetHeight > 0) {
      initMap();
      return;
    }
    if (++frames > 240) return; // ~4s @60fps 兜底，仍未就绪则放弃（保留「去导航」兜底链路）
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(() => requestAnimationFrame(loop));
}

// immediate:true —— 组件可能在被 UModal 条件挂载时 open 已是 true，此时 watch 不会触发，必须立即初始化。
watch(
  open,
  (v) => {
    if (v) {
      routeDrawn = false;
      errorMsg.value = "";
      initWhenReady();
    } else if (map) {
      try {
        map.destroy();
      } catch {
        /* noop */
      }
      map = null;
    }
  },
  { immediate: true },
);

function goNavigate() {
  const uri = nav.buildNavigationUri(props.pickup ?? null);
  if (!uri) {
    toast.add({
      title: t("messages.checkout.navNoCoords"),
      color: "error",
    });
    return;
  }
  if (typeof window !== "undefined") window.open(uri, "_blank");
}
</script>

<template>
  <UModal v-model:open="open" :title="pickup?.name || t('messages.checkout.navigation')">
    <template #body>
      <div class="space-y-3">
      <div
        ref="mapEl"
        data-pickup-map-el
        class="h-72 w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40"
      />
      <UAlert
        v-if="errorMsg"
        icon="i-lucide:map-pin-off"
        color="warning"
        variant="soft"
        :title="errorMsg"
      />
      <div class="flex items-center justify-between gap-2">
        <p class="min-w-0 flex-1 truncate text-sm text-neutral-500">
          {{ pickup?.address }}
        </p>
        <UButton
          color="primary"
          icon="i-lucide:navigation"
          :label="t('messages.checkout.goNavigate')"
          :disabled="!nav.hasCoords(pickup ?? null)"
          @click="goNavigate"
        />
      </div>
      </div>
      </template>
    </UModal>
</template>