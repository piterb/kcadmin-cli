import { CliError } from "../errors.js";

function parseOptions(argv) {
  const opts = {
    configPath: undefined,
    target: "local",
    file: undefined,
    realm: undefined,
    out: undefined,
    dir: undefined,
    confirm: false,
    force: false,
    wipe: false,
    allowRemoteMutations: false
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    if (token === "--confirm") {
      opts.confirm = true;
      continue;
    }

    if (token === "--allow-remote-mutations") {
      opts.allowRemoteMutations = true;
      continue;
    }
    if (token === "--force") {
      opts.force = true;
      continue;
    }
    if (token === "--wipe" || token === "--purge") {
      opts.wipe = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new CliError(`missing value for option: ${token}`, 2);
    }

    if (token === "--config") opts.configPath = next;
    else if (token === "--target") opts.target = next;
    else if (token === "--file") opts.file = next;
    else if (token === "--realm") opts.realm = next;
    else if (token === "--out") opts.out = next;
    else if (token === "--dir") opts.dir = next;
    else throw new CliError(`unknown option: ${token}`, 2);

    i += 1;
  }

  return { opts, positionals };
}

export function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }

  const { opts, positionals } = parseOptions(argv);
  const [a, b] = positionals;

  if (opts.dir !== undefined && a !== "init") {
    throw new CliError("--dir is only supported with: kcadmin init", 2);
  }
  if (opts.wipe && a !== "down") {
    throw new CliError("--wipe is only supported with: kcadmin down", 2);
  }

  if (a === "up" && positionals.length === 1) return { kind: "up", ...opts };
  if (a === "down" && positionals.length === 1) return { kind: "down", ...opts };
  if (a === "status" && positionals.length === 1) return { kind: "status", ...opts };
  if (a === "logs" && positionals.length === 1) return { kind: "logs", ...opts };
  if (a === "init" && positionals.length === 1) return { kind: "init", ...opts };

  if (a === "realm" && b === "apply" && positionals.length === 2) {
    if (!opts.file) throw new CliError("missing required flag: --file <realm.json>", 2);
    return { kind: "realm-apply", ...opts };
  }

  if (a === "realm" && b === "reset" && positionals.length === 2) {
    if (!opts.file) throw new CliError("missing required flag: --file <realm.json>", 2);
    return { kind: "realm-reset", ...opts };
  }

  if (a === "realm" && b === "export" && positionals.length === 2) {
    if (!opts.realm) throw new CliError("missing required flag: --realm <name>", 2);
    if (!opts.out) throw new CliError("missing required flag: --out <file>", 2);
    return { kind: "realm-export", ...opts };
  }

  if (a === "seed" && b === "apply" && positionals.length === 2) {
    if (!opts.realm) throw new CliError("missing required flag: --realm <name>", 2);
    if (!opts.file) throw new CliError("missing required flag: --file <seed.json>", 2);
    return { kind: "seed-apply", ...opts };
  }

  throw new CliError(`unknown command: ${argv.join(" ")}`, 2);
}
