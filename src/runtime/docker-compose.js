import { spawn } from "node:child_process";
import { CliError } from "../errors.js";

function run(cmd, args, { inherit = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: inherit ? "inherit" : "pipe"
    });

    let stdout = "";
    let stderr = "";
    if (!inherit) {
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const details = !inherit ? [stdout, stderr].filter(Boolean).join("\n").trim() : "";
        const suffix = details ? `\n${details}` : "";
        reject(new CliError(`docker command failed with exit code ${code}${suffix}`, 1));
      }
    });
  });
}

function composeBaseArgs(dockerCfg) {
  const args = ["compose", "--env-file", dockerCfg.envFile, "-f", dockerCfg.composeFile];
  if (dockerCfg.projectName) {
    args.push("-p", dockerCfg.projectName);
  }
  return args;
}

export async function composeUp(dockerCfg) {
  await run("docker", [...composeBaseArgs(dockerCfg), "up", "-d"]);
}

export async function composeDown(dockerCfg, { volumes = false, images = false } = {}) {
  const args = [...composeBaseArgs(dockerCfg), "down"];
  if (volumes) args.push("-v");
  args.push("--remove-orphans");
  if (images) args.push("--rmi", "all");
  await run("docker", args);
}

export async function composeLogs(dockerCfg) {
  await run("docker", [...composeBaseArgs(dockerCfg), "logs", "-f", "--tail=200"]);
}

export async function composeExec(dockerCfg, service, args, options = {}) {
  await run("docker", [...composeBaseArgs(dockerCfg), "exec", "-T", service, ...args], options);
}

export async function composePs(dockerCfg) {
  const { stdout } = await run("docker", [...composeBaseArgs(dockerCfg), "ps", "--format", "json"], {
    inherit: false
  });
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { Name: "unknown", State: "unknown", raw: line };
    }
  });
}
