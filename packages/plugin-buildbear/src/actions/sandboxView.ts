import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import {
    findContractAddress,
    findViewFunctions,
    isFundMovingRequest,
    readSandboxViews,
} from "../rpc.ts";

function messageText(message: Memory): string {
    const text = message.content?.text;
    return typeof text === "string" ? text : "";
}

const VIEW_HELP =
    "Say which function to read: name, symbol, decimals, or totalSupply, or ask for the token details. Include the contract address. This agent uses eth_call and does not send a transaction.";

export const sandboxViewAction: Action = {
    name: "SANDBOX_VIEW",
    similes: [
        "READ_VIEW",
        "CONTRACT_NAME",
        "TOTAL_SUPPLY",
        "TOKEN_DETAILS",
        "TOKEN_INFO",
    ],
    description:
        "Read public views on a BuildBear sandbox contract with eth_call: name, symbol, decimals, and totalSupply. One call reads every view the user names, and token details means name, symbol, and decimals. Does not send a transaction.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        const text = messageText(message);
        return (
            typeof rpcUrl === "string" &&
            rpcUrl.length > 0 &&
            findContractAddress(text) !== null &&
            findViewFunctions(text).length > 0 &&
            !isFundMovingRequest(text)
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
        const functionNames = findViewFunctions(text);
        if (!address || functionNames.length === 0) {
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
            const views = await readSandboxViews(
                String(rpcUrl),
                address,
                functionNames
            );
            const read = functionNames.filter((n) => n in views.values);
            const failed = functionNames.filter((n) => n in views.errors);
            const parts: string[] = [];
            if (read.length > 0) {
                parts.push(
                    `On ${views.address}: ${read
                        .map((n) => `${n}() = ${views.values[n]}`)
                        .join(", ")}.`
                );
            }
            for (const n of failed) {
                parts.push(`${n}() failed: ${views.errors[n]}`);
            }
            parts.push(
                read.length + failed.length > 1
                    ? "These were eth_calls. No transaction was sent."
                    : "This was an eth_call. No transaction was sent."
            );
            const reply = parts.join(" ");
            const success = read.length > 0;
            if (callback) {
                await callback({
                    text: reply,
                    content: {
                        success,
                        address: views.address,
                        values: views.values,
                        errors: views.errors,
                    },
                });
            }
            return success;
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
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Look up the token 0x0000000000000000000000000000000000000001 name, symbol and decimals",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Reading name(), symbol(), and decimals() at that address with eth_call.",
                    action: "SANDBOX_VIEW",
                },
            },
        ],
    ],
};
