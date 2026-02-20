# kcadmin-cli

Reusable CLI for Keycloak admin workflows.

Standalone npm package.

## What this tool is for

`kcadmin` gives you one command surface for:
- bootstrapping local Keycloak runtime for development
- applying and resetting realm definitions from JSON files
- applying seed users/roles in a repeatable way
- keeping local and remote target handling consistent

The goal is to replace ad-hoc scripts with explicit commands that are easy to run manually and in CI.

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

## Command reference

- `kcadmin init [--dir <folder>] [--force]`
  - Create scaffold with config, realm/seed examples, and runtime files.
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
