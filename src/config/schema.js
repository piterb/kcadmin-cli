const TARGETS = new Set(["local", "remote"]);

function ensureNonEmptyString(value, label, errors) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function ensureString(value, label, errors) {
  if (typeof value !== "string") {
    errors.push(`${label} must be a string`);
  }
}

export function validateConfigSchema(config) {
  const errors = [];

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return ["config must be a JSON object"];
  }

  if (config.version !== 1) {
    errors.push("version must be 1");
  }

  if (typeof config.defaults !== "object" || config.defaults === null) {
    errors.push("defaults must be an object");
  } else if (!TARGETS.has(config.defaults.target)) {
    errors.push("defaults.target must be one of: local, remote");
  }

  if (typeof config.targets !== "object" || config.targets === null) {
    errors.push("targets must be an object");
  } else {
    for (const target of TARGETS) {
      const targetCfg = config.targets[target];
      if (typeof targetCfg !== "object" || targetCfg === null) {
        errors.push(`targets.${target} must be an object`);
        continue;
      }

      ensureNonEmptyString(targetCfg.server, `targets.${target}.server`, errors);

      if (typeof targetCfg.admin !== "object" || targetCfg.admin === null) {
        errors.push(`targets.${target}.admin must be an object`);
      } else {
        const hasDirect =
          typeof targetCfg.admin.username === "string" &&
          targetCfg.admin.username.trim().length > 0 &&
          typeof targetCfg.admin.password === "string" &&
          targetCfg.admin.password.trim().length > 0;
        const hasEnv =
          typeof targetCfg.admin.usernameEnv === "string" &&
          targetCfg.admin.usernameEnv.trim().length > 0 &&
          typeof targetCfg.admin.passwordEnv === "string" &&
          targetCfg.admin.passwordEnv.trim().length > 0;

        if (targetCfg.admin.username !== undefined) {
          ensureNonEmptyString(targetCfg.admin.username, `targets.${target}.admin.username`, errors);
        }
        if (targetCfg.admin.password !== undefined) {
          ensureNonEmptyString(targetCfg.admin.password, `targets.${target}.admin.password`, errors);
        }
        if (targetCfg.admin.usernameEnv !== undefined) {
          ensureNonEmptyString(targetCfg.admin.usernameEnv, `targets.${target}.admin.usernameEnv`, errors);
        }
        if (targetCfg.admin.passwordEnv !== undefined) {
          ensureNonEmptyString(targetCfg.admin.passwordEnv, `targets.${target}.admin.passwordEnv`, errors);
        }

        if (!hasDirect && !hasEnv) {
          errors.push(
            `targets.${target}.admin must define either username/password or usernameEnv/passwordEnv`
          );
        }
      }

      if (target === "local" && targetCfg.docker !== undefined) {
        if (typeof targetCfg.docker !== "object" || targetCfg.docker === null) {
          errors.push("targets.local.docker must be an object when provided");
        } else {
          if (targetCfg.docker.composeFile !== undefined) {
            ensureNonEmptyString(targetCfg.docker.composeFile, "targets.local.docker.composeFile", errors);
          }
          if (targetCfg.docker.envFile !== undefined) {
            ensureNonEmptyString(targetCfg.docker.envFile, "targets.local.docker.envFile", errors);
          }
          if (targetCfg.docker.projectName !== undefined) {
            ensureString(targetCfg.docker.projectName, "targets.local.docker.projectName", errors);
          }
        }
      }
    }
  }

  if (typeof config.safety !== "object" || config.safety === null) {
    errors.push("safety must be an object");
  } else {
    if (typeof config.safety.requireConfirmForDestructive !== "boolean") {
      errors.push("safety.requireConfirmForDestructive must be boolean");
    }
    if (typeof config.safety.requireAllowRemoteMutations !== "boolean") {
      errors.push("safety.requireAllowRemoteMutations must be boolean");
    }
  }

  return errors;
}
