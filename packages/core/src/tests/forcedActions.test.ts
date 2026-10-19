import { describe, it, expect, vi } from "vitest";
import { AgentRuntime } from "../runtime";
import type { Action, Memory } from "../types";

function action(name: string, opts: Partial<Action> = {}): Action {
    return {
        name,
        similes: [],
        description: name,
        examples: [],
        validate: vi.fn(async () => true),
        handler: vi.fn(async () => true),
        ...opts,
    } as Action;
}

function memory(text: string, actionName?: string): Memory {
    return {
        userId: "00000000-0000-0000-0000-000000000001",
        agentId: "00000000-0000-0000-0000-000000000002",
        roomId: "00000000-0000-0000-0000-000000000003",
        content: { text, action: actionName },
    } as Memory;
}

async function run(actions: Action[], userText: string, picked?: string) {
    const fakeRuntime = { actions } as unknown as AgentRuntime;
    const response = memory("model reply", picked);
    await AgentRuntime.prototype.processActions.call(
        fakeRuntime,
        memory(userText),
        [response],
        undefined,
        undefined
    );
    return response;
}

describe("forceWhenValid actions", () => {
    const isSend = async (_rt: unknown, m: Memory) => /\bsend\b/i.test(m.content.text);

    it("overrides NONE when the forced action validates", async () => {
        const none = action("NONE");
        const refuse = action("REFUSE_TX", { forceWhenValid: true, validate: vi.fn(isSend) });
        const response = await run([none, refuse], "send 1 ETH", "NONE");
        expect(response.content.action).toBe("REFUSE_TX");
        expect(refuse.handler).toHaveBeenCalledTimes(1);
        expect(none.handler).not.toHaveBeenCalled();
    });

    it("overrides another action and an empty action", async () => {
        const status = action("SANDBOX_STATUS");
        const refuse = action("REFUSE_TX", { forceWhenValid: true, validate: vi.fn(isSend) });
        const picked = await run([status, refuse], "send 1 ETH", "SANDBOX_STATUS");
        expect(picked.content.action).toBe("REFUSE_TX");
        expect(status.handler).not.toHaveBeenCalled();
        const empty = await run([status, refuse], "send 1 ETH", "");
        expect(empty.content.action).toBe("REFUSE_TX");
        expect(refuse.handler).toHaveBeenCalledTimes(2);
    });

    it("leaves the model's action alone when validate fails", async () => {
        const view = action("SANDBOX_VIEW");
        const refuse = action("REFUSE_TX", { forceWhenValid: true, validate: vi.fn(isSend) });
        const response = await run([view, refuse], "token name please", "SANDBOX_VIEW");
        expect(response.content.action).toBe("SANDBOX_VIEW");
        expect(view.handler).toHaveBeenCalledTimes(1);
        expect(refuse.handler).not.toHaveBeenCalled();
    });

    it("ignores actions without forceWhenValid even if they validate", async () => {
        const status = action("SANDBOX_STATUS");
        const other = action("OTHER");
        const response = await run([status, other], "send 1 ETH", "SANDBOX_STATUS");
        expect(response.content.action).toBe("SANDBOX_STATUS");
        expect(other.handler).not.toHaveBeenCalled();
    });
});
