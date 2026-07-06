/**
 * Dispatches the read/write commands. Builds the client, enforces that a
 * workspace is resolvable (all these commands are workspace-scoped), and
 * routes to the handler. Kept separate from bin.ts so the auth commands stay
 * dependency-light and the command set is testable in isolation.
 */
import { resolveConfig, type ConfigFlags } from "./config.js";
import { BcontextClient } from "./client.js";
import { fail, type OutputMode } from "./output.js";
import type { CommandCtx } from "./commands/_shared.js";
import { search } from "./commands/search.js";
import { get } from "./commands/get.js";
import { tree } from "./commands/tree.js";
import { ask } from "./commands/ask.js";
import { create } from "./commands/create.js";
import { update } from "./commands/update.js";
import { link, unlink } from "./commands/link.js";
import { skill } from "./commands/skill.js";
import { mcp } from "./commands/mcp.js";
import { toggle } from "./commands/toggle.js";
import { changes } from "./commands/changes.js";
import { unblocked } from "./commands/unblocked.js";
import { attach } from "./commands/attach.js";

type Handler = (ctx: CommandCtx) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  search,
  get,
  tree,
  ask,
  create,
  update,
  link,
  unlink,
  skill,
  mcp,
  toggle,
  changes,
  unblocked,
  attach,
};

export function isCommand(name: string): boolean {
  return name in HANDLERS;
}

export async function runCommand(
  command: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
  mode: OutputMode,
): Promise<void> {
  const handler = HANDLERS[command];
  if (!handler) fail(`unknown command "${command}". Run \`bcontext help\`.`, 2);

  const configFlags: ConfigFlags = {
    url: str(flags.url),
    token: str(flags.token),
    workspace: str(flags.workspace),
  };
  const resolved = resolveConfig(configFlags);
  if (!resolved.token) {
    fail("no token configured. Run `bcontext login --token <pat>` or set BCONTEXT_TOKEN.", 3);
  }
  if (!resolved.workspace) {
    fail(
      "no workspace set. Run `bcontext use <slug>`, pass --workspace <slug>, or set BCONTEXT_WORKSPACE.",
      2,
    );
  }

  const ctx: CommandCtx = {
    client: new BcontextClient(resolved),
    workspace: resolved.workspace,
    args: positionals.slice(1), // drop the command itself
    flags,
    mode,
  };
  await handler(ctx);
}

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
