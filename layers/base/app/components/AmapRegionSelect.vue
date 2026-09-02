<script setup lang="ts">
import type { DistrictNode } from "~~/.nuxt/gql/default";
import type { RegionValue } from "~~/types/region";
import type { ReverseGeocodeInfo } from "~~/types/location";

// ===== 高德行政区划三级联动（省→市→区 下钻；街道并入详细地址）=====
// 供结账表单（AddressForm.vue）与账号地址弹窗（AddressFormModal.vue）共享复用，
// 二者不再各自维护一份级联逻辑。

const region = defineModel<RegionValue>("region", {
  default: (): RegionValue => ({
    province: "",
    city: "",
    district: "",
    street: "",
  }),
});
const countryCode = defineModel<string>("countryCode", { default: "" });
const props = withDefaults(
  defineProps<{
    countries: { label: string; code: string }[];
    disabled?: boolean;
    showCountry?: boolean;
  }>(),
  { disabled: false, showCountry: true },
);

const { t } = useI18n();

interface LevelList {
  current: string;
  items: DistrictNode[];
}
const provinceSel = ref<LevelList>({ current: "", items: [] });
const citySel = ref<LevelList>({ current: "", items: [] });
const districtSel = ref<LevelList>({ current: "", items: [] });
const streetSel = ref<LevelList>({ current: "", items: [] });
const districtsLoading = ref(false);

/** 归一化：去掉省/市/区/县等行政后缀，便于地址簿“北京市”与高德节点“北京”比对 */
function normName(n: string | null | undefined): string {
  if (!n) return "";
  return n
    .trim()
    .replace(/省|市|区|县|自治州|自治区|自治县|地区|特别行政区|盟|旗$/g, "");
}

function syncModel() {
  region.value = {
    province: provinceSel.value.current,
    city: citySel.value.current,
    district: districtSel.value.current,
    street: streetSel.value.current,
  };
}

function fullAddress(): string {
  return [provinceSel.value.current, citySel.value.current, districtSel.value.current, streetSel.value.current]
    .filter(Boolean)
    .join(" ");
}

async function loadDistrict(parentAdcode: string | null, target: LevelList) {
  districtsLoading.value = true;
  try {
    const { mapDistricts } = await GqlGetMapDistricts({ parentAdcode });
    target.items = (mapDistricts ?? []) as DistrictNode[];
  } finally {
    districtsLoading.value = false;
  }
}

async function loadSub(node: DistrictNode | undefined, reset: LevelList[], target: LevelList) {
  for (const l of reset) {
    l.current = "";
    l.items = [];
  }
  if (node) await loadDistrict(node.adcode, target);
}

function nodeBy(
  level: LevelList,
  name: string,
): DistrictNode | undefined {
  return level.items.find((x) => normName(x.name) === normName(name));
}

async function onProvinceChange(v: string) {
  await loadSub(nodeBy(provinceSel.value, v), [citySel.value, districtSel.value, streetSel.value], citySel.value);
  syncModel();
}

async function onCityChange(v: string) {
  await loadSub(nodeBy(citySel.value, v), [districtSel.value, streetSel.value], districtSel.value);
  syncModel();
}

async function onDistrictChange(v: string) {
  await loadSub(nodeBy(districtSel.value, v), [streetSel.value], streetSel.value);
  syncModel();
}

// 在给定候选名中尽量找到匹配节点（归一化精确→包含；仅剩一项自动选中）
function pickBest(level: LevelList, ...names: Array<string | null | undefined>): DistrictNode | null {
  if (!level.items.length) return null;
  const candidates = names.filter(Boolean) as string[];
  for (const raw of candidates) {
    const n = normName(raw);
    if (!n) continue;
    const exact = level.items.find((x) => normName(x.name) === n);
    if (exact) return exact;
    const incl = level.items.find(
      (x) => normName(x.name).includes(n) || n.includes(normName(x.name)),
    );
    if (incl) return incl;
  }
  if (level.items.length === 1) return level.items[0] ?? null;
  return null;
}

// 按定位逆地理结果（geo）自动默认选中 省→市→区（街道唯一项也自动选）
async function cascadeGeo(geo: ReverseGeocodeInfo) {
  const firstNode = citySel.value.items[0];
  const isMunicipality = !!firstNode && firstNode.level !== "city";

  const cityNode = pickBest(citySel.value, ...(isMunicipality ? [geo.district, geo.city] : [geo.city]));
  if (cityNode) citySel.value.current = cityNode.name;
  else if (citySel.value.items.length === 1) citySel.value.current = citySel.value.items[0]?.name ?? "";
  else return;

  const cityAnchor = nodeBy(citySel.value, citySel.value.current)!;
  if (isMunicipality) {
    // 直辖市：cityNode 实为区/县，其子级即街道
    await loadDistrict(cityAnchor.adcode, streetSel.value);
  } else {
    await loadDistrict(cityAnchor.adcode, districtSel.value);
    const distNode = pickBest(districtSel.value, geo.district);
    if (distNode) {
      districtSel.value.current = distNode.name;
      await loadDistrict(distNode.adcode, streetSel.value);
    } else if (districtSel.value.items.length === 1) {
      districtSel.value.current = districtSel.value.items[0]?.name ?? "";
    }
  }

  const streetNode = pickBest(streetSel.value, geo.street);
  if (streetNode) streetSel.value.current = streetNode.name;
  else if (streetSel.value.items.length === 1) streetSel.value.current = streetSel.value.items[0]?.name ?? "";

  syncModel();
}

// 从已有状态恢复三级下拉（逐级加载子级选项并回填 current）
async function applyValue(value: RegionValue | undefined | null) {
  if (!value) return;
  await loadDistrict(null, provinceSel.value);
  const prov = pickBest(provinceSel.value, value.province);
  if (prov) {
    provinceSel.value.current = prov.name;
    await loadDistrict(prov.adcode, citySel.value);
    const city = pickBest(citySel.value, value.city);
    if (city) {
      citySel.value.current = city.name;
      await loadDistrict(city.adcode, districtSel.value);
      const district = pickBest(districtSel.value, value.district);
      if (district) {
        districtSel.value.current = district.name;
        await loadDistrict(district.adcode, streetSel.value);
        const street = pickBest(streetSel.value, value.street);
        if (street) streetSel.value.current = street.name;
      }
    }
  }
  syncModel();
}

// 默认省/市：优先完整逆地理 geo；失败用首页定位城市兜底（仅回填市）
async function preselectByLocation(geo: ReverseGeocodeInfo | null, fallbackCity: string | null) {
  if (provinceSel.value.items.length === 0) {
    await loadDistrict(null, provinceSel.value);
  }
  if (!geo) {
    if (fallbackCity && !region.value.city) region.value.city = fallbackCity;
    syncModel();
    return;
  }
  const prov = pickBest(provinceSel.value, geo.province);
  if (!prov) return;
  provinceSel.value.current = prov.name;
  await loadDistrict(prov.adcode, citySel.value);
  await cascadeGeo(geo);
}

defineExpose({
  fullAddress,
  applyValue,
  preselectByLocation,
  selected: () => ({ ...region.value }),
});
</script>

<template>
  <div class="col-span-2 grid grid-cols-4 gap-2">
    <UFormField v-if="showCountry" :label="t('messages.billing.country')" name="countryCode" class="w-full min-w-0" size="xl">
      <USelectMenu
        v-model="countryCode"
        value-key="code"
        :items="countries"
        :disabled="disabled"
        class="w-full min-w-0"
      />
    </UFormField>

    <UFormField :label="t('messages.billing.province')" name="province" class="w-full min-w-0" size="xl">
      <USelectMenu
        :model-value="provinceSel.current"
        :items="provinceSel.items.map((p) => p.name)"
        :disabled="disabled || districtsLoading"
        @update:model-value="onProvinceChange"
        class="w-full min-w-0"
      />
    </UFormField>

    <UFormField :label="t('messages.billing.city')" name="city" class="w-full min-w-0" size="xl">
      <USelectMenu
        :model-value="citySel.current"
        :items="citySel.items.map((c) => c.name)"
        :disabled="disabled || districtsLoading"
        @update:model-value="onCityChange"
        class="w-full min-w-0"
      />
    </UFormField>

    <UFormField :label="t('messages.billing.district')" name="district" class="w-full min-w-0" size="xl">
      <USelectMenu
        :model-value="districtSel.current"
        :items="districtSel.items.map((d) => d.name)"
        :disabled="disabled || districtsLoading"
        @update:model-value="onDistrictChange"
        class="w-full min-w-0"
      />
    </UFormField>
  </div>
  <p v-if="districtsLoading" class="col-span-2 -mt-2 text-xs text-neutral-400">
    {{ t("messages.billing.loadingDistricts") }}
  </p>
</template>

<style lang="css" scoped></style>