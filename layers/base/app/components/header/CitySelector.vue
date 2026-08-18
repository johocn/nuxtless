<script setup lang="ts">
import type { CityInfo, GeoCoords } from "~~/types/location";
import type { DistrictNode } from "~~/.nuxt/gql/default";

const locationStore = useLocationStore();

const open = ref(false);
const locating = ref(false);

// 省/市两级数据（来自 mapDistricts 查询）
const provinces = ref<DistrictNode[]>([]);
const cities = ref<DistrictNode[]>([]);
const currentProvince = ref<DistrictNode | null>(null);
const loadingDistricts = ref(false);

// 热门城市（adcode + 中心坐标），支持快速选择
const hotCities: { info: CityInfo; coords: GeoCoords }[] = [
  { info: { adcode: "110000", name: "北京市" }, coords: { lat: 39.9042, lng: 116.4074 } },
  { info: { adcode: "310000", name: "上海市" }, coords: { lat: 31.2304, lng: 121.4737 } },
  { info: { adcode: "440100", name: "广州市" }, coords: { lat: 23.1291, lng: 113.2644 } },
  { info: { adcode: "440300", name: "深圳市" }, coords: { lat: 22.5431, lng: 114.0579 } },
  { info: { adcode: "330100", name: "杭州市" }, coords: { lat: 30.2741, lng: 120.1551 } },
  { info: { adcode: "510100", name: "成都市" }, coords: { lat: 30.5728, lng: 104.0668 } },
  { info: { adcode: "420100", name: "武汉市" }, coords: { lat: 30.5928, lng: 114.3055 } },
  { info: { adcode: "320100", name: "南京市" }, coords: { lat: 32.0603, lng: 118.7969 } },
  { info: { adcode: "500000", name: "重庆市" }, coords: { lat: 29.563, lng: 106.5516 } },
  { info: { adcode: "610100", name: "西安市" }, coords: { lat: 34.3416, lng: 108.9398 } },
];

// 挂载时启动定位（已有持久化结果则跳过）
onMounted(() => {
  locationStore.init();
});

async function openPanel() {
  open.value = true;
  if (!provinces.value.length) await loadProvinces();
}

async function loadProvinces() {
  loadingDistricts.value = true;
  try {
    const { mapDistricts } = await GqlGetMapDistricts({ parentAdcode: null });
    provinces.value = mapDistricts ?? [];
  } catch {
    provinces.value = [];
  } finally {
    loadingDistricts.value = false;
  }
}

async function selectProvince(province: DistrictNode) {
  currentProvince.value = province;
  loadingDistricts.value = true;
  try {
    const { mapDistricts } = await GqlGetMapDistricts({
      parentAdcode: province.adcode,
    });
    cities.value = mapDistricts ?? [];
  } catch {
    cities.value = [];
  } finally {
    loadingDistricts.value = false;
  }
}

function backToProvinces() {
  currentProvince.value = null;
  cities.value = [];
}

function selectCity(info: CityInfo, coords?: GeoCoords) {
  locationStore.setCity(info, coords);
  open.value = false;
}

async function reLocate() {
  locating.value = true;
  await locationStore.autoLocate();
  locating.value = false;
  if (!locationStore.error) open.value = false;
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      variant="ghost"
      color="neutral"
      :icon="locating || locationStore.locating ? 'i-lucide-loader-circle' : 'i-lucide-map-pin'"
      :ui="(locating || locationStore.locating) ? { leadingIcon: ['animate-spin'] } : undefined"
      :label="locationStore.cityName || (locationStore.locating ? '定位中…' : '选择城市')"
      @click="openPanel"
    />

    <template #content>
      <div class="w-72 p-4">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm font-semibold">选择城市</p>
          <UButton
            size="xs"
            variant="outline"
            color="neutral"
            :loading="locating"
            icon="i-lucide-locate-fixed"
            label="重新定位"
            @click="reLocate"
          />
        </div>

        <p v-if="locationStore.error" class="mb-2 text-xs text-red-500">
          {{ locationStore.error }}
        </p>

        <!-- 热门城市 -->
        <div class="mb-3">
          <p class="mb-1.5 text-xs text-neutral-500">热门城市</p>
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="item in hotCities"
              :key="item.info.adcode"
              size="xs"
              variant="soft"
              color="neutral"
              :label="item.info.name"
              @click="selectCity(item.info, item.coords)"
            />
          </div>
        </div>

        <!-- 省/市两级选择 -->
        <div>
          <div class="mb-1.5 flex items-center gap-2">
            <UButton
              v-if="currentProvince"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-arrow-left"
              aria-label="返回省份"
              @click="backToProvinces"
            />
            <p class="text-xs text-neutral-500">
              {{ currentProvince?.name ?? "全部省份" }}
            </p>
          </div>
          <ul v-if="!loadingDistricts" class="max-h-52 space-y-0.5 overflow-y-auto">
            <template v-if="currentProvince">
              <li v-for="c in cities" :key="c.adcode">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  class="w-full justify-start"
                  :label="c.name"
                  @click="selectCity({ adcode: c.adcode, name: c.name }, { lat: c.center.lat, lng: c.center.lng })"
                />
              </li>
              <li v-if="!cities.length">
                <p class="px-2 py-1 text-xs text-neutral-400">该省暂无城市数据</p>
              </li>
            </template>
            <template v-else>
              <li v-for="p in provinces" :key="p.adcode">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  class="w-full justify-start"
                  :label="p.name"
                  @click="selectProvince(p)"
                />
              </li>
            </template>
          </ul>
          <p v-else class="py-2 text-center text-xs text-neutral-400">加载中…</p>
        </div>
      </div>
    </template>
  </UPopover>
</template>
