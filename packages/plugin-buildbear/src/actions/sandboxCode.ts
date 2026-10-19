import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import {
    findContractAddress,
    isFundMovingRequest,
    readSandboxCode,
} from "../rpc.ts";

function messageText(message: Memory): string {
    const text = message.content?.text;
    return typeof text === "string" ? text : "";
}

export const sandboxCodeAction: Action = {
    name: "SANDBOX_CODE",
    similes: ["READ_CONTRACT", "CONTRACT_CODE", "GET_CODE"],
    description:
        "Read contract bytecode stored at an address on the BuildBear sandbox with eth_getCode. Read-only. Does not send a transaction or call a contract.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        return (
            typeof rpcUrl === "string" &&
            rpcUrl.length > 0 &&
            findContractAddress(messageText(message)) !== null &&
            !isFundMovingRequest(messageText(message))
        );
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        const address = findContractAddress(messageText(message));
        if (!address) {
            const text =
                "Give a contract address, 0x followed by 40 hex characters. This agent reads code stored on the sandbox and does not send a transaction.";
            if (callback) {
                await callback({
                    text,
                    content: { error: text },
                });
            }
            return false;
        }

        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        try {
            const code = await readSandboxCode(String(rpcUrl), address);
            const text = code.hasCode
                ? `Address ${code.address} has contract code on the sandbox, ${code.byteLength} bytes, starting ${code.preview}. This is stored code. No transaction was sent.`
                : `Address ${code.address} has no contract code on the sandbox. No transaction was sent.`;
            if (callback) {
                await callback({
                    text,
                    content: { success: true, ...code },
                });
            }
            return true;
        } catch (error) {
            const errorText =
                error instanceof Error ? error.message : "Sandbox code read failed";
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
                    text: "Does 0x0000000000000000000000000000000000000001 have contract code on the sandbox?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Reading the code stored at that address.",
                    action: "SANDBOX_CODE",
                },
            },
        ],
    ],
};
