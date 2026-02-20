import { CliError } from "../errors.js";
import { composeDown, composeExec, composeLogs, composePs, composeUp } from "../runtime/docker-compose.js";
import { readFile } from "node:fs/promises";

function assertLocalTarget(ctx) {
  if (ctx.targetName !== "local") {
    throw new CliError("command supports only --target local", 2);
  }
}

export async function runUp({ ctx }) {
  assertLocalTarget(ctx);
  await composeUp(ctx.docker);
  await disableMasterSslRequirement(ctx);
}

export async function runDown({ ctx }) {
  assertLocalTarget(ctx);
  await composeDown(ctx.docker);
}

export async function runDownWipe({ ctx }) {
  assertLocalTarget(ctx);
  await composeDown(ctx.docker, { volumes: true, images: true });
}

export async function runLogs({ ctx }) {
  assertLocalTarget(ctx);
  await composeLogs(ctx.docker);
}

export async function runStatus({ ctx }) {
  assertLocalTarget(ctx);
  const services = await composePs(ctx.docker);
  const adminUrl = `${ctx.server}/admin`;
  const baseUrl = ctx.server;
  const dockerProject = ctx.docker.projectName || "default";
  const details = [
    `target: ${ctx.targetName}`,
    `Keycloak Admin: ${adminUrl}`,
    `Keycloak Base:  ${baseUrl}`,
    `Compose file: ${ctx.docker.composeFile}`,
    `Env file: ${ctx.docker.envFile}`,
    `Project name: ${dockerProject}`,
    "Logs command: kcadmin logs"
  ];

  if (services.length === 0) {
    details.push("Services: none running");
  } else {
    details.push(
      ...services.map((svc) => {
        const name = svc.Name || svc.Service || "unknown";
        const state = svc.State || "unknown";
        const health = svc.Health ? `/${svc.Health}` : "";
        return `Service: ${name} -> ${state}${health}`;
      })
    );
  }

  return { details };
}

async function disableMasterSslRequirement(ctx) {
  const bootstrapAdmin = await resolveBootstrapAdmin(ctx);
  const maxAttempts = 10;
  const delayMs = 2000;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await composeExec(
        ctx.docker,
        "keycloak",
        [
          "/opt/keycloak/bin/kcadm.sh",
          "config",
          "credentials",
          "--server",
          "http://localhost:8080",
          "--realm",
          "master",
          "--user",
          bootstrapAdmin.username,
          "--password",
          bootstrapAdmin.password
        ],
        { inherit: false }
      );
      await composeExec(
        ctx.docker,
        "keycloak",
        ["/opt/keycloak/bin/kcadm.sh", "update", "realms/master", "-s", "sslRequired=NONE"],
        { inherit: false }
      );
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new CliError(
    `could not set sslRequired=NONE automatically; verify admin bootstrap credentials and check logs\n${
      lastError?.message ?? "unknown error"
    }`
  );
}

async function resolveBootstrapAdmin(ctx) {
  const envPath = ctx.docker?.envFile;
  if (!envPath) {
    return { username: ctx.admin.username, password: ctx.admin.password };
  }

  try {
    const content = await readFile(envPath, "utf8");
    const env = parseEnv(content);
    return {
      username: env.KEYCLOAK_ADMIN || ctx.admin.username,
      password: env.KEYCLOAK_ADMIN_PASSWORD || ctx.admin.password
    };
  } catch {
    return { username: ctx.admin.username, password: ctx.admin.password };
  }
}

function parseEnv(content) {
  const out = {};
  const lines = content.split(/\r?\n/u);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
