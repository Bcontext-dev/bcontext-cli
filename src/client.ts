/**
 * Thin HTTP client over the Bcontext REST surface. The CLI adds no business
 * logic — every call forwards to a route that already enforces scope,
 * quota, rate-limit and audit. We only shape the request and surface the
 * response.
 */
import type { ResolvedConfig } from "./config.js";

export interface RequestOptions {
  /** JSON body for POST/PATCH. */
  body?: unknown;
  /** Override the client's default workspace for this call. */
  workspace?: string;
  /** Extra query params. */
  query?: Record<string, string | number | undefined>;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  /** Raw text when the body was not JSON. */
  raw?: string;
}

export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class BcontextClient {
  readonly url: string;
  readonly token?: string;
  readonly workspace?: string;

  constructor(cfg: ResolvedConfig) {
    this.url = cfg.url;
    this.token = cfg.token;
    this.workspace = cfg.workspace;
  }

  /** Workspace this client will target, after a per-call override. */
  workspaceFor(override?: string): string | undefined {
    return override ?? this.workspace;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    if (!this.token) {
      throw new AuthError(
        401,
        "no token configured. Run `bcontext login --token <pat>` or set BCONTEXT_TOKEN.",
      );
    }

    const u = new URL(path, this.url + "/");
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    // User-scoped tokens resolve the workspace per request; workspace-scoped
    // tokens ignore the header. Sending it whenever we know a workspace is
    // harmless and mirrors the MCP transport.
    const ws = this.workspaceFor(opts.workspace);
    if (ws) headers["X-Bcontext-Workspace"] = ws;

    let bodyText: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyText = JSON.stringify(opts.body);
    }

    const res = await fetch(u, { method, headers, body: bodyText });
    const text = await res.text();
    let data: unknown = undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }

    return {
      ok: res.ok,
      status: res.status,
      data: data as T,
      raw: data === undefined ? text : undefined,
    };
  }

  /**
   * Like `request`, but returns the raw streaming `Response` without buffering
   * the body. Used by `ask` to consume the chat route's NDJSON stream.
   */
  async stream(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<Response> {
    if (!this.token) {
      throw new AuthError(
        401,
        "no token configured. Run `bcontext login --token <pat>` or set BCONTEXT_TOKEN.",
      );
    }
    const u = new URL(path, this.url + "/");
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/x-ndjson",
    };
    const ws = this.workspaceFor(opts.workspace);
    if (ws) headers["X-Bcontext-Workspace"] = ws;
    let bodyText: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyText = JSON.stringify(opts.body);
    }
    return fetch(u, { method, headers, body: bodyText });
  }

  /**
   * Calls an MCP tool over the /mcp HTTP endpoint (stateless JSON-RPC) and
   * returns the parsed tool result. This gives the CLI full parity with the
   * richest agent surface — links, dependencies, checklists, change feed,
   * optimistic concurrency — without waiting for one REST route per tool.
   * Tool errors (isError) throw with the server's message verbatim.
   */
  async mcpCall<T = unknown>(
    tool: string,
    args: Record<string, unknown> = {},
    workspace?: string,
  ): Promise<T> {
    if (!this.token) {
      throw new AuthError(
        401,
        "no token configured. Run `bcontext login --token <pat>` or set BCONTEXT_TOKEN.",
      );
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const ws = this.workspaceFor(workspace);
    if (ws) headers["X-Bcontext-Workspace"] = ws;
    // Names containing "/" are raw JSON-RPC protocol methods (tools/list,
    // prompts/list, resources/list) — everything else is a tool call.
    const isProtocolMethod = tool.includes("/");
    const res = await fetch(new URL("/mcp", this.url + "/"), {
      method: "POST",
      headers,
      body: JSON.stringify(
        isProtocolMethod
          ? { jsonrpc: "2.0", id: 1, method: tool, params: args }
          : {
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: tool, arguments: args },
            },
      ),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = errorMessage(JSON.parse(text)) ?? msg;
      } catch {
        /* keep status message */
      }
      throw new AuthError(res.status, msg);
    }
    const rpc = JSON.parse(text) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
      error?: { message?: string };
    };
    if (rpc.error) throw new AuthError(500, rpc.error.message ?? "mcp error");
    // Protocol methods return their result object directly (no content[]).
    if (isProtocolMethod) return rpc.result as T;
    const payload = rpc.result?.content?.[0]?.text ?? "";
    if (rpc.result?.isError) throw new AuthError(400, payload || "tool error");
    try {
      return JSON.parse(payload) as T;
    } catch {
      return payload as T;
    }
  }

  /**
   * Verifies the token has access to `workspace` by hitting the existing
   * agents/context route with an empty query (no retrieval, just the
   * workspace's semantic node hierarchy and tags).
   * Returns the resolved workspace slug on success.
   */
  async verify(workspace: string): Promise<{ workspace: string }> {
    const res = await this.request<{ workspace?: string }>(
      "POST",
      "/api/agents/context",
      {
        workspace,
        // body must repeat the slug — the REST route reads it from the body
        body: { workspace, query: "", k: 1, include_counts: false },
      } as RequestOptions,
    );
    if (res.ok) return { workspace: (res.data?.workspace as string) ?? workspace };
    const msg = errorMessage(res.data) ?? res.raw ?? `HTTP ${res.status}`;
    throw new AuthError(res.status, msg);
  }
}

export function errorMessage(data: unknown): string | undefined {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
  }
  return undefined;
}
