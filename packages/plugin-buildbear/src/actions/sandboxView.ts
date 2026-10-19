import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import {
    findContractAddress,
    findViewFunction,
    readSandboxView,
} from "../rpc.ts";

function messageText(message: Memory): string {
    const text = message.content?.text;
    return typeof text === "string" ? text : "";
}

const VIEW_HELP =
    "Say which function to read: name, symbol, decimals, or totalSupply. Include the contract address. This agent uses eth_call and does not send a transaction.";

export const sandboxViewAction: Action = {
    name: "SANDBOX_VIEW",
    similes: ["READ_VIEW", "CONTRACT_NAME", "TOTAL_SUPPLY"],
    description:
        "Read one public view on a BuildBear sandbox contract with eth_call. Allowed functions are name, symbol, decimals, and totalSupply. Does not send a transaction.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        const text = messageText(message);
        return (
            typeof rpcUrl === "string" &&
            rpcUrl.length > 0 &&
            findContractAddress(text) !== null &&
            findViewFunction(text) !== null
        );
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        const text = messageText(message);
        const address = findContractAddress(text);
        const functionName = findViewFunction(text);
        if (!address || !functionName) {
            if (callback) {
                await callback({
                    text: VIEW_HELP,
                    content: { error: VIEW_HELP },
                });
            }
            return false;
        }

        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        try {
            const view = await readSandboxView(
                String(rpcUrl),
                address,
                functionName
            );
            const reply = `${view.functionName}() on ${view.address} returned ${view.value}. This was an eth_call. No transaction was sent.`;
            if (callback) {
                await callback({
                    text: reply,
                    content: { success: true, ...view },
                });
            }
            return true;
        } catch (error) {
            const errorText =
                error instanceof Error ? error.message : "Sandbox view call failed";
            if (callback) {
                await callback({
                    text: errorText,
                    content: { error: errorText },
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What is the name of 0x0000000000000000000000000000000000000001?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Reading name() at that address.",
                    action: "SANDBOX_VIEW",
                },
            },
        ],
    ],
};
