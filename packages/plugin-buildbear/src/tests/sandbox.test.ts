import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sandboxProvider } from "../providers/sandbox.ts";
import {
    assertFaucetUrl,
    assertSandboxRpcUrl,
    assertTestAddress,
    decodeViewResult,
    faucetInstructions,
    findContractAddress,
    findViewFunction,
    findViewFunctions,
    formatWei,
    readSandboxCode,
    readSandboxStatus,
    readSandboxView,
    readSandboxViews,
    summarizeBytecode,
    viewCallData,
} from "../rpc.ts";

const ADDRESS = `0x${"11".repeat(20)}`;
const PRIVATE_KEY = `0x${"ab".repeat(32)}`;

function runtimeWith(rpcUrl: string | null): IAgentRuntime {
    return {
        getSetting(key: string) {
            if (key === "BUILDBEAR_RPC_URL") {
                return rpcUrl;
            }
            return null;
        },
    } as IAgentRuntime;
}

function mockRpc(results: Record<string, string>) {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
            method: string;
        };
        const result = results[body.method];
        if (result === undefined) {
            throw new Error(`unexpected method ${body.method}`);
        }
        return {
            ok: true,
            json: async () => ({ result }),
        };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("sandbox URL and address checks", () => {
    it("rejects a URL that is not a URL", () => {
        expect(() => assertSandboxRpcUrl("not a url")).toThrow(
            /not a valid URL/
        );
    });

    it("rejects a public host that is not BuildBear", () => {
        expect(() =>
            assertSandboxRpcUrl("https://mainnet.infura.io/v3/key")
        ).toThrow(/BuildBear sandbox RPC or localhost/);
    });

    it("rejects a host that only looks like BuildBear", () => {
        expect(() =>
            assertSandboxRpcUrl("https://rpc.buildbear.io.evil.com")
        ).toThrow(/BuildBear sandbox RPC or localhost/);
    });

    it("rejects a BuildBear RPC that is not https", () => {
        expect(() => assertSandboxRpcUrl("http://rpc.buildbear.io/node")).toThrow(
            /must use https/
        );
    });

    it("accepts a BuildBear https RPC and a localhost RPC", () => {
        expect(
            assertSandboxRpcUrl("https://rpc.buildbear.io/node").hostname
        ).toBe("rpc.buildbear.io");
        expect(assertSandboxRpcUrl("http://127.0.0.1:8545").hostname).toBe(
            "127.0.0.1"
        );
    });

    it("rejects a faucet URL that is not https or not BuildBear", () => {
        expect(() =>
            assertFaucetUrl("http://faucet.buildbear.io/sandbox")
        ).toThrow(/must use https/);
        expect(() => assertFaucetUrl("https://faucet.example/sandbox")).toThrow(
            /BuildBear faucet or dashboard URL/
        );
    });

    it("returns faucet steps and stops", () => {
        const instructions = faucetInstructions(
            "https://faucet.buildbear.io/sandbox"
        );
        expect(instructions.url).toBe("https://faucet.buildbear.io/sandbox");
        expect(instructions.text).toContain("does not submit the drip");
    });

    it("rejects a short or non-hex test address", () => {
        expect(() => assertTestAddress("0x1234")).toThrow(
            /20-byte hex address/
        );
        expect(() => assertTestAddress(`0x${"gg".repeat(20)}`)).toThrow(
            /20-byte hex address/
        );
    });

    it("accepts a 20-byte test address", () => {
        expect(assertTestAddress(ADDRESS)).toBe(ADDRESS);
    });

    it("does not treat a longer hex string as an address", () => {
        expect(findContractAddress(`key ${PRIVATE_KEY}`)).toBeNull();
        expect(findContractAddress(`code at ${ADDRESS}.`)).toBe(ADDRESS);
    });
});

describe("bytecode summary", () => {
    it("treats empty code as no contract", () => {
        expect(summarizeBytecode("0x")).toEqual({
            hasCode: false,
            byteLength: 0,
            preview: "0x",
        });
    });

    it("rejects an odd-length hex string", () => {
        expect(() => summarizeBytecode("0x123")).toThrow(/odd length/);
    });

    it("keeps the preview to the first 32 bytes", () => {
        const summary = summarizeBytecode(`0x${"ab".repeat(40)}`);
        expect(summary.hasCode).toBe(true);
        expect(summary.byteLength).toBe(40);
        expect(summary.preview).toBe(`0x${"ab".repeat(32)}`);
    });
});

function abiString(value: string): string {
    const bytes = Buffer.from(value, "utf8");
    const offset = "20".padStart(64, "0");
    const length = bytes.length.toString(16).padStart(64, "0");
    const data = bytes.toString("hex").padEnd(64, "0");
    return `0x${offset}${length}${data}`;
}

function abiUint(value: bigint): string {
    return `0x${value.toString(16).padStart(64, "0")}`;
}

describe("view calls", () => {
    it("picks the function named first and ignores a longer hex string", () => {
        expect(findViewFunction(`symbol and name of ${ADDRESS}`)).toBe(
            "symbol"
        );
        expect(findViewFunction(`total supply of ${ADDRESS}`)).toBe(
            "totalSupply"
        );
        expect(findViewFunction(`username ${ADDRESS}`)).toBeNull();
        expect(findViewFunction(`key ${PRIVATE_KEY} name`)).toBe("name");
        expect(findContractAddress(`key ${PRIVATE_KEY} name`)).toBeNull();
    });

    it("finds every named view in order, and token details as three", () => {
        expect(
            findViewFunctions(`${ADDRESS} name, symbol and decimals`)
        ).toEqual(["name", "symbol", "decimals"]);
        expect(findViewFunctions(`decimals and name of ${ADDRESS}`)).toEqual(
            ["decimals", "name"]
        );
        expect(findViewFunctions(`token details for ${ADDRESS}`)).toEqual([
            "name",
            "symbol",
            "decimals",
        ]);
        expect(findViewFunctions(`username ${ADDRESS}`)).toEqual([]);
    });

    it("uses the four standard selectors and no arguments", () => {
        expect(viewCallData("name")).toBe("0x06fdde03");
        expect(viewCallData("symbol")).toBe("0x95d89b41");
        expect(viewCallData("decimals")).toBe("0x313ce567");
        expect(viewCallData("totalSupply")).toBe("0x18160ddd");
    });

    it("decodes a string, a bytes32 name, and integers", () => {
        expect(decodeViewResult("name", abiString("Widget"))).toBe("Widget");
        const word = Buffer.alloc(32);
        Buffer.from("MKR").copy(word);
        expect(decodeViewResult("name", `0x${word.toString("hex")}`)).toBe(
            "MKR"
        );
        expect(decodeViewResult("decimals", abiUint(18n))).toBe("18");
        expect(decodeViewResult("totalSupply", abiUint(1000n))).toBe("1000");
    });

    it("rejects empty and odd view results", () => {
        expect(() => decodeViewResult("name", "0x")).toThrow(/no data/);
        expect(() => decodeViewResult("decimals", "0x123")).toThrow(
            /odd length/
        );
    });

    it("calls eth_call with the address and selector only", async () => {
        const fetchMock = mockRpc({
            eth_call: abiString("Widget"),
        });

        const view = await readSandboxView(
            "http://127.0.0.1:8545",
            ADDRESS,
            "name"
        );

        expect(view.value).toBe("Widget");
        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(init.body)) as {
            method: string;
            params: [{ to: string; data: string }, string];
        };
        expect(body.method).toBe("eth_call");
        expect(body.params).toEqual([
            { to: ADDRESS, data: "0x06fdde03" },
            "latest",
        ]);
    });
});

describe("multi-view reads", () => {
    it("reads name, symbol and decimals with three eth_calls", async () => {
        const bySelector: Record<string, string> = {
            "0x06fdde03": abiString("USD Coin"),
            "0x95d89b41": abiString("USDC"),
            "0x313ce567": abiUint(6n),
        };
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as {
                method: string;
                params: [{ to: string; data: string }, string];
            };
            if (body.method !== "eth_call") {
                throw new Error(`unexpected method ${body.method}`);
            }
            return {
                ok: true,
                json: async () => ({ result: bySelector[body.params[0].data] }),
            };
        });
        vi.stubGlobal("fetch", fetchMock);

        const views = await readSandboxViews("http://127.0.0.1:8545", ADDRESS, [
            "name",
            "symbol",
            "decimals",
        ]);

        expect(views.values).toEqual({
            name: "USD Coin",
            symbol: "USDC",
            decimals: "6",
        });
        expect(views.errors).toEqual({});
        expect(fetchMock).toHaveBeenCalledTimes(3);
        for (const call of fetchMock.mock.calls) {
            const body = JSON.parse(String((call[1] as RequestInit).body)) as {
                method: string;
            };
            expect(body.method).toBe("eth_call");
        }
    });

    it("refuses a non-sandbox RPC before any call", async () => {
        const fetchMock = mockRpc({});
        await expect(
            readSandboxViews("https://mainnet.infura.io/v3/key", ADDRESS, [
                "name",
            ])
        ).rejects.toThrow(/BuildBear sandbox RPC or localhost/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("sandbox reads", () => {
    it("reads chain id and block with the two status methods", async () => {
        const fetchMock = mockRpc({
            eth_chainId: "0x1",
            eth_blockNumber: "0x2a",
        });

        const status = await readSandboxStatus("http://127.0.0.1:8545");

        expect(status.chainIdDecimal).toBe("1");
        expect(status.blockNumberDecimal).toBe("42");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const methods = fetchMock.mock.calls.map((call) => {
            const init = call[1] as RequestInit;
            return (JSON.parse(String(init.body)) as { method: string }).method;
        });
        expect(methods).toEqual(["eth_chainId", "eth_blockNumber"]);
    });

    it("reads stored code and does not send a transaction", async () => {
        const fetchMock = mockRpc({
            eth_getCode: "0x6080604052",
        });

        const code = await readSandboxCode("http://127.0.0.1:8545", ADDRESS);

        expect(code.hasCode).toBe(true);
        expect(code.byteLength).toBe(5);
        expect(code.preview).toBe("0x6080604052");
        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(init.body)) as {
            method: string;
            params: string[];
        };
        expect(body.method).toBe("eth_getCode");
        expect(body.params).toEqual([ADDRESS, "latest"]);
    });

    it("formats a whole ether and a fraction", () => {
        expect(formatWei("0xde0b6b3a7640000")).toBe("1.000000");
        expect(formatWei("0x0")).toBe("0.000000");
    });
});

describe("sandbox provider", () => {
    it("puts chain id and latest block into context", async () => {
        mockRpc({
            eth_chainId: "0x7a69",
            eth_blockNumber: "0x2a",
        });

        const text = await sandboxProvider.get(
            runtimeWith("http://127.0.0.1:8545"),
            { content: { text: "hello" } } as never,
            undefined
        );

        expect(text).toContain("31337");
        expect(text).toContain("latest block 42");
        expect(text).toContain("No transaction was sent");
    });

    it("stops when the RPC URL is missing and does not call the network", async () => {
        const fetchMock = mockRpc({});

        const text = await sandboxProvider.get(
            runtimeWith(null),
            { content: { text: "hello" } } as never,
            undefined
        );

        expect(text).toContain("BUILDBEAR_RPC_URL is missing");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports a bad URL instead of calling the network", async () => {
        const fetchMock = mockRpc({});

        const text = await sandboxProvider.get(
            runtimeWith("https://mainnet.infura.io/v3/key"),
            { content: { text: "hello" } } as never,
            undefined
        );

        expect(text).toContain("Sandbox status is unavailable");
        expect(text).toContain("BuildBear sandbox RPC or localhost");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
