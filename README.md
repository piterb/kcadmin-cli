# kcadmin-cli

Reusable CLI for Keycloak admin workflows.

Standalone npm package.

## What this tool is for

`kcadmin` gives you one command surface for:
- bootstrapping local Keycloak runtime for development
- applying and resetting realm definitions from JSON files
- applying seed users/roles in a repeatable way
- keeping local and remote target handling consistent

The goal is to replace ad-hoc scripts with explicit commands that are easy to run manually and repeat locally.

## Quick start

```bash
# initialize project scaffold (creates kcadmin/ folder)
kcadmin init

# start local Keycloak runtime
kcadmin up

# apply realm definition
kcadmin realm apply --file kcadmin/realms/example-realm.json

# apply seed users
kcadmin seed apply --realm example --file kcadmin/seeds/example-seed.json
```

Bootstrap Terraform identity skeleton for an app team:

```bash
kcadmin app-init --realm jobhunter-tst --env tst
kcadmin app-add --profile spa-api --name web
```

Then work with Terraform locally:

```bash
cd identity/terraform/base
cp terraform.tst.tfvars.example terraform.tst.tfvars
terraform init
terraform plan  -var-file=terraform.tst.tfvars -state=terraform.tst.tfstate
terraform apply -var-file=terraform.tst.tfvars -state=terraform.tst.tfstate
```

## Command reference

- `kcadmin init [--dir <folder>] [--force]`
  - Create scaffold with config, realm/seed examples, and runtime files.
- `kcadmin app-init --realm <realm_name> [--out <path>] [--env <env>] [--force] [--dry-run]`
  - Generate base Keycloak Terraform skeleton.
  - Creates `identity/terraform/base` and `identity/terraform/apps`.
  - In base stack it generates `terraform.<env>.tfvars.example` for local-only usage.
  - Default output folder is `identity`.
- `kcadmin app-add --profile <profile> --name <name> [--out <path>] [--force]`
  - Create dedicated app stack in `identity/terraform/apps/<name>`.
  - Supported profiles now: `spa-api`.
  - You can call this multiple times for different app names (e.g. `web`, `admin`).
  - Requires initialized scaffold from `kcadmin app-init`.
  - Reads shared Keycloak connection values from `identity/terraform/base/terraform.tfstate`.
  - Generates `terraform.<env>.tfvars.example` only for app-specific inputs.
- `kcadmin up [--target <local|remote>]`
  - Start local runtime (`local` target) and run bootstrap step for local admin setup.
- `kcadmin status [--target <local|remote>]`
  - Print current service status and useful runtime paths/URLs.
- `kcadmin down [--target <local|remote>]`
  - Stop local runtime containers only.
- `kcadmin down --wipe [--target <local|remote>]`
  - Full local cleanup: containers, networks, volumes, images, and orphans.
- `kcadmin reset --confirm [--target <local|remote>]`
  - Factory reset realm state to master-only (deletes all realms except `master`).
- `kcadmin logs [--target <local|remote>]`
  - Follow local runtime logs.
- `kcadmin realm apply --file <realm.json> [--target <local|remote>]`
  - Upsert realm from JSON (`create` if missing, otherwise `update`).
- `kcadmin realm reset --file <realm.json> --confirm [--target <local|remote>]`
  - Delete one realm and recreate it from JSON.
- `kcadmin realm export --realm <name> --out <file> [--target <local|remote>]`
  - Export one realm to JSON file.
- `kcadmin seed apply --realm <name> --file <seed.json> [--target <local|remote>]`
  - Upsert users from seed file and apply realm roles.

`--target` defaults to `local` for all commands.

## Config

Default config path: `kcadmin/kcadmin.config.json`

Example config: `templates/kcadmin.config.example.json`

To bootstrap project files in your current repo:

```bash
kcadmin init
```

This creates:
- `kcadmin/kcadmin.config.json`
- `kcadmin/realms/example-realm.json`
- `kcadmin/seeds/example-seed.json`
- `kcadmin/runtime/docker-compose.yml`
- `kcadmin/runtime/.env`

Generated local runtime uses Docker Compose project name `keycloak-local` by default, so Docker resources are named clearly (`keycloak-local_*`).

`admin` credentials in config can be:
- direct values: `username` + `password`
- env references: `usernameEnv` + `passwordEnv`

`kcadmin up --target local` also sets `master` realm `sslRequired=NONE` automatically, so local HTTP works without manual admin changes.
This is done with the same container-side `kcadm.sh` retry flow as the original Makefile setup.
For this local bootstrap step, `kcadmin` uses `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD` from `kcadmin/runtime/.env`.

## Safety model

- Destructive commands require `--confirm`.
- Remote mutations can require explicit `--allow-remote-mutations` (based on config safety settings).
- Commands fail with explicit non-zero exit codes on validation/runtime errors.

## Debugging and diagnostics

Use `--verbose` to print resolved runtime context (config path, target, server URL, safety flags):

```bash
kcadmin realm export --target remote --realm master --out ./master.json --verbose
```

This is useful when you want to verify which config file and target URL are actually being used.

Use dry-run for scaffold planning:

```bash
kcadmin app-init --realm jobhunter-tst --dry-run
```

## Identity Terraform structure

```text
identity/
  terraform/
    base/
      versions.tf
      variables.tf
      main.tf
      outputs.tf
      terraform.<env>.tfvars.example
    apps/
      <app-name>/
        versions.tf
        variables.tf
        main.tf
        outputs.tf
        terraform.<env>.tfvars.example
```

## Local Terraform inputs

The generated stacks are local-first. Fill Terraform inputs in `terraform.<env>.tfvars` per stack:

- base stack:
  - `keycloak_url`
  - `keycloak_client_id`
  - `keycloak_client_secret`
  - `realm_name`
  - `environment`
- app stack adds:
  - optional `base_state_path`
  - `<app>_spa_redirect_uris`
  - `<app>_spa_web_origins`
  - `<app>_api_audience`
  - `<app>_enable_direct_access_grants`

App stacks read shared values (`keycloak_url`, `keycloak_client_id`, `keycloak_client_secret`, `realm_name`, `environment`) from the base Terraform state file. That means:

1. run `terraform apply` in `identity/terraform/base` first
2. then run `terraform plan/apply` in `identity/terraform/apps/<app>`

Recommended commands:

```bash
cd identity/terraform/base
cp terraform.tst.tfvars.example terraform.tst.tfvars
terraform init
terraform plan  -var-file=terraform.tst.tfvars -state=terraform.tst.tfstate
terraform apply -var-file=terraform.tst.tfvars -state=terraform.tst.tfstate

cd ../apps/web
cp terraform.tst.tfvars.example terraform.tst.tfvars
terraform init
terraform plan  -var-file=terraform.tst.tfvars -state=terraform.tst.tfstate
terraform apply -var-file=terraform.tst.tfvars -state=terraform.tst.tfstate
```

## Remove an app stack

To remove one app stack safely (example: `web`):

1. Destroy managed Keycloak resources for that app stack:
```bash
cd identity/terraform/apps/web
terraform init
terraform destroy -auto-approve
```
2. Remove stack files:
```bash
rm -rf identity/terraform/apps/web
```
3. Commit the deletion change.

## Typical workflow in a project

```bash
# one-time scaffold
kcadmin init

# day-to-day
kcadmin up
kcadmin realm apply --file kcadmin/realms/my-realm.json
kcadmin seed apply --realm my-realm --file kcadmin/seeds/my-seed.json
kcadmin status
kcadmin down
```

## Test

```bash
npm test
```

Tests are fully self-contained and require no external services.

## Publish

```bash
npm whoami || npm login
npm whoami
npm pack
npm publish --access public
```
