import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const updateServiceSource = await readFile(path.join(repoRoot, "src/main/updateService.ts"), "utf8");
const scriptMatch = updateServiceSource.match(/const installScript = `([\s\S]*?)`;\n\n  await writeFile/);

assert.ok(scriptMatch, "Could not find the macOS update installer script");

const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "scatter-update-cleanup-test-"));
const applicationsPath = path.join(fixtureRoot, "Applications");
const currentAppPath = path.join(applicationsPath, "Scatter.app");
const staleBackupPath = path.join(applicationsPath, ".Scatter.app.previous-stale");
const installTempPath = path.join(fixtureRoot, "install-temp");
const updaterCachePath = path.join(fixtureRoot, "scatter-updater");
const replacementAppPath = path.join(installTempPath, "extracted", "Scatter.app");
const newBackupPath = path.join(applicationsPath, ".Scatter.app.previous-current-run");
const logPath = path.join(fixtureRoot, "update-install.log");
const installScriptPath = path.join(installTempPath, "install-update.sh");

try {
  await Promise.all([
    mkdir(path.join(currentAppPath, "Contents"), { recursive: true }),
    mkdir(path.join(staleBackupPath, "Contents"), { recursive: true }),
    mkdir(path.join(replacementAppPath, "Contents"), { recursive: true }),
    mkdir(path.join(updaterCachePath, "pending"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(currentAppPath, "Contents", "version.txt"), "old", "utf8"),
    writeFile(path.join(staleBackupPath, "Contents", "version.txt"), "stale", "utf8"),
    writeFile(path.join(replacementAppPath, "Contents", "version.txt"), "new", "utf8"),
    writeFile(path.join(updaterCachePath, "update.zip"), "old update package", "utf8"),
    writeFile(path.join(updaterCachePath, "pending", "Scatter-old.zip"), "old pending package", "utf8")
  ]);

  const testableInstallScript = scriptMatch[1].replaceAll('/usr/bin/open "$current"', "/usr/bin/true");
  await writeFile(installScriptPath, testableInstallScript, "utf8");
  await chmod(installScriptPath, 0o755);

  await new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", [
      installScriptPath,
      "2147483647",
      currentAppPath,
      replacementAppPath,
      newBackupPath,
      logPath,
      updaterCachePath
    ]);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Installer exited with code ${code}`)));
  });

  const entries = await readdir(applicationsPath);
  assert.deepEqual(entries, ["Scatter.app"], `Old app backups remain beside the installed app: ${entries.join(", ")}`);
  assert.equal(await readFile(path.join(currentAppPath, "Contents", "version.txt"), "utf8"), "new");
  await assert.rejects(readdir(updaterCachePath), { code: "ENOENT" });
  console.log("PASS: a successful update leaves only the newest Scatter.app");
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
