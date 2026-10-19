import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { elizaLogger } from "./logger.ts";
import settings from "./settings.ts";

const START_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 2_000;

let startInFlight: Promise<boolean> | null = null;

function healthUrl(): string | null {
    const serverUrl = settings.BONSAI_SERVER_URL;
    if (!serverUrl) return null;
    try {
        return new URL("/health", serverUrl).href;
    } catch {
        return null;
    }
}

function isLocalServer(serverUrl: string): boolean {
    try {
        const host = new URL(serverUrl).hostname;
        return host === "127.0.0.1" || host === "localhost" || host === "::1";
    } catch {
        return false;
    }
}

async function probe(): Promise<"ok" | "down" | "starting"> {
    const url = healthUrl();
    if (!url) return "down";
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!response.ok) return "starting";
        const body = (await response.json()) as { status?: string };
        return body.status === "ok" ? "ok" : "starting";
    } catch (error) {
        const code = (error as { cause?: { code?: string } }).cause?.code;
        if (code === "ECONNREFUSED" || code === "ENOTFOUND") return "down";
        return "starting";
    }
}

function repoCandidates(): string[] {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return [
        process.cwd(),
        path.resolve(here, "../../.."),
        path.resolve(here, "../.."),
    ];
}

function firstExisting(candidates: string[]): string | undefined {
    return candidates.find((candidate) => fs.existsSync(candidate));
}

function llamaServerPath(): string | undefined {
    if (settings.BONSAI_LLAMA_SERVER && fs.existsSync(settings.BONSAI_LLAMA_SERVER)) {
        return settings.BONSAI_LLAMA_SERVER;
    }
    const names = process.platform === "win32"
        ? ["llama-server.exe"]
        : ["llama-server", "llama-server.exe"];
    const candidates = repoCandidates().flatMap((root) =>
        names.map((name) => path.join(root, "models", "runtime", "cpu", name))
    );
    return firstExisting(candidates);
}

function modelPath(): string | undefined {
    if (settings.BONSAI_MODEL_PATH && fs.existsSync(settings.BONSAI_MODEL_PATH)) {
        return settings.BONSAI_MODEL_PATH;
    }
    const candidates = repoCandidates().map((root) =>
        path.join(root, "models", "Ternary-Bonsai-2-27B-PTQ1_0.gguf")
    );
    return firstExisting(candidates);
}

function serverEndpoint(): URL | null {
    if (!settings.BONSAI_SERVER_URL) return null;
    try {
        return new URL(settings.BONSAI_SERVER_URL);
    } catch {
        return null;
    }
}

function launchServer(serverExe: string, weights: string): void {
    const endpoint = serverEndpoint();
    const port = endpoint?.port || "8891";
    const host = endpoint?.hostname || "127.0.0.1";
    const threads = Math.max(4, os.cpus().length - 2);
    const logPath = path.join(path.dirname(serverExe), "bonsai-server.log");
    const logFd = fs.openSync(logPath, "a");
    const child = spawn(
        serverExe,
        [
            "-m",
            weights,
            "-a",
            settings.BONSAI_MODEL || "bonsai-2-27b",
            "--host",
            host,
            "--port",
            port,
            "-c",
            "8192",
            "-ngl",
            "0",
            "-t",
            String(threads),
            "--reasoning",
            "off",
            "--temp",
            "0.7",
            "--top-p",
            "0.8",
            "--top-k",
            "20",
            "--presence-penalty",
            "1.5",
        ],
        {
            detached: true,
            stdio: ["ignore", logFd, logFd],
            windowsHide: true,
        }
    );
    child.unref();
    fs.closeSync(logFd);
    elizaLogger.info(
        `Starting local Bonsai server on ${host}:${port} (pid ${child.pid}).`
    );
}

async function waitUntilReady(): Promise<boolean> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if ((await probe()) === "ok") return true;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
}

async function startAndWait(): Promise<boolean> {
    const state = await probe();
    if (state === "ok") return true;

    const serverUrl = settings.BONSAI_SERVER_URL;
    if (!serverUrl || !isLocalServer(serverUrl)) {
        return false;
    }

    if (state === "down") {
        const serverExe = llamaServerPath();
        const weights = modelPath();
        if (!serverExe || !weights) {
            elizaLogger.warn(
                "Bonsai server is down and the local runtime or weights were not found."
            );
            return false;
        }
        try {
            launchServer(serverExe, weights);
        } catch (error) {
            elizaLogger.error("Failed to start the Bonsai server.", error);
            return false;
        }
    } else {
        elizaLogger.info("Bonsai server is already starting. Waiting for it.");
    }

    const ready = await waitUntilReady();
    if (!ready) {
        elizaLogger.warn(
            "Bonsai server did not become ready within 90 seconds."
        );
    }
    return ready;
}

/**
 * Returns true when the local Bonsai server can take a request.
 * Starts it when a call needs it and it is not already listening.
 * Concurrent calls share one startup.
 */
export async function ensureBonsaiServer(): Promise<boolean> {
    if (!settings.BONSAI_SERVER_URL) return false;
    if ((await probe()) === "ok") return true;
    if (!startInFlight) {
        startInFlight = startAndWait().finally(() => {
            startInFlight = null;
        });
    }
    return startInFlight;
}
