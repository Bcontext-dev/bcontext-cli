import { flagBool } from "../args.js";
import { AuthError, type ApiResponse } from "../client.js";
import { fail, failResponse } from "../output.js";
import type { CommandCtx } from "./_shared.js";

/**
 * `bcontext ask <question> [--no-synth] [--chat]`
 *
 * Default → MCP ask_rag: a synthesized answer whose every claim carries an
 * inline [N] citation, printed to stdout; the numbered Sources list (with
 * /n/<id>#<block> refs) goes to stderr so the answer pipes cleanly.
 * An on-call agent can act on this AND verify any claim.
 *
 * `--no-synth` → retrieval only (no model call).
 * `--chat` → the old streaming agentic chat (/api/chat) for exploratory
 * multi-step questions; narration, no citations contract.
 */
export async function ask(ctx: CommandCtx): Promise<void> {
  const question = ctx.args.join(" ").trim();
  if (!question) {
    process.stderr.write(
      JSON.stringify({ error: true, message: "usage: bcontext ask <question> [--no-synth] [--chat]" }) + "\n",
    );
    process.exit(2);
  }

  if (flagBool(ctx.flags, "chat")) {
    await askChat(ctx, question);
    return;
  }

  const synthesize = !flagBool(ctx.flags, "no-synth");
  let data: {
    answer?: string | null;
    answer_note?: string;
    hits?: Array<{ n: number; title?: string; kind?: string; ref?: string; score?: number }>;
  };
  try {
    data = await ctx.client.mcpCall("ask_rag", { query: question, synthesize }, ctx.workspace);
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }

  if (data.answer) {
    process.stdout.write(data.answer.trimEnd() + "\n");
  } else if (synthesize) {
    process.stdout.write(`(no synthesized answer${data.answer_note ? `: ${data.answer_note}` : ""})\n`);
  }
  const hits = data.hits ?? [];
  if (!data.answer || !synthesize) {
    // Retrieval-only mode: hits ARE the output.
    process.stdout.write(JSON.stringify({ hits }, null, 2) + "\n");
  }
  if (hits.length > 0) {
    const lines = hits.map((h) => `  [${h.n}] ${h.title ?? "?"} — ${h.ref ?? "?"}`);
    process.stderr.write(`\nSources:\n${lines.join("\n")}\n`);
  }
}

/** The previous behavior: stream the agentic /api/chat answer. */
async function askChat(ctx: CommandCtx, question: string): Promise<void> {
  const res = await ctx.client.stream("POST", "/api/chat", {
    body: {
      workspace: ctx.workspace,
      messages: [{ role: "user", content: question }],
    },
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    failResponse({ ok: false, status: res.status, data, raw: data === undefined ? text : undefined } as ApiResponse);
  }

  await consumeNdjson(res.body!, ctx.mode.pretty);
  process.stdout.write("\n");
  printSources(res.headers.get("x-citations"));
}

/**
 * The chat route ships its retrieval citations in the `x-citations` header
 * (URI-encoded JSON). Print them after the answer so every claim is
 * verifiable — on stderr, keeping stdout pipe-clean for the answer itself.
 */
function printSources(header: string | null): void {
  if (!header) return;
  let citations: Array<{ node_id?: string; title?: string; block_id?: string | null }>;
  try {
    citations = JSON.parse(decodeURIComponent(header));
  } catch {
    try {
      citations = JSON.parse(header);
    } catch {
      return;
    }
  }
  if (!Array.isArray(citations) || citations.length === 0) return;
  const lines = citations.slice(0, 10).map((c, i) => {
    const ref = c.block_id ? `/n/${c.node_id}#${c.block_id}` : `/n/${c.node_id}`;
    return `  [${i + 1}] ${c.title ?? "?"} — ${ref}`;
  });
  process.stderr.write(`\nSources:\n${lines.join("\n")}\n`);
}

/**
 * Parses the line-delimited frames from the chat route's fullStream wire
 * format. `text-delta` accumulates to stdout; tool frames render a one-line
 * trace to stderr; `error` aborts non-zero; `finish` ends.
 */
export async function consumeNdjson(
  body: ReadableStream<Uint8Array>,
  pretty: boolean,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      if (handleFrame(line, pretty)) return; // finish
    }
  }
  const tail = buf.trim();
  if (tail) handleFrame(tail, pretty);
}

/** Returns true when the stream should stop (finish frame). */
function handleFrame(line: string, pretty: boolean): boolean {
  let frame: { type?: string; text?: string; toolName?: string; message?: string };
  try {
    frame = JSON.parse(line);
  } catch {
    return false; // ignore unparseable lines
  }
  switch (frame.type) {
    case "text-delta":
      process.stdout.write(String(frame.text ?? ""));
      return false;
    case "tool-call":
      if (pretty) process.stderr.write(`· ${frame.toolName ?? "tool"}…\n`);
      return false;
    case "tool-result":
    case "tool-error":
    case "reasoning-delta":
      return false; // quiet by default
    case "error":
      process.stderr.write(
        JSON.stringify({ error: true, message: frame.message ?? "stream error" }) + "\n",
      );
      process.exit(1);
    // eslint-disable-next-line no-fallthrough
    case "finish":
      return true;
    default:
      return false;
  }
}
