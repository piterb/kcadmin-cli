#!/usr/bin/env node
import { CliError } from "./errors.js";
import { parseArgs } from "./cli/parse-args.js";
import { loadAndValidateConfig, resolveTargetContext } from "./config/load-config.js";
import { runInitScaffold } from "./commands/init-scaffold.js";
import { runAppInit } from "./commands/app-init.js";
import { runAppAdd } from "./commands/app-add.js";
import { runDown, runDownWipe, runLogs, runStatus, runUp } from "./commands/local-runtime.js";
import {
  runFactoryReset,
  runRealmApply,
  runRealmExport,
  runRealmReset,
  runSeedApply
} from "./commands/realm-ops.js";
import { printResult } from "./reporting/output.js";

function verboseLog(enabled, message) {
  if (!enabled) return;
  console.error(`[kcadmin:verbose] ${message}`);
}

function usage() {
  console.log(`kcadmin CLI

Purpose:
  Manage Keycloak admin workflows with explicit, scriptable commands.
  Safe defaults: destructive operations require explicit confirmation flags.

Usage:
  kcadmin <command> [options]

App bootstrap commands:
  kcadmin app-init --realm <realm_name> [--out <path>] [--env <env>] [--force]
                                                                            Bootstrap base Terraform stack
  kcadmin app-add --profile <profile> --name <name> [--out <path>] [--force]
                                                                            Create dedicated app Terraform stack

Runtime commands:
  kcadmin init [--dir <folder>] [--force]                                  Create kcadmin scaffold and example files
  kcadmin up [--target <local|remote>]                                      Start local runtime and bootstrap defaults
  kcadmin status [--target <local|remote>]                                  Show runtime/service status summary
  kcadmin down [--target <local|remote>] [--wipe]                           Stop runtime (or full wipe with --wipe)
  kcadmin reset [--target <local|remote>] --confirm                         Factory reset realms to master-only state
  kcadmin logs [--target <local|remote>]                                    Stream runtime logs (local target)

Realm/seed commands:
  kcadmin realm apply --file <realm.json> [--target <local|remote>]         Create or update realm from file
  kcadmin realm reset --file <realm.json> [--target <local|remote>] --confirm
                                                                            Delete and recreate one realm from file
  kcadmin realm export --realm <name> --out <file> [--target <local|remote>]
                                                                            Export realm definition to JSON file
  kcadmin seed apply --realm <name> --file <seed.json> [--target <local|remote>]
                                                                            Upsert seed users and role mappings

Global options:
  --dir <folder>                  (for init, default: kcadmin)
  --force                         (for init, overwrite existing files)
  --wipe                          (for down, remove volumes/images/orphans)
  --target <local|remote>         (default: local)
  --realm <realm_name>            realm name for app-init / realm commands
  --profile <profile>             app-add profile (currently: spa-api)
  --name <name>                   logical profile instance name (e.g. web, admin)
  --out <path>                    output folder for app-init/app-add (default: identity)
  --env <env>                     environment label for app-init (default: tst)
  --config <path>                 (default: kcadmin/kcadmin.config.json)
  --dry-run                       print planned changes without writing files
  --with-example-values           include example redirect/origin values in tfvars (default)
  --without-example-values        keep tfvars example placeholders only
  --verbose                       print resolved config/target diagnostics
  --allow-remote-mutations        required when config safety demands it
  --help

Example:
  kcadmin app-init --realm jobhunter-tst --env tst
  kcadmin app-add --profile spa-api --name web`);
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.kind === "help") {
      usage();
      return;
    }

    if (parsed.kind === "init") {
      const result = await runInitScaffold({ dir: parsed.dir, force: parsed.force });
      printResult("scaffold created", [`dir: ${result.dir}`, ...result.files.map((f) => `file: ${f}`)]);
      return;
    }

    if (parsed.kind === "app-init") {
      const result = await runAppInit({
        realm: parsed.realm,
        out: parsed.out,
        env: parsed.env,
        force: parsed.force,
        dryRun: parsed.dryRun,
        withExampleValues: parsed.withExampleValues
      });
      const mode = result.dryRun ? "app-init dry-run complete" : "app-init complete";
      printResult(mode, [
        ...result.createdFiles.map((file) => `file: ${file}`),
        `next: copy terraform.${result.env}.tfvars.example to terraform.${result.env}.tfvars`,
        `next: run terraform init && terraform plan -var-file=terraform.${result.env}.tfvars -state=terraform.${result.env}.tfstate in identity/terraform/base`
      ]);
      return;
    }

    if (parsed.kind === "app-add") {
      const result = await runAppAdd({
        profile: parsed.profile,
        name: parsed.name,
        out: parsed.out,
        force: parsed.force
      });
      printResult("app-add complete", [
        `profile: ${result.profile}`,
        `name: ${result.name}`,
        ...result.filesUpdated.map((file) => `updated: ${file}`),
        "next: apply identity/terraform/base first so base terraform.tfstate exists",
        "next: copy terraform.<env>.tfvars.example to terraform.<env>.tfvars in the app stack",
        "next: run terraform init && terraform plan -var-file=terraform.<env>.tfvars -state=terraform.<env>.tfstate in that app stack"
      ]);
      return;
    }

    const configPath = parsed.configPath ?? "kcadmin/kcadmin.config.json";
    verboseLog(parsed.verbose, `config path: ${configPath}`);

    const config = await loadAndValidateConfig(configPath);
    const ctx = resolveTargetContext(config, parsed.target);
    verboseLog(parsed.verbose, `command: ${parsed.kind}`);
    verboseLog(parsed.verbose, `target: ${ctx.targetName}`);
    verboseLog(parsed.verbose, `server: ${ctx.server}`);
    verboseLog(parsed.verbose, `requireConfirmForDestructive: ${ctx.safety.requireConfirmForDestructive}`);
    verboseLog(parsed.verbose, `requireAllowRemoteMutations: ${ctx.safety.requireAllowRemoteMutations}`);

    if (parsed.kind === "up") {
      await runUp({ ctx });
      const status = await runStatus({ ctx });
      printResult("local stack is up", status.details);
      return;
    }

    if (parsed.kind === "status") {
      const status = await runStatus({ ctx });
      printResult("local stack status", status.details);
      return;
    }

    if (parsed.kind === "down") {
      if (parsed.wipe) {
        await runDownWipe({ ctx });
        printResult("local stack wipe complete", [
          `target: ${ctx.targetName}`,
          "removed: containers, networks, volumes, images, orphans"
        ]);
      } else {
        await runDown({ ctx });
        printResult("local stack is down", [`target: ${ctx.targetName}`]);
      }
      return;
    }

    if (parsed.kind === "logs") {
      await runLogs({ ctx });
      return;
    }

    if (parsed.kind === "factory-reset") {
      const result = await runFactoryReset({
        ctx,
        confirm: parsed.confirm,
        allowRemoteMutations: parsed.allowRemoteMutations
      });
      const deletedSummary =
        result.deleted.length === 0
          ? "deleted realms: none"
          : `deleted realms: ${result.deleted.join(", ")}`;
      printResult("factory reset complete", [
        `target: ${ctx.targetName}`,
        `kept realm: ${result.kept}`,
        deletedSummary
      ]);
      return;
    }

    if (parsed.kind === "realm-apply") {
      const result = await runRealmApply({
        ctx,
        file: parsed.file,
        allowRemoteMutations: parsed.allowRemoteMutations
      });
      printResult("realm apply complete", [`realm: ${result.realm}`, `action: ${result.action}`]);
      return;
    }

    if (parsed.kind === "realm-reset") {
      const result = await runRealmReset({
        ctx,
        file: parsed.file,
        confirm: parsed.confirm,
        allowRemoteMutations: parsed.allowRemoteMutations
      });
      printResult("realm reset complete", [`realm: ${result.realm}`, `action: ${result.action}`]);
      return;
    }

    if (parsed.kind === "realm-export") {
      const result = await runRealmExport({ ctx, realm: parsed.realm, out: parsed.out });
      printResult("realm export complete", [`realm: ${result.realm}`, `out: ${result.out}`]);
      return;
    }

    if (parsed.kind === "seed-apply") {
      const result = await runSeedApply({
        ctx,
        realm: parsed.realm,
        file: parsed.file,
        allowRemoteMutations: parsed.allowRemoteMutations
      });
      printResult("seed apply complete", [`realm: ${result.realm}`, `users processed: ${result.processed}`]);
      return;
    }

    throw new CliError("unsupported command", 2);
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      if (process.argv.includes("--verbose") && error.cause) {
        console.error(`[kcadmin:verbose] cause: ${String(error.cause)}`);
      }
      process.exit(error.exitCode);
    }
    if (error instanceof Error) {
      console.error(error.message);
      if (process.argv.includes("--verbose")) {
        if (error.cause) console.error(`[kcadmin:verbose] cause: ${String(error.cause)}`);
        if (error.stack) console.error(`[kcadmin:verbose] stack:\n${error.stack}`);
      }
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

main();
