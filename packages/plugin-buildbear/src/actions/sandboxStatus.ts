import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import { isFundMovingRequest, readSandboxStatus } from "../rpc.ts";

export const sandboxStatusAction: Action = {
    name: "SANDBOX_STATUS",
    similes: ["CHECK_SANDBOX", "CHAIN_ID", "SANDBOX_BLOCK"],
    description:
        "Read the BuildBear sandbox chain id and latest block from BUILDBEAR_RPC_URL. Read-only. Does not send a transaction.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        const text = message?.content?.text;
        return (
            typeof rpcUrl === "string" &&
            rpcUrl.length > 0 &&
            !isFundMovingRequest(typeof text === "string" ? text : "")
        );
    },
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        try {
            const status = await readSandboxStatus(String(rpcUrl));
            const faucet = runtime.getSetting("BUILDBEAR_FAUCET_URL");
            const faucetNote =
                typeof faucet === "string" && faucet.length > 0
                    ? " Faucet URL is configured. A person requests the drip; this agent does not."
                    : "";
            const text = `Sandbox chain id ${status.chainId} (${status.chainIdDecimal}), block ${status.blockNumberDecimal}.${faucetNote}`;
            if (callback) {
                await callback({
                    text,
                    content: { success: true, ...status },
                });
            }
            return true;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Sandbox status failed";
            if (callback) {
                await callback({
                    text: message,
                    content: { error: message },
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "What chain is the sandbox on?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Checking the sandbox RPC.",
                    action: "SANDBOX_STATUS",
                },
            },
        ],
    ],
};
