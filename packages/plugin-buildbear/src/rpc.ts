const WEI_PER_ETHER = 10n ** 18n;

export function assertSandboxRpcUrl(rpcUrl: string): URL {
    let url: URL;
    try {
        url = new URL(rpcUrl);
    } catch {
        throw new Error("BUILDBEAR_RPC_URL is not a valid URL");
    }

    const host = url.hostname;
    const local = host === "localhost" || host === "127.0.0.1";
    const buildbear =
        host === "rpc.buildbear.io" || host.endsWith(".buildbear.io");

    if (!local && !buildbear) {
        throw new Error(
            "BUILDBEAR_RPC_URL must be a BuildBear sandbox RPC or localhost"
        );
    }

    if (!local && url.protocol !== "https:") {
        throw new Error("BuildBear RPC must use https");
    }

    return url;
}

export function assertFaucetUrl(faucetUrl: string): URL {
    let url: URL;
    try {
        url = new URL(faucetUrl);
    } catch {
        throw new Error("BUILDBEAR_FAUCET_URL is not a valid URL");
    }

    const host = url.hostname;
    const buildbear = host === "buildbear.io" || host.endsWith(".buildbear.io");
    if (!buildbear) {
        throw new Error(
            "BUILDBEAR_FAUCET_URL must be a BuildBear faucet or dashboard URL"
        );
    }

    if (url.protocol !== "https:") {
        throw new Error("BuildBear faucet URL must use https");
    }

    return url;
}

export function faucetInstructions(faucetUrl: string): {
    url: string;
    text: string;
} {
    const url = assertFaucetUrl(faucetUrl).toString();
    return {
        url,
        text: `Sandbox faucet: ${url}. Open that page in the BuildBear dashboard and request the drip yourself. This agent does not submit the drip.`,
    };
}

export function assertTestAddress(address: string): string {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error(
            "BUILDBEAR_TEST_ADDRESS must be a 20-byte hex address"
        );
    }
    return address;
}

const ADDRESS_IN_TEXT = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;

export function findContractAddress(text: string): string | null {
    const match = text.match(ADDRESS_IN_TEXT);
    return match ? match[0] : null;
}

export function assertContractAddress(address: string): string {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error("Contract address must be a 20-byte hex address");
    }
    return address;
}

const CODE_PREVIEW_BYTES = 32;

export function summarizeBytecode(code: string): {
    hasCode: boolean;
    byteLength: number;
    preview: string;
} {
    if (!/^0x[a-fA-F0-9]*$/.test(code)) {
        throw new Error("Sandbox code is not hex");
    }
    const hex = code.slice(2);
    if (hex.length % 2 !== 0) {
        throw new Error("Sandbox code has an odd length");
    }
    const byteLength = hex.length / 2;
    const preview =
        byteLength === 0
            ? "0x"
            : `0x${hex.slice(0, CODE_PREVIEW_BYTES * 2)}`;
    return {
        hasCode: byteLength > 0,
        byteLength,
        preview,
    };
}

export function formatWei(hexWei: string): string {
    const wei = BigInt(hexWei);
    const whole = wei / WEI_PER_ETHER;
    const fraction = (wei % WEI_PER_ETHER)
        .toString()
        .padStart(18, "0")
        .slice(0, 6);
    return `${whole.toString()}.${fraction}`;
}

type RpcResponse = {
    result?: string;
    error?: { message?: string };
};

export async function sandboxRpc(
    rpcUrl: string,
    method: string,
    params: unknown[]
): Promise<string> {
    assertSandboxRpcUrl(rpcUrl);

    const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
        }),
    });

    if (!response.ok) {
        throw new Error(`Sandbox RPC HTTP ${response.status}`);
    }

    const body = (await response.json()) as RpcResponse;
    if (body.error) {
        throw new Error(body.error.message || "Sandbox RPC error");
    }
    if (typeof body.result !== "string") {
        throw new Error(`Sandbox RPC ${method} returned no result`);
    }
    return body.result;
}

export async function readSandboxStatus(rpcUrl: string): Promise<{
    chainId: string;
    chainIdDecimal: string;
    blockNumber: string;
    blockNumberDecimal: string;
}> {
    const chainId = await sandboxRpc(rpcUrl, "eth_chainId", []);
    const blockNumber = await sandboxRpc(rpcUrl, "eth_blockNumber", []);
    return {
        chainId,
        chainIdDecimal: BigInt(chainId).toString(),
        blockNumber,
        blockNumberDecimal: BigInt(blockNumber).toString(),
    };
}

export async function readSandboxBalance(
    rpcUrl: string,
    address: string
): Promise<{ address: string; wei: string; ether: string }> {
    const checked = assertTestAddress(address);
    const wei = await sandboxRpc(rpcUrl, "eth_getBalance", [
        checked,
        "latest",
    ]);
    return {
        address: checked,
        wei,
        ether: formatWei(wei),
    };
}

export type ViewFunctionName = "name" | "symbol" | "decimals" | "totalSupply";

const VIEW_CALLS: Record<
    ViewFunctionName,
    { data: string; kind: "string" | "uint" }
> = {
    name: { data: "0x06fdde03", kind: "string" },
    symbol: { data: "0x95d89b41", kind: "string" },
    decimals: { data: "0x313ce567", kind: "uint" },
    totalSupply: { data: "0x18160ddd", kind: "uint" },
};

const VIEW_MATCHERS: { name: ViewFunctionName; re: RegExp }[] = [
    { name: "totalSupply", re: /\btotal\s*supply\b|\btotalSupply\b/i },
    { name: "decimals", re: /\bdecimals\b/i },
    { name: "symbol", re: /\bsymbol\b/i },
    { name: "name", re: /\bname\b/i },
];

export function findViewFunction(text: string): ViewFunctionName | null {
    let best: { name: ViewFunctionName; index: number } | null = null;
    for (const matcher of VIEW_MATCHERS) {
        const match = matcher.re.exec(text);
        if (!match) {
            continue;
        }
        if (!best || match.index < best.index) {
            best = { name: matcher.name, index: match.index };
        }
    }
    return best ? best.name : null;
}

const TOKEN_DETAIL_FUNCTIONS: ViewFunctionName[] = ["name", "symbol", "decimals"];

const TOKEN_DETAILS_RE =
    /\btoken\s+(details|info|information|metadata)\b|\b(details|info|information|metadata)\s+(for|of|on|about)\s+(the\s+|this\s+|that\s+)?(token|contract)\b/i;

/**
 * Every allowed view the text asks for, in the order it names them.
 * A request for token details with no function named reads name, symbol,
 * and decimals.
 */
export function findViewFunctions(text: string): ViewFunctionName[] {
    const found: { name: ViewFunctionName; index: number }[] = [];
    for (const matcher of VIEW_MATCHERS) {
        const match = matcher.re.exec(text);
        if (match) {
            found.push({ name: matcher.name, index: match.index });
        }
    }
    if (found.length === 0) {
        return TOKEN_DETAILS_RE.test(text) ? [...TOKEN_DETAIL_FUNCTIONS] : [];
    }
    return found.sort((a, b) => a.index - b.index).map((f) => f.name);
}

export function viewCallData(name: ViewFunctionName): string {
    return VIEW_CALLS[name].data;
}

function hexToBytes(hex: string): Uint8Array {
    if (!/^0x[a-fA-F0-9]*$/.test(hex)) {
        throw new Error("View result is not hex");
    }
    const body = hex.slice(2);
    if (body.length % 2 !== 0) {
        throw new Error("View result has an odd length");
    }
    const bytes = new Uint8Array(body.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function readWord(bytes: Uint8Array, offset: number): bigint {
    let value = 0n;
    for (let i = 0; i < 32; i++) {
        value = (value << 8n) + BigInt(bytes[offset + i] ?? 0);
    }
    return value;
}

function decodeBytes32String(bytes: Uint8Array): string {
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) {
        end -= 1;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.slice(0, end)
    );
    if (text.length === 0) {
        throw new Error("View result string is empty");
    }
    return text;
}

function decodeAbiString(bytes: Uint8Array): string {
    if (bytes.length < 64) {
        throw new Error("View result is too short for a string");
    }
    const offset = readWord(bytes, 0);
    if (offset !== 32n) {
        throw new Error("View result string offset is not 32");
    }
    const length = readWord(bytes, 32);
    if (length > 256n) {
        throw new Error("View result string is too long");
    }
    const start = 64;
    const end = start + Number(length);
    if (bytes.length < end) {
        throw new Error("View result string is truncated");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.slice(start, end)
    );
}

export function decodeViewResult(name: ViewFunctionName, data: string): string {
    if (data === "0x") {
        throw new Error(
            "The view call returned no data. The address may have no code, or it may not have that function."
        );
    }
    const kind = VIEW_CALLS[name].kind;
    const bytes = hexToBytes(data);
    if (kind === "uint") {
        if (bytes.length !== 32) {
            throw new Error("View result is not a 32-byte number");
        }
        return readWord(bytes, 0).toString();
    }
    try {
        if (bytes.length === 32) {
            return decodeBytes32String(bytes);
        }
        return decodeAbiString(bytes);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("View result")) {
            throw error;
        }
        throw new Error("View result is not a text string");
    }
}

export async function readSandboxView(
    rpcUrl: string,
    address: string,
    name: ViewFunctionName
): Promise<{ address: string; functionName: ViewFunctionName; value: string }> {
    const checked = assertContractAddress(address);
    const data = await sandboxRpc(rpcUrl, "eth_call", [
        { to: checked, data: viewCallData(name) },
        "latest",
    ]);
    return {
        address: checked,
        functionName: name,
        value: decodeViewResult(name, data),
    };
}

/**
 * Reads several allowed views on one contract. Each one is a separate
 * eth_call. A failed view is reported in errors and does not stop the rest.
 */
export async function readSandboxViews(
    rpcUrl: string,
    address: string,
    names: ViewFunctionName[]
): Promise<{
    address: string;
    values: Partial<Record<ViewFunctionName, string>>;
    errors: Partial<Record<ViewFunctionName, string>>;
}> {
    assertSandboxRpcUrl(rpcUrl);
    const checked = assertContractAddress(address);
    const values: Partial<Record<ViewFunctionName, string>> = {};
    const errors: Partial<Record<ViewFunctionName, string>> = {};
    for (const name of names) {
        try {
            values[name] = (await readSandboxView(rpcUrl, checked, name)).value;
        } catch (error) {
            errors[name] =
                error instanceof Error ? error.message : "View call failed";
        }
    }
    return { address: checked, values, errors };
}

export async function readSandboxCode(
    rpcUrl: string,
    address: string
): Promise<{
    address: string;
    hasCode: boolean;
    byteLength: number;
    preview: string;
}> {
    const checked = assertContractAddress(address);
    const code = await sandboxRpc(rpcUrl, "eth_getCode", [checked, "latest"]);
    return {
        address: checked,
        ...summarizeBytecode(code),
    };
}
