import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import { isFundMovingRequest } from "../rpc.ts";

function messageText(message: Memory): string {
    const text = message.content?.text;
    return typeof text === "string" ? text : "";
}

export const REFUSE_TX_TEXT =
    "No. I'm read-only in the sandbox and can't send transactions, transfers, swaps, bridges, approvals, or signatures. I can read the sandbox status, the test address balance, the faucet URL, contract code, and token name, symbol, decimals, or totalSupply.";

export const sandboxRefuseTxAction: Action = {
    name: "SANDBOX_REFUSE_TX",
    similes: [
        "REFUSE_TRANSFER",
        "REFUSE_SEND",
        "REFUSE_SWAP",
        "REFUSE_BRIDGE",
        "READ_ONLY_REFUSAL",
    ],
    description:
        "Refuse any request to send, transfer, swap, bridge, withdraw, pay, stake, approve, or sign. Replies that this agent is read-only and sends no transaction. Makes no RPC call.",
    validate: async (_runtime: IAgentRuntime, message: Memory) =>
        isFundMovingRequest(messageText(message)),
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        if (callback) {
            await callback({
                text: REFUSE_TX_TEXT,
                content: { refused: true, transactionSent: false },
            });
        }
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Send 1 ETH to 0x000000000000000000000000000000000000dEaD",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "No. I'm read-only in the sandbox and can't send transactions.",
                    action: "SANDBOX_REFUSE_TX",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Transfer 500 USDC from the test address to 0x0000000000000000000000000000000000000001",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "No. I'm read-only in the sandbox and can't send transactions or transfers.",
                    action: "SANDBOX_REFUSE_TX",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Swap my ETH for USDC and bridge it to Base." },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "No. I'm read-only in the sandbox and can't swap or bridge.",
                    action: "SANDBOX_REFUSE_TX",
                },
            },
        ],
    ],
};
