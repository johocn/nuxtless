import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../useMessages", () => ({ resolveClient: () => ({ request }) }));

import { markInboxRead } from "../useInbox";

describe("markInboxRead", () => {
  beforeEach(() => request.mockReset());

  it("mutation 带选择集，并把 id 作为变量传入", async () => {
    request.mockResolvedValueOnce({ markInboxRead: { id: "m1", isRead: true } });

    await markInboxRead("m1");

    const [document, variables] = request.mock.calls[0];
    // markInboxRead 返回 InboxMessage!，无选择集会被 GraphQL 直接判为非法文档。
    expect(document).toContain("markInboxRead(id: $id) { id isRead }");
    expect(variables).toEqual({ id: "m1" });
  });
});
