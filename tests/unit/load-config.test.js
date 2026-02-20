import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAndValidateConfig, resolveTargetContext } from "../../src/config/load-config.js";

const validConfigText = JSON.stringify({
  version: 1,
  defaults: { target: "local" },
  targets: {
    local: {
      server: "http://localhost:8080",
      admin: { usernameEnv: "A", passwordEnv: "B" },
      docker: { composeFile: "local/docker-compose.yml", envFile: "local/.env", projectName: "" }
    },
    remote: {
      server: "https://id.example.com",
      admin: { usernameEnv: "A", passwordEnv: "B" }
    }
  },
  safety: {
    requireConfirmForDestructive: true,
    requireAllowRemoteMutations: true
  }
});

test("loadAndValidateConfig reads and validates file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kcadmin-test-"));
  const file = join(dir, "config.json");
  await writeFile(file, validConfigText, "utf8");

  const result = await loadAndValidateConfig(file);
  assert.equal(result.version, 1);
  assert.equal(result.defaults.target, "local");
});

test("loadAndValidateConfig fails on invalid JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kcadmin-test-"));
  const file = join(dir, "config.json");
  await writeFile(file, "{not-json}", "utf8");

  await assert.rejects(() => loadAndValidateConfig(file), /not valid JSON/);
});

test("resolveTargetContext prefers direct admin credentials from config", () => {
  const config = JSON.parse(validConfigText);
  config.targets.local.admin = { username: "admin_local", password: "pass_local" };
  const ctx = resolveTargetContext(config, "local");
  assert.equal(ctx.admin.username, "admin_local");
  assert.equal(ctx.admin.password, "pass_local");
});

test("resolveTargetContext uses env credentials when configured", () => {
  const config = JSON.parse(validConfigText);
  const prevA = process.env.A;
  const prevB = process.env.B;
  process.env.A = "admin_env";
  process.env.B = "pass_env";
  try {
    const ctx = resolveTargetContext(config, "local");
    assert.equal(ctx.admin.username, "admin_env");
    assert.equal(ctx.admin.password, "pass_env");
  } finally {
    if (prevA === undefined) delete process.env.A;
    else process.env.A = prevA;
    if (prevB === undefined) delete process.env.B;
    else process.env.B = prevB;
  }
});
