import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { CliError } from "../errors.js";

function trimTrailingSeparators(input) {
  return input.replace(/[\\/]+$/u, "") || input;
}

function toPosixPath(input) {
  return input.split(sep).join("/");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function normalizeAppInitPaths({ out, cwd = process.cwd() }) {
  const rootDir = resolve(cwd);
  const outResolved = resolve(rootDir, trimTrailingSeparators(out));

  if (outResolved !== rootDir && !outResolved.startsWith(`${rootDir}${sep}`)) {
    throw new CliError(`--out must stay inside current working directory: ${out}`, 2);
  }

  const isTerraformDir = outResolved.endsWith(`${sep}terraform`) || outResolved === join(rootDir, "terraform");
  const baseDir = isTerraformDir ? dirname(outResolved) : outResolved;
  const terraformDir = isTerraformDir ? outResolved : join(outResolved, "terraform");

  return {
    rootDir,
    baseDir,
    terraformDir,
    baseStackDir: join(terraformDir, "base"),
    appsDir: join(terraformDir, "apps"),
    baseDirRelative: toPosixPath(relative(rootDir, baseDir) || "."),
    terraformDirRelative: toPosixPath(relative(rootDir, terraformDir) || "."),
    baseStackDirRelative: toPosixPath(relative(rootDir, join(terraformDir, "base")) || "."),
    appsDirRelative: toPosixPath(relative(rootDir, join(terraformDir, "apps")) || ".")
  };
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

function renderVariablesTf({ realm, env }) {
  return `variable "keycloak_url" {
  description = "Keycloak base URL"
  type        = string
}

variable "keycloak_client_id" {
  description = "Client ID with permissions to manage app resources"
  type        = string
}

variable "keycloak_client_secret" {
  description = "Client secret for keycloak_client_id"
  type        = string
  sensitive   = true
}

variable "realm_name" {
  description = "Existing realm managed by the platform team"
  type        = string
}

variable "environment" {
  description = "Environment label used for conventions (tst/stg/prd)"
  type        = string
}
`;
}

function renderMainTf() {
  return `provider "keycloak" {
  url           = var.keycloak_url
  client_id     = var.keycloak_client_id
  client_secret = var.keycloak_client_secret
  realm         = var.realm_name
}

data "keycloak_realm" "target" {
  realm = var.realm_name
}

# Base stack bootstrap only:
# - shared provider/auth wiring
# - existing realm reference
# - no app-specific clients/roles here
`;
}

function renderOutputsTf() {
  return `output "keycloak_url" {
  description = "Keycloak base URL shared with app stacks"
  value       = var.keycloak_url
}

output "keycloak_client_id" {
  description = "Terraform client id shared with app stacks"
  value       = var.keycloak_client_id
}

output "keycloak_client_secret" {
  description = "Terraform client secret shared with app stacks"
  value       = var.keycloak_client_secret
  sensitive   = true
}

output "realm_name" {
  description = "Target realm used by this stack"
  value       = data.keycloak_realm.target.realm
}

output "environment" {
  description = "Environment label shared with app stacks"
  value       = var.environment
}
`;
}

function renderTfvarsExample({ env, withExampleValues, realm }) {
  const keycloakUrl = withExampleValues ? "https://keycloak.example.com" : "<set-keycloak-url>";
  return `# Copy to terraform.${env}.tfvars for LOCAL usage only.
# This file holds sensitive credentials. Do NOT commit terraform.${env}.tfvars.

keycloak_url           = "${keycloakUrl}"
keycloak_client_id     = "terraform-identity-base-${env}"
keycloak_client_secret = "<set-local-secret>"
realm_name             = "${realm}"
environment            = "${env}"
`;
}

function renderReadme({
  realm,
  outDisplay,
  env,
  baseStackDirRelative,
  appsDirRelative
}) {
  return `# Keycloak Identity Bootstrap

This folder contains a local-first Terraform setup split by stacks:
- base stack: \`${baseStackDirRelative}\`
- app stacks: \`${appsDirRelative}/<app-name>\`

The realm is expected to already exist and be managed by the platform team.

## Quickstart

1. Review \`${baseStackDirRelative}/terraform.tfvars.example\` and copy to \`terraform.tfvars\`.
2. Run local Terraform plan/apply in base stack:
   - \`cd ${baseStackDirRelative}\`
   - \`terraform init\`
   - \`cp terraform.${env}.tfvars.example terraform.${env}.tfvars\`
   - \`terraform plan -var-file=terraform.${env}.tfvars -state=terraform.${env}.tfstate\`
   - \`terraform apply -var-file=terraform.${env}.tfvars -state=terraform.${env}.tfstate\`
3. Add first app stack:
   - \`kcadmin app-add --profile spa-api --name web\`
4. Run local Terraform plan/apply in the app stack you changed.

## Defaults from bootstrap

- realm: \`${realm}\`
- environment: \`${env}\`
- folder: \`${outDisplay}\`
`;
}

export function buildAppInitFiles({ realm, env, withExampleValues, paths }) {
  const outDisplay = paths.baseDirRelative === "." ? "./" : paths.baseDirRelative;
  return [
    { path: join(paths.baseStackDir, "versions.tf"), content: renderVersionsTf() },
    { path: join(paths.baseStackDir, "variables.tf"), content: renderVariablesTf({ realm, env }) },
    { path: join(paths.baseStackDir, "main.tf"), content: renderMainTf() },
    { path: join(paths.baseStackDir, "outputs.tf"), content: renderOutputsTf() },
    {
      path: join(paths.baseStackDir, `terraform.${env}.tfvars.example`),
      content: renderTfvarsExample({ env, withExampleValues, realm })
    },
    {
      path: join(paths.baseDir, "README.md"),
      content: renderReadme({
        realm,
        outDisplay,
        env,
        baseStackDirRelative: paths.baseStackDirRelative,
        appsDirRelative: paths.appsDirRelative
      })
    }
  ];
}

export async function runAppInit({
  realm,
  out = "identity",
  env = "tst",
  force = false,
  dryRun = false,
  withExampleValues = true,
  cwd = process.cwd()
}) {
  if (!realm || typeof realm !== "string") {
    throw new CliError("missing required flag: --realm <realm_name>", 2);
  }
  if (!out || typeof out !== "string" || out.trim().length === 0) {
    throw new CliError("invalid --out value", 2);
  }

  const paths = normalizeAppInitPaths({ out, cwd });
  const files = buildAppInitFiles({ realm, env, withExampleValues, paths });

  if (!force) {
    const conflicts = [];
    for (const file of files) {
      if (await exists(file.path)) conflicts.push(file.path);
    }
    if (conflicts.length > 0) {
      throw new CliError(
        `app-init aborted, files already exist:\n${conflicts.join("\n")}\nuse --force to overwrite`,
        2
      );
    }
  }

  if (!dryRun) {
    await mkdir(paths.baseStackDir, { recursive: true });
    await mkdir(paths.appsDir, { recursive: true });

    for (const file of files) {
      await writeFile(file.path, file.content, "utf8");
    }
  }

  return {
    dryRun,
    rootDir: paths.rootDir,
    realm,
    env,
    createdFiles: files.map((f) => f.path),
    terraformDir: paths.terraformDir,
    baseStackDir: paths.baseStackDir,
    appsDir: paths.appsDir
  };
}
