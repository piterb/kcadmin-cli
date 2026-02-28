import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runAppInit } from "../../src/commands/app-init.js";
import { runAppAdd } from "../../src/commands/app-add.js";

test("runAppAdd creates dedicated spa-api app stack files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-add-"));
  await runAppInit({ realm: "demo-tst", cwd });

  const result = await runAppAdd({ profile: "spa-api", name: "web", cwd });
  assert.equal(result.profile, "spa-api");
  assert.equal(result.name, "web");

  const mainTf = await readFile(resolve(cwd, "identity", "terraform", "apps", "web", "main.tf"), "utf8");
  const variablesTf = await readFile(resolve(cwd, "identity", "terraform", "apps", "web", "variables.tf"), "utf8");
  const outputsTf = await readFile(resolve(cwd, "identity", "terraform", "apps", "web", "outputs.tf"), "utf8");
  const tfvarsExample = await readFile(
    resolve(cwd, "identity", "terraform", "apps", "web", "terraform.tst.tfvars.example"),
    "utf8"
  );
  assert.doesNotMatch(variablesTf, /default\s+=\s+"demo-tst"/);
  assert.doesNotMatch(variablesTf, /default\s+=\s+"tst"/);
  assert.match(variablesTf, /variable "base_state_path"/);
  assert.match(tfvarsExample, /\.\.\/\.\.\/base\/terraform\.tst\.tfstate/);
  assert.match(tfvarsExample, /web_spa_redirect_uris/);

  assert.match(mainTf, /data "terraform_remote_state" "base"/);
  assert.match(mainTf, /path = var\.base_state_path/);
  assert.match(mainTf, /realm = local\.realm_name/);
  assert.match(mainTf, /client_id = "web-spa-\$\{local\.environment\}"/);
  assert.match(mainTf, /lifecycle \{/);
  assert.match(mainTf, /Wildcards in web_spa_redirect_uris are not allowed in prd/);
  assert.match(mainTf, /resource "keycloak_openid_client" "web_spa"/);
  assert.match(mainTf, /resource "keycloak_openid_audience_protocol_mapper" "web_spa_api_audience"/);
  assert.match(mainTf, /included_client_audience = keycloak_openid_client\.web_api\.client_id/);
  assert.match(mainTf, /add_to_access_token\s+= true/);
  assert.match(variablesTf, /variable "web_spa_redirect_uris"/);
  assert.doesNotMatch(variablesTf, /validation \{/);
  assert.match(outputsTf, /output "web_spa_client_id"/);
  assert.match(outputsTf, /output "spa_client_id"/);
  assert.match(outputsTf, /output "api_client_id"/);
});

test("runAppAdd rejects duplicate app stack without --force", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-add-"));
  await runAppInit({ realm: "demo-tst", cwd });
  await runAppAdd({ profile: "spa-api", name: "web", cwd });

  await assert.rejects(runAppAdd({ profile: "spa-api", name: "web", cwd }), /app-add aborted, files already exist/);
});

test("runAppAdd supports multiple spa-api pairs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-add-"));
  await runAppInit({ realm: "demo-tst", cwd });

  await runAppAdd({ profile: "spa-api", name: "web", cwd });
  await runAppAdd({ profile: "spa-api", name: "admin", cwd });

  const webMainTf = await readFile(resolve(cwd, "identity", "terraform", "apps", "web", "main.tf"), "utf8");
  const adminMainTf = await readFile(resolve(cwd, "identity", "terraform", "apps", "admin", "main.tf"), "utf8");
  assert.match(webMainTf, /resource "keycloak_openid_client" "web_spa"/);
  assert.match(adminMainTf, /resource "keycloak_openid_client" "admin_spa"/);
});

test("runAppAdd uses env inferred from base tfvars example", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-add-"));
  await runAppInit({ realm: "demo-prd", env: "prd", cwd });

  await runAppAdd({ profile: "spa-api", name: "portal", cwd });

  const tfvarsExample = await readFile(
    resolve(cwd, "identity", "terraform", "apps", "portal", "terraform.prd.tfvars.example"),
    "utf8"
  );
  assert.match(tfvarsExample, /terraform\.prd\.tfvars/);
  assert.match(tfvarsExample, /\.\.\/\.\.\/base\/terraform\.prd\.tfstate/);
});

test("runAppAdd fails with clear hint when app-init scaffold is missing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-add-"));

  await assert.rejects(
    runAppAdd({ profile: "spa-api", name: "web", cwd }),
    /run: kcadmin app-init --realm/
  );
});
