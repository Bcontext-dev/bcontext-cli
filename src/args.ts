/**
 * Minimal, dependency-free argv parser. We avoid node:util parseArgs because
 * each command carries its own flags and parseArgs needs a schema up front;
 * a tiny hand-rolled parser keeps the cold-start cheap and the behaviour
 * predictable across commands.
 *
 * Grammar:
 *   --flag             → boolean true (if listed in BOOLEAN_FLAGS)
 *   --key value        → string "value"
 *   --key=value        → string "value"
 *   -h / -v            → short aliases
 *   bareword           → positional
 */

export const BOOLEAN_FLAGS = new Set([
  "pretty",
  "json",
  "help",
  "version",
  "md",
  // Flags below never take a value — listing them here keeps them from
  // swallowing the next positional (e.g. `ask --no-synth "question"`).
  "no-synth",
  "chat",
  "on",
  "off",
  "no-links",
]);

const SHORT_ALIASES: Record<string, string> = {
  h: "help",
  v: "version",
  w: "workspace",
  u: "url",
  k: "k",
};

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgv(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;

    if (a === "--") {
      // Everything after `--` is a positional (e.g. stdin sentinel handling).
      for (let j = i + 1; j < argv.length; j++) positionals.push(argv[j]!);
      break;
    }

    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const name = body;
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = true;
      }
      continue;
    }

    if (a.startsWith("-") && a.length > 1) {
      const short = a.slice(1);
      const name = SHORT_ALIASES[short] ?? short;
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = true;
      }
      continue;
    }

    positionals.push(a);
  }

  return { positionals, flags };
}

/** Returns the flag as a string, or undefined when unset/boolean. */
export function flagStr(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

/** Returns true when a boolean-ish flag is present. */
export function flagBool(
  flags: Record<string, string | boolean>,
  name: string,
): boolean {
  return flags[name] === true || flags[name] === "true";
}
