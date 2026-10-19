<script setup lang="ts">
/**
 * 券场景插画（券名关键词自动映射：台球/餐饮/饮品/通用，映射逻辑见 utils/coupon-mall.ts couponSceneArt）。
 * 纯内联 SVG，无外部资源。
 * - 默认（strip）：320x72 横条图，供首页券卡头图（与原 CouponStoreCouponCard 内联版本同几何，抽取复用）。
 * - tall：360x180 高构图头图，供独立券详情页首屏（条图拉伸会严重裁切，需独立构图）。
 */
withDefaults(defineProps<{ scene?: string; tall?: boolean }>(), {
  scene: "generic",
  tall: false,
});
</script>

<template>
  <!-- ── strip 320x72（券卡头图） ── -->
  <svg v-if="!tall && scene === 'billiards'" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="320" height="72" fill="#14532d" />
    <ellipse cx="160" cy="86" rx="210" ry="44" fill="#166534" />
    <circle cx="310" cy="6" r="14" fill="#0f3d22" />
    <circle cx="10" cy="66" r="14" fill="#0f3d22" />
    <circle cx="88" cy="30" r="14" fill="#facc15" />
    <circle cx="83" cy="25" r="4.5" fill="#fff" opacity=".8" />
    <circle cx="126" cy="44" r="14" fill="#ef4444" />
    <circle cx="121" cy="39" r="4.5" fill="#fff" opacity=".8" />
    <circle cx="166" cy="26" r="14" fill="#2563eb" />
    <circle cx="161" cy="21" r="4.5" fill="#fff" opacity=".8" />
    <circle cx="52" cy="50" r="7" fill="#f8fafc" />
    <rect x="196" y="30" width="120" height="4" rx="2" fill="#b45309" transform="rotate(-12 196 32)" />
    <rect x="196" y="30" width="16" height="4" rx="2" fill="#38bdf8" transform="rotate(-12 196 32)" />
  </svg>
  <svg v-else-if="!tall && scene === 'dining'" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="320" height="72" fill="#ea580c" />
    <ellipse cx="160" cy="88" rx="210" ry="44" fill="#f97316" />
    <circle cx="96" cy="40" r="26" fill="#fff7ed" />
    <circle cx="96" cy="40" r="17" fill="#fed7aa" />
    <circle cx="96" cy="40" r="8" fill="#fff7ed" />
    <rect x="150" y="22" width="26" height="30" rx="5" fill="#fff7ed" />
    <path d="M176 28h6a8 8 0 0 1 0 16h-6" fill="none" stroke="#fff7ed" stroke-width="4" />
    <rect x="204" y="16" width="4" height="42" rx="2" fill="#fff7ed" />
    <rect x="216" y="16" width="4" height="42" rx="2" fill="#fff7ed" />
    <circle cx="266" cy="46" r="12" fill="#fff7ed" />
  </svg>
  <svg v-else-if="!tall && scene === 'drink'" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="320" height="72" fill="#c8a27a" />
    <ellipse cx="160" cy="88" rx="210" ry="44" fill="#d9b990" />
    <rect x="122" y="16" width="64" height="7" rx="3.5" fill="#fff7ed" />
    <path d="M128 23h52l-6 35a8 8 0 0 1-8 7h-24a8 8 0 0 1-8-7z" fill="#fff7ed" />
    <path d="M133 34h42l-4 22a8 8 0 0 1-8 7h-18a8 8 0 0 1-8-7z" fill="#a16207" opacity=".55" />
    <rect x="148" y="2" width="5" height="20" rx="2.5" fill="#ef4444" transform="rotate(8 150 12)" />
    <circle cx="226" cy="40" r="10" fill="#fff7ed" opacity=".9" />
    <circle cx="250" cy="30" r="7" fill="#fff7ed" opacity=".7" />
  </svg>
  <svg v-else-if="!tall" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="320" height="72" fill="var(--ui-primary)" />
    <ellipse cx="160" cy="88" rx="210" ry="44" fill="#fff" opacity=".12" />
    <rect x="86" y="20" width="128" height="32" rx="8" fill="#fff" opacity=".95" />
    <circle cx="214" cy="36" r="7" fill="var(--ui-primary)" />
    <circle cx="86" cy="36" r="7" fill="var(--ui-primary)" />
    <line x1="160" y1="22" x2="160" y2="50" stroke="var(--ui-primary)" stroke-width="2" stroke-dasharray="4 4" />
    <rect x="102" y="30" width="32" height="4" rx="2" fill="var(--ui-primary)" opacity=".8" />
    <rect x="102" y="39" width="22" height="3" rx="1.5" fill="var(--ui-primary)" opacity=".5" />
    <rect x="172" y="30" width="26" height="3" rx="1.5" fill="var(--ui-primary)" opacity=".5" />
  </svg>

  <!-- ── tall 360x180（详情页头图） ── -->
  <svg v-else-if="scene === 'billiards'" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="360" height="180" fill="#14532d" />
    <ellipse cx="180" cy="212" rx="260" ry="82" fill="#166534" />
    <circle cx="352" cy="12" r="20" fill="#0f3d22" />
    <circle cx="8" cy="168" r="20" fill="#0f3d22" />
    <circle cx="106" cy="72" r="27" fill="#facc15" />
    <circle cx="97" cy="63" r="8.5" fill="#fff" opacity=".8" />
    <circle cx="182" cy="102" r="27" fill="#ef4444" />
    <circle cx="173" cy="93" r="8.5" fill="#fff" opacity=".8" />
    <circle cx="252" cy="56" r="27" fill="#2563eb" />
    <circle cx="243" cy="47" r="8.5" fill="#fff" opacity=".8" />
    <circle cx="66" cy="136" r="14" fill="#f8fafc" />
    <rect x="268" y="94" width="122" height="8" rx="4" fill="#b45309" transform="rotate(-14 268 98)" />
    <rect x="268" y="94" width="22" height="8" rx="4" fill="#38bdf8" transform="rotate(-14 268 98)" />
  </svg>
  <svg v-else-if="scene === 'dining'" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="360" height="180" fill="#ea580c" />
    <ellipse cx="180" cy="216" rx="260" ry="72" fill="#f97316" />
    <circle cx="118" cy="86" r="47" fill="#fff7ed" />
    <circle cx="118" cy="86" r="31" fill="#fed7aa" />
    <circle cx="118" cy="86" r="14" fill="#fff7ed" />
    <rect x="198" y="46" width="44" height="58" rx="9" fill="#fff7ed" />
    <path d="M246 58h12a15 15 0 0 1 0 30h-12" fill="none" stroke="#fff7ed" stroke-width="7" />
    <rect x="294" y="36" width="8" height="84" rx="4" fill="#fff7ed" />
    <rect x="314" y="36" width="8" height="84" rx="4" fill="#fff7ed" />
    <circle cx="324" cy="142" r="16" fill="#fff7ed" />
  </svg>
  <svg v-else-if="scene === 'drink'" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="360" height="180" fill="#c8a27a" />
    <ellipse cx="180" cy="216" rx="260" ry="72" fill="#d9b990" />
    <rect x="146" y="32" width="92" height="13" rx="6.5" fill="#fff7ed" />
    <path d="M155 45h74l-9 74a14 14 0 0 1-14 12h-28a14 14 0 0 1-14-12z" fill="#fff7ed" />
    <path d="M163 72h58l-6 42a12 12 0 0 1-12 10h-22a12 12 0 0 1-12-10z" fill="#a16207" opacity=".55" />
    <rect x="182" y="6" width="9" height="34" rx="4.5" fill="#ef4444" transform="rotate(8 186 20)" />
    <circle cx="288" cy="94" r="15" fill="#fff7ed" opacity=".9" />
    <circle cx="318" cy="66" r="10" fill="#fff7ed" opacity=".7" />
    <circle cx="74" cy="122" r="9" fill="#fff7ed" opacity=".8" />
  </svg>
  <svg v-else viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="360" height="180" fill="var(--ui-primary)" />
    <ellipse cx="180" cy="216" rx="260" ry="72" fill="#fff" opacity=".12" />
    <rect x="96" y="52" width="168" height="76" rx="12" fill="#fff" opacity=".95" />
    <circle cx="264" cy="90" r="9" fill="var(--ui-primary)" />
    <circle cx="96" cy="90" r="9" fill="var(--ui-primary)" />
    <line x1="180" y1="58" x2="180" y2="122" stroke="var(--ui-primary)" stroke-width="3" stroke-dasharray="6 6" />
    <rect x="118" y="74" width="46" height="8" rx="4" fill="var(--ui-primary)" opacity=".8" />
    <rect x="118" y="92" width="32" height="6" rx="3" fill="var(--ui-primary)" opacity=".5" />
    <rect x="198" y="74" width="40" height="6" rx="3" fill="var(--ui-primary)" opacity=".5" />
  </svg>
</template>

<style scoped>
svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
