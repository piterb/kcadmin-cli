import { readFile, writeFile } from "node:fs/promises";
import { CliError } from "../errors.js";
import { KeycloakAdminClient } from "../runtime/keycloak-admin-client.js";

async function loadJsonFile(path, label) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new CliError(`could not read ${label} file: ${path}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new CliError(`${label} file is not valid JSON: ${path}`);
  }
}

function ensureRemoteMutationAllowed(ctx, allowRemoteMutations) {
  if (
    ctx.targetName === "remote" &&
    ctx.safety.requireAllowRemoteMutations &&
    !allowRemoteMutations
  ) {
    throw new CliError("remote mutations require --allow-remote-mutations", 2);
  }
}

function clientFromCtx(ctx) {
  return new KeycloakAdminClient({
    server: ctx.server,
    username: ctx.admin.username,
    password: ctx.admin.password
  });
}

export async function runRealmApply({ ctx, file, allowRemoteMutations }) {
  ensureRemoteMutationAllowed(ctx, allowRemoteMutations);
  const realmRepresentation = await loadJsonFile(file, "realm");
  const realm = realmRepresentation.realm;
  if (!realm || typeof realm !== "string") {
    throw new CliError("realm JSON must include non-empty string field: realm", 2);
  }

  const client = clientFromCtx(ctx);
  const exists = await client.realmExists(realm);
  if (exists) {
    await client.updateRealm(realm, realmRepresentation);
    return { action: "updated", realm };
  }

  await client.createRealm(realmRepresentation);
  return { action: "created", realm };
}

export async function runRealmReset({ ctx, file, confirm, allowRemoteMutations }) {
  if (ctx.safety.requireConfirmForDestructive && !confirm) {
    throw new CliError("realm reset requires --confirm", 2);
  }
  ensureRemoteMutationAllowed(ctx, allowRemoteMutations);

  const realmRepresentation = await loadJsonFile(file, "realm");
  const realm = realmRepresentation.realm;
  if (!realm || typeof realm !== "string") {
    throw new CliError("realm JSON must include non-empty string field: realm", 2);
  }

  const client = clientFromCtx(ctx);
  if (await client.realmExists(realm)) {
    await client.deleteRealm(realm);
  }
  await client.createRealm(realmRepresentation);
  return { action: "reset", realm };
}

export async function runRealmExport({ ctx, realm, out }) {
  const client = clientFromCtx(ctx);
  const payload = await client.exportRealm(realm);
  await writeFile(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { action: "exported", realm, out };
}

export async function runSeedApply({ ctx, realm, file, allowRemoteMutations }) {
  ensureRemoteMutationAllowed(ctx, allowRemoteMutations);
  const seed = await loadJsonFile(file, "seed");
  const users = seed.users;
  if (!Array.isArray(users)) {
    throw new CliError("seed JSON must include users array", 2);
  }

  const client = clientFromCtx(ctx);
  let processed = 0;

  for (const user of users) {
    if (!user?.username || typeof user.username !== "string") {
      throw new CliError("each seed user must include username", 2);
    }

    const credentials = Array.isArray(user.credentials) ? user.credentials : [];
    const passwordCredential = credentials.find((c) => c?.type === "password");

    const userRepresentation = { ...user };
    delete userRepresentation.credentials;

    const existing = await client.findUserByUsername(realm, user.username);
    let userId = existing?.id;

    if (userId) {
      await client.updateUser(realm, userId, userRepresentation);
    } else {
      await client.createUser(realm, userRepresentation);
      const created = await client.findUserByUsername(realm, user.username);
      userId = created?.id;
    }

    if (!userId) {
      throw new CliError(`failed to resolve user id for username: ${user.username}`);
    }

    if (passwordCredential?.value) {
      await client.setUserPassword(realm, userId, passwordCredential.value);
    }

    const realmRoles = Array.isArray(user.realmRoles) ? user.realmRoles : [];
    if (realmRoles.length > 0) {
      const roleObjects = [];
      for (const roleName of realmRoles) {
        const role = await client.getRealmRole(realm, roleName);
        roleObjects.push({ id: role.id, name: role.name });
      }
      await client.addRealmRolesToUser(realm, userId, roleObjects);
    }

    processed += 1;
  }

  return { action: "seed-applied", realm, processed };
}
