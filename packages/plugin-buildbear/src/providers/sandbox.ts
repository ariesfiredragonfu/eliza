import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { readSandboxStatus } from "../rpc.ts";

export const sandboxProvider: Provider = {
    get: async (runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        const rpcUrl = runtime.getSetting("BUILDBEAR_RPC_URL");
        if (typeof rpcUrl !== "string" || rpcUrl.length === 0) {
            return "BUILDBEAR_RPC_URL is missing. Sandbox reads are stopped.";
        }

        try {
            const status = await readSandboxStatus(rpcUrl);
            return `BuildBear sandbox chain id ${status.chainId} (${status.chainIdDecimal}), latest block ${status.blockNumberDecimal}. Read-only context. No transaction was sent.`;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Sandbox status failed";
            return `Sandbox status is unavailable: ${message}`;
        }
    },
};
