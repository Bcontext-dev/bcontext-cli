import { flagStr, flagBool } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, requireArg, slugify } from "./_shared.js";

/**
 * `bcontext get <id> [--block <slug>] [--md] [--no-links]`
 * → MCP get_node, so the CLI sees the same envelope as every other agent
 * surface: node + inbound_links/outbound_links + dependencies + attachments.
 */
export async function get(ctx: CommandCtx): Promise<void> {
  const id = requireArg(ctx, 0, "id", "bcontext get <node-id> [--block <slug>] [--md] [--no-links]");
  const block = flagStr(ctx.flags, "block");
  const rawMd = flagBool(ctx.flags, "md");
  const noLinks = flagBool(ctx.flags, "no-links");

  let data: Record<string, unknown>;
  try {
    data = await ctx.client.mcpCall<Record<string, unknown>>(
      "get_node",
      { id, include_links: !noLinks && !rawMd },
      ctx.workspace,
    );
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, err.status === 401 ? 3 : 1);
    throw err;
  }

  const node = (data.node ?? {}) as Record<string, unknown>;
  const fullMd = typeof node.content_md === "string" ? node.content_md : "";
  const content = block ? sliceBlock(fullMd, block) : fullMd;

  // `--md` prints raw markdown to stdout so it pipes cleanly into a file.
  if (rawMd) {
    process.stdout.write(content + (content.endsWith("\n") ? "" : "\n"));
    return;
  }

  const out = block ? { id, block, content_md: content } : data;
  printResult(out, ctx.mode, () => content || JSON.stringify(node, null, 2));
}

/**
 * Returns the markdown of the H2 section whose slug matches `blockSlug`.
 * Mirrors the platform's H2→block-id derivation (P8) client-side, since
 * there's no single-block REST endpoint.
 */
function sliceBlock(md: string, blockSlug: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let capturing = false;
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      if (capturing) break; // next H2 ends the block
      if (slugify(h2[1]!) === blockSlug) {
        capturing = true;
        out.push(line);
        continue;
      }
    }
    if (capturing) out.push(line);
  }
  return out.join("\n").trim();
}
