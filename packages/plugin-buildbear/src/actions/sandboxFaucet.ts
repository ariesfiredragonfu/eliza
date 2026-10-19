import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import { faucetInstructions } from "../rpc.ts";

export const sandboxFaucetAction: Action = {
    name: "SANDBOX_FAUCET",
    similes: ["FAUCET_HELP", "GET_TEST_ETH", "SANDBOX_DRIP"],
    description:
        "Tell a person the BuildBear sandbox faucet URL and that they request the drip in the dashboard. Does not call the faucet or send a transaction.",
    validate: async (runtime: IAgentRuntime) => {
        const faucetUrl = runtime.getSetting("BUILDBEAR_FAUCET_URL");
        return typeof faucetUrl === "string" && faucetUrl.length > 0;
    },
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        const faucetUrl = runtime.getSetting("BUILDBEAR_FAUCET_URL");
        try {
            const instructions = faucetInstructions(String(faucetUrl));
            if (callback) {
                await callback({
                    text: instructions.text,
                    content: { success: true, url: instructions.url },
                });
            }
            return true;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Sandbox faucet failed";
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
                content: { text: "How do I get test ETH on the sandbox?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "The faucet URL is in the settings. Open it and request the drip yourself.",
                    action: "SANDBOX_FAUCET",
                },
            },
        ],
    ],
};
