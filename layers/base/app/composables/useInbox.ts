/**
 * 站内通知（notification-plugin shop API：myInbox / inboxUnreadCount / markInboxRead）。
 * 复用 useMessages 的运行时客户端（鉴权/渠道/语言头约定一致）；
 * notification 类型不在本地 graphql.schema.json，故用字符串查询而非 codegen。
 */
import { resolveClient } from "./useMessages";

export interface InboxItem {
  id: string;
  scene: string;
  title: string;
  content: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

/** 顾客收件箱（myInbox 无 options 入参，服务端返回全部） */
export async function getMyInbox(): Promise<InboxItem[]> {
  const client = resolveClient();
  const data = await client.request<{ myInbox: { items: InboxItem[]; totalItems: number } }>(
    `query MyInbox { myInbox { items { id scene title content link isRead createdAt } totalItems } }`,
  );
  return data.myInbox.items;
}

export async function getInboxUnreadCount(): Promise<number> {
  const client = resolveClient();
  const data = await client.request<{ inboxUnreadCount: number }>(`query InboxUnreadCount { inboxUnreadCount }`);
  return data.inboxUnreadCount ?? 0;
}

export async function markInboxRead(id: string): Promise<void> {
  const client = resolveClient();
  await client.request(`mutation MarkInboxRead($id: ID!) { markInboxRead(id: $id) }`, { id });
}
