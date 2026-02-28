import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runAppInit, normalizeAppInitPaths } from "../../src/commands/app-init.js";

test("normalizeAppInitPaths handles out with and without terraform suffix", () => {
  const cwd = "/tmp/app-repo";

  const plain = normalizeAppInitPaths({ out: "identity", cwd });
  assert.equal(plain.baseDir, "/tmp/app-repo/identity");
  assert.equal(plain.terraformDir, "/tmp/app-repo/identity/terraform");

  const directTerraform = normalizeAppInitPaths({ out: "identity/terraform", cwd });
  assert.equal(directTerraform.baseDir, "/tmp/app-repo/identity");
  assert.equal(directTerraform.terraformDir, "/tmp/app-repo/identity/terraform");
});

test("runAppInit fails when files already exist and --force is not set", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-init-"));
  const existingReadme = join(cwd, "identity", "README.md");

  await mkdir(join(cwd, "identity"), { recursive: true });
  await writeFile(existingReadme, "existing", "utf8");

  await assert.rejects(
    runAppInit({
      realm: "jobhunter-tst",
      out: "identity",
      cwd
    }),
    /app-init aborted, files already exist/
  );
});

test("runAppInit creates expected file set", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-init-"));

  const result = await runAppInit({
    realm: "jobhunter-tst",
    out: "identity",
    cwd
  });

  const expected = [
    join(cwd, "identity", "terraform", "base", "versions.tf"),
    join(cwd, "identity", "terraform", "base", "variables.tf"),
    join(cwd, "identity", "terraform", "base", "main.tf"),
    join(cwd, "identity", "terraform", "base", "outputs.tf"),
    join(cwd, "identity", "terraform", "base", "terraform.tst.tfvars.example"),
    join(cwd, "identity", "README.md")
  ];

  assert.deepEqual(result.createdFiles.sort(), expected.sort());
  for (const file of expected) {
    await access(file);
  }
});

test("runAppInit uses identity as default out directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-init-"));

  await runAppInit({
    realm: "jobhunter-tst",
    cwd
  });

  await access(join(cwd, "identity", "terraform", "base", "versions.tf"));
  await access(join(cwd, "identity", "terraform", "apps"));
  await access(join(cwd, "identity", "README.md"));
});

test("runAppInit interpolates realm/env values and keeps thin setup", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "kcadmin-app-init-"));

  await runAppInit({
    realm: "shop-prd",
    env: "prd",
    out: "identity/terraform",
    cwd
  });

  const variables = await readFile(resolve(cwd, "identity", "terraform", "base", "variables.tf"), "utf8");
  const tfvars = await readFile(resolve(cwd, "identity", "terraform", "base", "terraform.prd.tfvars.example"), "utf8");
  const mainTf = await readFile(resolve(cwd, "identity", "terraform", "base", "main.tf"), "utf8");
  const outputsTf = await readFile(resolve(cwd, "identity", "terraform", "base", "outputs.tf"), "utf8");

  assert.doesNotMatch(variables, /default\s+=\s+"shop-prd"/);
  assert.doesNotMatch(variables, /default\s+=\s+"prd"/);
  assert.match(tfvars, /keycloak_url\s+=/);
  assert.match(tfvars, /keycloak_client_id\s+=/);
  assert.match(tfvars, /keycloak_client_secret\s+=/);
  assert.match(tfvars, /realm_name\s+=\s+"shop-prd"/);
  assert.match(tfvars, /environment\s+=\s+"prd"/);
  assert.doesNotMatch(mainTf, /resource\s+"keycloak_openid_client"/);
  assert.match(outputsTf, /output "keycloak_client_secret"/);
  assert.match(outputsTf, /output "environment"/);
});
