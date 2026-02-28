import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliError } from "../errors.js";
import { normalizeAppInitPaths } from "./app-init.js";

const SUPPORTED_PROFILES = new Set(["spa-api"]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function inferEnvFromBase(baseStackDir) {
  const entries = await readdir(baseStackDir, { withFileTypes: true });
  const match = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.match(/^terraform\.([a-z0-9-]+)\.tfvars\.example$/u))
    .find(Boolean);

  return match?.[1] ?? "tst";
}

function ensureProfile(profile) {
  if (!profile || typeof profile !== "string") {
    throw new CliError("missing required flag: --profile <profile>", 2);
  }
  if (!SUPPORTED_PROFILES.has(profile)) {
    throw new CliError(`unsupported profile: ${profile}. supported: spa-api`, 2);
  }
}

function ensureName(name) {
  if (!name || typeof name !== "string") {
    throw new CliError("missing required flag: --name <name>", 2);
  }
  if (!/^[a-z0-9-]+$/u.test(name)) {
    throw new CliError("--name must match: [a-z0-9-]+", 2);
  }
}

function renderVersionsTf() {
  return `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"
    }
  }
}
`;
}

function renderVariablesTf({ appName }) {
  const variablePrefix = appName.replace(/-/gu, "_");
  return `variable "base_state_path" {
  description = "Path to the base Terraform state file"
  type        = string
  default     = "../../base/terraform.tfstate"
}

variable "${variablePrefix}_spa_redirect_uris" {
  description = "Allowed redirect URIs for SPA '${appName}'"
  type        = list(string)
}

variable "${variablePrefix}_spa_web_origins" {
  description = "Allowed web origins for SPA '${appName}'"
  type        = list(string)
}

variable "${variablePrefix}_api_audience" {
  description = "Audience value for API '${appName}'"
  type        = string
  default     = "${appName}-api"
}

variable "${variablePrefix}_enable_direct_access_grants" {
  description = "Enable direct grants for SPA '${appName}' only when explicitly required"
  type        = bool
  default     = false
}
`;
}

function renderMainTf({ appName }) {
  const variablePrefix = appName.replace(/-/gu, "_");
  return `provider "keycloak" {
  url           = data.terraform_remote_state.base.outputs.keycloak_url
  client_id     = data.terraform_remote_state.base.outputs.keycloak_client_id
  client_secret = data.terraform_remote_state.base.outputs.keycloak_client_secret
  realm         = data.terraform_remote_state.base.outputs.realm_name
}

data "terraform_remote_state" "base" {
  backend = "local"

  config = {
    path = var.base_state_path
  }
}

locals {
  realm_name  = data.terraform_remote_state.base.outputs.realm_name
  environment = data.terraform_remote_state.base.outputs.environment
}

data "keycloak_realm" "target" {
  realm = local.realm_name
}

resource "keycloak_openid_client" "${variablePrefix}_spa" {
  realm_id  = data.keycloak_realm.target.id
  client_id = "${appName}-spa-\${local.environment}"
  name      = "${appName} SPA"

  access_type                  = "PUBLIC"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = var.${variablePrefix}_enable_direct_access_grants

  pkce_code_challenge_method = "S256"
  valid_redirect_uris        = var.${variablePrefix}_spa_redirect_uris
  web_origins                = var.${variablePrefix}_spa_web_origins

  lifecycle {
    precondition {
      condition = local.environment != "prd" || alltrue([
        for uri in var.${variablePrefix}_spa_redirect_uris : !strcontains(uri, "*")
      ])
      error_message = "Wildcards in ${variablePrefix}_spa_redirect_uris are not allowed in prd."
    }

    precondition {
      condition = local.environment != "prd" || alltrue([
        for origin in var.${variablePrefix}_spa_web_origins : !strcontains(origin, "*")
      ])
      error_message = "Wildcards in ${variablePrefix}_spa_web_origins are not allowed in prd."
    }
  }
}

resource "keycloak_openid_client" "${variablePrefix}_api" {
  realm_id  = data.keycloak_realm.target.id
  client_id = "${appName}-api-\${local.environment}"
  name      = "${appName} API"

  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = false
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = true
}

resource "keycloak_openid_audience_protocol_mapper" "${variablePrefix}_spa_api_audience" {
  realm_id  = data.keycloak_realm.target.id
  client_id = keycloak_openid_client.${variablePrefix}_spa.id
  name      = "${appName} API audience"

  included_client_audience = keycloak_openid_client.${variablePrefix}_api.client_id
  add_to_access_token      = true
  add_to_id_token          = false
}

resource "keycloak_role" "${variablePrefix}_app_user" {
  realm_id    = data.keycloak_realm.target.id
  name        = "${appName}_app_user"
  description = "Base role for ${appName} application users"
}
`;
}

function renderOutputsTf({ appName }) {
  const variablePrefix = appName.replace(/-/gu, "_");
  return `output "${variablePrefix}_spa_client_id" {
  description = "SPA client id for ${appName}"
  value       = keycloak_openid_client.${variablePrefix}_spa.client_id
}

output "${variablePrefix}_api_client_id" {
  description = "API client id for ${appName}"
  value       = keycloak_openid_client.${variablePrefix}_api.client_id
}

output "spa_client_id" {
  description = "Generic SPA client id contract for consumer stacks"
  value       = keycloak_openid_client.${variablePrefix}_spa.client_id
}

output "api_client_id" {
  description = "Generic API client id contract for consumer stacks"
  value       = keycloak_openid_client.${variablePrefix}_api.client_id
}
`;
}

function renderTfvarsExample({ appName, env }) {
  const variablePrefix = appName.replace(/-/gu, "_");
  return `# Copy to terraform.${env}.tfvars for LOCAL usage only.
# This file is app-specific. Shared Keycloak connection values come from ../../base/terraform.${env}.tfstate.
#
# Optional: override base state location only if you moved the base stack/state file.
# base_state_path = "../../base/terraform.${env}.tfstate"

${variablePrefix}_spa_redirect_uris = [
  "http://localhost:3000/auth/callback"
]

${variablePrefix}_spa_web_origins = [
  "http://localhost:3000"
]

${variablePrefix}_api_audience = "${appName}-api"

${variablePrefix}_enable_direct_access_grants = false
`;
}

export async function runAppAdd({ profile, name, out = "identity", force = false, cwd = process.cwd() }) {
  ensureProfile(profile);
  ensureName(name);

  const paths = normalizeAppInitPaths({ out, cwd });
  const requiredBaseFiles = [
    join(paths.baseStackDir, "versions.tf"),
    join(paths.baseStackDir, "variables.tf"),
    join(paths.baseStackDir, "main.tf"),
    join(paths.baseStackDir, "outputs.tf")
  ];


  for (const required of requiredBaseFiles) {
    if (!(await exists(required))) {
      throw new CliError(
        `app-add requires initialized app scaffold in: ${paths.baseStackDir}\nrun: kcadmin app-init --realm <realm> [--out <path>]`,
        2
      );
    }
  }

  const inferredEnv = await inferEnvFromBase(paths.baseStackDir);

  const appStackDir = join(paths.appsDir, name);
  const files = [
    { path: join(appStackDir, "versions.tf"), content: renderVersionsTf() },
    {
      path: join(appStackDir, "variables.tf"),
      content: renderVariablesTf({ appName: name })
    },
    { path: join(appStackDir, "main.tf"), content: renderMainTf({ appName: name }) },
    { path: join(appStackDir, "outputs.tf"), content: renderOutputsTf({ appName: name }) },
    { path: join(appStackDir, `terraform.${inferredEnv}.tfvars.example`), content: renderTfvarsExample({ appName: name, env: inferredEnv }) }
  ];

  if (!force) {
    const conflicts = [];
    for (const file of files) {
      if (await exists(file.path)) conflicts.push(file.path);
    }
    if (conflicts.length > 0) {
      throw new CliError(
        `app-add aborted, files already exist:\n${conflicts.join("\n")}\nuse --force to overwrite`,
        2
      );
    }
  }

  await mkdir(appStackDir, { recursive: true });
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content, "utf8");
  }

  return {
    profile,
    name,
    appStackDir,
    filesUpdated: files.map((f) => f.path)
  };
}
