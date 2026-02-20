# kcadmin-cli

Reusable CLI foundation for Keycloak admin workflows.

Standalone npm package.

## Commands

- `kcadmin init [--dir <folder>] [--force]`
- `kcadmin up`
- `kcadmin status`
- `kcadmin down`
- `kcadmin down --wipe` (full cleanup: containers, networks, volumes, images, orphans)
- `kcadmin reset --confirm` (factory reset realms to master-only state without wiping Docker runtime)
- `kcadmin logs`
- `kcadmin realm apply --file <realm.json>`
- `kcadmin realm reset --file <realm.json> --confirm`
- `kcadmin realm export --realm <name> --out <file>`
- `kcadmin seed apply --realm <name> --file <seed.json>`

`--target` is optional for all commands and defaults to `local`.

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
