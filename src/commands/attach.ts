import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { flagStr } from "../args.js";
import { AuthError } from "../client.js";
import { fail, printResult } from "../output.js";
import { type CommandCtx, requireArg } from "./_shared.js";

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * `bcontext attach <node-id> <file> [--type image/png]`
 * → MCP attach_file. Images only (png/jpeg/webp/gif), ≤ 4 MB.
 */
export async function attach(ctx: CommandCtx): Promise<void> {
  const usage = "bcontext attach <node-id> <file.png> [--type image/png]";
  const id = requireArg(ctx, 0, "node-id", usage);
  const file = requireArg(ctx, 1, "file", usage);

  const contentType =
    flagStr(ctx.flags, "type") ?? EXT_TO_MIME[extname(file).toLowerCase()];
  if (!contentType) {
    fail(`cannot infer content type from "${file}" — pass --type (png/jpeg/webp/gif)`, 2);
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (err) {
    fail(`cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`, 2);
    return;
  }

  try {
    const result = await ctx.client.mcpCall(
      "attach_file",
      {
        node_id: id,
        filename: basename(file),
        content_base64: bytes.toString("base64"),
        content_type: contentType,
      },
      ctx.workspace,
    );
    printResult(result as object, ctx.mode, (d) =>
      `attached ${basename(file)} → ${(d as { url?: string }).url ?? "(url pending)"}`,
    );
  } catch (err) {
    if (err instanceof AuthError) fail(err.message, 1);
    throw err;
  }
}
