import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const PACKAGE_ROOT = process.cwd();
const CLI_ENTRY = join(PACKAGE_ROOT, "src", "cli.js");

function runCli(args, cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd,
      env: { ...process.env, ...env }
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

const validConfig = {
  version: 1,
  defaults: { target: "local" },
  targets: {
    local: {
      server: "http://localhost:8080",
      admin: { usernameEnv: "TEST_ADMIN_USER", passwordEnv: "TEST_ADMIN_PASS" },
      docker: { composeFile: "local/docker-compose.yml", envFile: "local/.env", projectName: "" }
    },
    remote: {
      server: "https://id.example.com",
      admin: { usernameEnv: "TEST_ADMIN_USER", passwordEnv: "TEST_ADMIN_PASS" }
    }
  },
  safety: {
    requireConfirmForDestructive: true,
    requireAllowRemoteMutations: true
  }
};

test("kcadmin realm reset requires --confirm", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kcadmin-it-"));
  const file = join(dir, "config.json");
  await writeFile(file, JSON.stringify(validConfig), "utf8");

  const result = await runCli(
    ["realm", "reset", "--file", "realm.json", "--config", file],
    PACKAGE_ROOT,
    { TEST_ADMIN_USER: "admin", TEST_ADMIN_PASS: "admin" }
  );
  assert.equal(result.code, 2);
  assert.match(result.stderr, /requires --confirm/);
});

test("kcadmin factory reset requires --confirm", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kcadmin-it-"));
  const file = join(dir, "config.json");
  await writeFile(file, JSON.stringify(validConfig), "utf8");

  const result = await runCli(
    ["reset", "--config", file],
    PACKAGE_ROOT,
    { TEST_ADMIN_USER: "admin", TEST_ADMIN_PASS: "admin" }
  );
  assert.equal(result.code, 2);
  assert.match(result.stderr, /factory reset requires --confirm/);
});

test("kcadmin init creates scaffold folder and files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kcadmin-it-"));

  const result = await runCli(["init", "--dir", "kcadmin"], dir);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /PASS/);

  await access(join(dir, "kcadmin", "kcadmin.config.json"));
  await access(join(dir, "kcadmin", "realms", "example-realm.json"));
  await access(join(dir, "kcadmin", "seeds", "example-seed.json"));
  await access(join(dir, "kcadmin", "runtime", "docker-compose.yml"));
  await access(join(dir, "kcadmin", "runtime", ".env"));
});
