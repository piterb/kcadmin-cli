import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError } from "../errors.js";

const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");

const FILES = [
  { from: "kcadmin.config.example.json", to: "kcadmin.config.json" },
  { from: "realm.example.json", to: join("realms", "example-realm.json") },
  { from: "seed.example.json", to: join("seeds", "example-seed.json") },
  { from: "runtime.docker-compose.yml", to: join("runtime", "docker-compose.yml") },
  { from: "runtime.env", to: join("runtime", ".env") }
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runInitScaffold({ dir, force }) {
  const baseDir = resolve(process.cwd(), dir || "kcadmin");

  await mkdir(baseDir, { recursive: true });
  await mkdir(join(baseDir, "realms"), { recursive: true });
  await mkdir(join(baseDir, "seeds"), { recursive: true });
  await mkdir(join(baseDir, "runtime"), { recursive: true });

  if (!force) {
    const conflicts = [];
    for (const file of FILES) {
      const destination = join(baseDir, file.to);
      if (await exists(destination)) {
        conflicts.push(destination);
      }
    }
    if (conflicts.length > 0) {
      throw new CliError(
        `init aborted, files already exist:\n${conflicts.join("\n")}\nuse --force to overwrite`,
        2
      );
    }
  }

  for (const file of FILES) {
    const source = join(TEMPLATE_DIR, file.from);
    const destination = join(baseDir, file.to);
    await copyFile(source, destination);
  }

  return {
    dir: baseDir,
    files: FILES.map((file) => join(baseDir, file.to))
  };
}
