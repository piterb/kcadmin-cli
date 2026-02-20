import test from "node:test";
import assert from "node:assert/strict";
import { validateConfigSchema } from "../../src/config/schema.js";

const validConfig = {
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
};

test("validateConfigSchema returns no errors for valid config", () => {
  assert.deepEqual(validateConfigSchema(validConfig), []);
});

test("validateConfigSchema accepts direct admin credentials", () => {
  const config = {
    ...validConfig,
    targets: {
      ...validConfig.targets,
      local: {
        ...validConfig.targets.local,
        admin: { username: "admin", password: "admin" }
      }
    }
  };
  assert.deepEqual(validateConfigSchema(config), []);
});

test("validateConfigSchema returns errors for invalid config", () => {
  const broken = { ...validConfig, version: 2, defaults: { target: "x" } };
  const errors = validateConfigSchema(broken);
  assert.ok(errors.length >= 2);
  assert.ok(errors.some((e) => e.includes("version")));
  assert.ok(errors.some((e) => e.includes("defaults.target")));
});
