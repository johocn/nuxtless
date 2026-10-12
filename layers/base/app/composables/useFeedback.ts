/**
 * 意见反馈（feedback-plugin shop API：createFeedback / myFeedbacks / markFeedbacksRead / unreadFeedbackCount）。
 * 复用 useMessages 的运行时客户端（登录态 Bearer / 渠道 / 语言头约定一致，与 useInbox 同款姿势）；
 * feedback 类型不在本地 graphql.schema.json 快照（快照已过期），故用字符串查询而非 codegen，
 * 响应统一按 unknown 返回，由调用方做防御式解析（参考 faq.vue）。
 */
import { resolveClient } from "./useMessages";

/** 提交反馈入参（type/contactWay 可选；imgs 本期不做） */
export interface CreateFeedbackInput {
  type?: string;
  title: string;
  content: string;
  contactWay?: string;
}

/** shop：我的反馈列表（分页），返回原始 myFeedbacks 载荷，防御式解析交给调用方 */
export async function fetchMyFeedbacks(skip: number, take: number): Promise<unknown> {
  const client = resolveClient();
  const data = await client.request<{ myFeedbacks?: unknown }>(
    `query MyFeedbacks($options: FeedbackListOptions) {
      myFeedbacks(options: $options) {
        items { id type title content status reply repliedAt repliedBy readAt createdAt }
        totalItems
      }
    }`,
    { options: { skip, take } },
  );
  return data.myFeedbacks ?? null;
}

/** shop：提交意见反馈（title ≤20、contactWay ≤30 由后端校验），失败抛错由调用方兜底 */
export async function createFeedback(input: CreateFeedbackInput): Promise<unknown> {
  const client = resolveClient();
  const data = await client.request<{ createFeedback?: unknown }>(
    `mutation CreateFeedback($input: CreateFeedbackInput!) {
      createFeedback(input: $input) { id status }
    }`,
    { input },
  );
  return data.createFeedback ?? null;
}

/** shop：全部反馈标记已读（幂等），失败抛错由调用方静默兜底 */
export async function markFeedbacksRead(): Promise<void> {
  const client = resolveClient();
  await client.request(`mutation MarkFeedbacksRead { markFeedbacksRead }`);
}

/** shop：未读数（readAt 为空且 status 非 pending），失败抛错由调用方静默兜底 */
export async function getUnreadFeedbackCount(): Promise<number> {
  const client = resolveClient();
  const data = await client.request<{ unreadFeedbackCount?: unknown }>(
    `query UnreadFeedbackCount { unreadFeedbackCount }`,
  );
  const n = Number(data.unreadFeedbackCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
