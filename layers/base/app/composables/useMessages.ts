/**
 * 站内消息（message-plugin shop API）。
 *
 * 客户端构建/鉴权/渠道/语言头约定与 useCoupon.ts 完全一致：运行时字符串查询（graphql-request）
 * 而非 nuxt-graphql-client codegen；登录态 authStore token → 游客 cookie 会话。
 */
import { GraphQLClient } from "graphql-request";
import { useAuthStore } from "../../stores/useAuthStore";
import {
  VENDURE_AUTH_HEADER,
  readVendureSessionToken,
  writeVendureSessionToken,
} from "../utils/vendure-session";

export interface MyMessage {
  id: string;
  messageId: string;
  title: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
}

const VENDURE_LOCALE_MAP: Record<string, string> = {
  "zh-CN": "zh_Hans",
  en: "en",
  bg: "bg_BG",
  ru: "ru_RU",
  fa: "fa_IR",
  de: "de_DE",
  es: "es_ES",
  fr: "fr_FR",
  it: "it_IT",
  pt: "pt_BR",
  ja: "ja_JP",
  ko: "ko_KR",
};

function toVendureLocale(locale: string): string {
  return VENDURE_LOCALE_MAP[locale] ?? locale;
}

/** 只读当前 locale；不可在事件回调里直接 `useI18n()`（会因无 setup 上下文抛 vue-i18n 26）。 */
function readLocale(): string {
  try {
    const $i18n = useNuxtApp().$i18n as
      | { global?: { locale?: { value?: string } }; locale?: { value?: string } }
      | undefined;
    return $i18n?.global?.locale?.value ?? $i18n?.locale?.value ?? "zh-CN";
  } catch {
    try {
      return useI18n().locale.value;
    } catch {
      return "zh-CN";
    }
  }
}

function resolveClient(): GraphQLClient {
  const { token: channelToken } = useTenantChannel();
  const locale = readLocale();
  const gqlHost = useGqlHostUrl();
  const authStore = useAuthStore();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = authStore.session?.token ?? readVendureSessionToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (channelToken.value) headers["vendure-token"] = channelToken.value;
  if (locale) headers["Accept-Language"] = locale;

  const client = new GraphQLClient(`${gqlHost}?languageCode=${toVendureLocale(locale)}`, {
    headers,
    responseMiddleware: (response: any) => {
      const h = response?.headers ?? response?.response?.headers;
      const st =
        h?.get?.(VENDURE_AUTH_HEADER) ??
        h?.entries?.()?.find?.(
          ([k]: [string, string]) => k.toLowerCase() === VENDURE_AUTH_HEADER.toLowerCase(),
        )?.[1];
      if (st) writeVendureSessionToken(st);
    },
  });
  return client;
}

export async function getMyMessages(): Promise<MyMessage[]> {
  const client = resolveClient();
  const data = await client.request<{ myMessages: { items: MyMessage[] } }>(
    `query MyMessages { myMessages(options: { take: 50 }) { items { id messageId title body readAt createdAt } totalItems } }`,
  );
  return data.myMessages.items;
}

export async function markMessageRead(id: string): Promise<void> {
  const client = resolveClient();
  await client.request(`mutation MarkMessageRead($id: ID!) { markMessageRead(id: $id) }`, { id });
}