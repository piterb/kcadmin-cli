import { readFile } from "node:fs/promises";
import { CliError } from "../errors.js";
import { validateConfigSchema } from "./schema.js";

const DEFAULT_CONFIG_PATH = "kcadmin/kcadmin.config.json";

export async function loadAndValidateConfig(filePath = DEFAULT_CONFIG_PATH) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new CliError(`could not read config file: ${filePath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError(`config file is not valid JSON: ${filePath}`);
  }

  const errors = validateConfigSchema(parsed);
  if (errors.length > 0) {
    throw new CliError(`config validation failed: ${errors.join("; ")}`);
  }

  return parsed;
}

export function resolveTargetContext(config, targetOverride) {
  const targetName = targetOverride ?? config.defaults.target;
  const targetCfg = config.targets[targetName];
  if (!targetCfg) {
    throw new CliError(`target does not exist in config: ${targetName}`);
  }

  const username = targetCfg.admin.username || process.env[targetCfg.admin.usernameEnv] || "";
  const password = targetCfg.admin.password || process.env[targetCfg.admin.passwordEnv] || "";
  if (!username || !password) {
    throw new CliError("missing admin credentials: set admin.username/admin.password or env variables");
  }

  return {
    targetName,
    server: targetCfg.server,
    admin: {
      username,
      password,
      usernameEnv: targetCfg.admin.usernameEnv ?? "",
      passwordEnv: targetCfg.admin.passwordEnv ?? ""
    },
    docker: {
      composeFile: targetCfg.docker?.composeFile ?? "local/docker-compose.yml",
      envFile: targetCfg.docker?.envFile ?? "local/.env",
      projectName: targetCfg.docker?.projectName ?? ""
    },
    safety: config.safety
  };
}
