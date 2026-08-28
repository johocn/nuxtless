import { zhMessages } from "./zh-CN";

/** 是否为普通对象（非 null、非数组） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 递归深合并：以 base 为基底，override 覆盖之。
 * 纯对象递归合并；数组 / 标量直接整值替换。返回新对象，不改动入参。
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const baseValue = base[key];
    const overrideValue = override[key];
    out[key] =
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? deepMerge(baseValue, overrideValue)
        : overrideValue;
  }
  return out as T;
}

/**
 * 生成带中文兜底的各语言 messages。
 *
 * 背景：@nuxtjs/i18n 在语言包懒加载模式下，vue-i18n 的 fallbackLocale 回退并不可靠，
 * 当某语言缺失词条（如新增的 nav / detail / checkout 区块未同步到该语言包）时，
 * 页面会直接显示原始 key（messages.nav.xxx），而非回退到默认语言。
 *
 * 方案：以「完整的中文 messages（zhMessages）」为兜底基底，递归合并本语言的本地化覆盖。
 * 本语言已翻译的词条覆盖中文；缺失 / 未翻译词条天然回退到中文，从根本上规避 fallback 失效。
 *
 * 用法：`export default defineI18nLocale(() => zhFallbackLocale({ ...本语言覆盖... }));`
 */
export function zhFallbackLocale<N extends Record<string, unknown>>(
  overrides: N,
) {
  return {
    messages: deepMerge(
      structuredClone(zhMessages) as Record<string, unknown>,
      overrides as unknown as Record<string, unknown>,
    ),
  };
}