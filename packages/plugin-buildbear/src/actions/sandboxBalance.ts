import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import { readSandboxBalance } from "../rpc.ts";

export const sandboxBalanceAction: Action = {
    name: "SANDBOX_BALANCE",
    similes: ["CHECK_BALANCE", "TEST_ADDRESS_BALANCE"],
    description:
        "Read the native balance of BUILDBEAR_TEST_ADDRESS on the BuildBear sandbox. Read-only. Does not send a transaction.",
    validate: async (runtime: IAgentRuntime) => {
        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        const address = runtime.getSetting("BUILDBEAR_TEST_ADDRESS");
        return (
            typeof rpcUrl === "string" &&
            rpcUrl.length > 0 &&
            typeof address === "string" &&
            address.length > 0
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
        const address = runtime.getSetting("BUILDBEAR_TEST_ADDRESS");
        try {
            const balance = await readSandboxBalance(
                String(rpcUrl),
                String(address)
            );
            const text = `Sandbox balance for ${balance.address} is ${balance.ether} ETH (wei ${balance.wei}).`;
            if (callback) {
                await callback({
                    text,
                    content: { success: true, ...balance },
                });
            }
            return true;
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Sandbox balance failed";
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
                content: { text: "What is the test address balance?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Reading the sandbox balance.",
                    action: "SANDBOX_BALANCE",
                },
            },
        ],
    ],
};
