import type { Plugin } from "@elizaos/core";
import { sandboxBalanceAction } from "./actions/sandboxBalance.ts";
import { sandboxCodeAction } from "./actions/sandboxCode.ts";
import { sandboxFaucetAction } from "./actions/sandboxFaucet.ts";
import { sandboxRefuseTxAction } from "./actions/sandboxRefuseTx.ts";
import { sandboxStatusAction } from "./actions/sandboxStatus.ts";
import { sandboxViewAction } from "./actions/sandboxView.ts";
import { sandboxProvider } from "./providers/sandbox.ts";

export {
    assertContractAddress,
    assertFaucetUrl,
    assertSandboxRpcUrl,
    assertTestAddress,
    decodeViewResult,
    faucetInstructions,
    findContractAddress,
    findViewFunction,
    formatWei,
    isFundMovingRequest,
    readSandboxBalance,
    readSandboxCode,
    readSandboxStatus,
    readSandboxView,
    summarizeBytecode,
    viewCallData,
} from "./rpc.ts";

export const buildbearPlugin: Plugin = {
    name: "buildbear",
    description:
        "Read-only local sandbox (localhost RPC) status, balance, faucet instructions, contract code, and view calls. The provider supplies chain id and latest block. No transfers, swaps, or bridges.",
    actions: [
        sandboxStatusAction,
        sandboxBalanceAction,
        sandboxFaucetAction,
        sandboxCodeAction,
        sandboxViewAction,
        sandboxRefuseTxAction,
    ],
    evaluators: [],
    providers: [sandboxProvider],
    services: [],
};

export default buildbearPlugin;
