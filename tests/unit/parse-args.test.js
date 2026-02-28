import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../../src/cli/parse-args.js";

test("parses up command", () => {
  const parsed = parseArgs(["up", "--target", "local"]);
  assert.equal(parsed.kind, "up");
  assert.equal(parsed.target, "local");
});

test("defaults target to local", () => {
  const parsed = parseArgs(["up"]);
  assert.equal(parsed.kind, "up");
  assert.equal(parsed.target, "local");
});

test("parses status command", () => {
  const parsed = parseArgs(["status", "--target", "local"]);
  assert.equal(parsed.kind, "status");
  assert.equal(parsed.target, "local");
});

test("parses down wipe command", () => {
  const parsed = parseArgs(["down", "--target", "local", "--wipe"]);
  assert.equal(parsed.kind, "down");
  assert.equal(parsed.wipe, true);
});

test("parses init command", () => {
  const parsed = parseArgs(["init", "--dir", "kcadmin", "--force"]);
  assert.equal(parsed.kind, "init");
  assert.equal(parsed.dir, "kcadmin");
  assert.equal(parsed.force, true);
});

test("parses factory reset command", () => {
  const parsed = parseArgs(["reset", "--target", "local", "--confirm"]);
  assert.equal(parsed.kind, "factory-reset");
  assert.equal(parsed.target, "local");
  assert.equal(parsed.confirm, true);
});

test("parses app-init command", () => {
  const parsed = parseArgs([
    "app-init",
    "--realm",
    "jobhunter-tst",
    "--out",
    "identity",
    "--env",
    "tst",
    "--dry-run"
  ]);
  assert.equal(parsed.kind, "app-init");
  assert.equal(parsed.realm, "jobhunter-tst");
  assert.equal(parsed.out, "identity");
  assert.equal(parsed.env, "tst");
  assert.equal(parsed.dryRun, true);
});

test("app-init defaults out to identity when omitted", () => {
  const parsed = parseArgs(["app-init", "--realm", "jobhunter-tst"]);
  assert.equal(parsed.kind, "app-init");
  assert.equal(parsed.out, undefined);
});

test("parses app-add command", () => {
  const parsed = parseArgs(["app-add", "--profile", "spa-api", "--name", "web", "--out", "identity"]);
  assert.equal(parsed.kind, "app-add");
  assert.equal(parsed.profile, "spa-api");
  assert.equal(parsed.name, "web");
  assert.equal(parsed.out, "identity");
  assert.equal(parsed.env, "tst");
});

test("parses realm apply command", () => {
  const parsed = parseArgs(["realm", "apply", "--file", "realm.json", "--target", "remote", "--verbose"]);
  assert.equal(parsed.kind, "realm-apply");
  assert.equal(parsed.file, "realm.json");
  assert.equal(parsed.target, "remote");
  assert.equal(parsed.verbose, true);
});

test("requires --confirm for parser output not enforced here but captured", () => {
  const parsed = parseArgs(["realm", "reset", "--file", "realm.json", "--confirm"]);
  assert.equal(parsed.kind, "realm-reset");
  assert.equal(parsed.confirm, true);
});

test("fails on missing required option", () => {
  assert.throws(() => parseArgs(["seed", "apply", "--realm", "demo"]), /missing required flag/);
});

test("fails when --wipe is used outside down", () => {
  assert.throws(() => parseArgs(["up", "--wipe"]), /only supported with: kcadmin down/);
});

test("app-init requires realm flag", () => {
  assert.throws(() => parseArgs(["app-init"]), /missing required flag: --realm/);
});

test("app-add requires profile and name flags", () => {
  assert.throws(() => parseArgs(["app-add"]), /missing required flag: --profile/);
  assert.throws(() => parseArgs(["app-add", "--profile", "spa-api"]), /missing required flag: --name/);
});
