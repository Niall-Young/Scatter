import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, "native", "accessibility-guide", "AccessibilityGuide.swift");
const outputDir = path.join(repoRoot, "build", "accessibility-guide");
const outputPath = path.join(outputDir, "ScatterAccessibilityGuide");
const archBuilds = [
  {
    target: "arm64-apple-macos13.0",
    outputPath: path.join(outputDir, "ScatterAccessibilityGuide-arm64")
  },
  {
    target: "x86_64-apple-macos13.0",
    outputPath: path.join(outputDir, "ScatterAccessibilityGuide-x86_64")
  }
];

mkdirSync(outputDir, { recursive: true });

for (const archBuild of archBuilds) {
  execFileSync(
    "xcrun",
    [
      "swiftc",
      "-O",
      "-parse-as-library",
      "-target",
      archBuild.target,
      "-framework",
      "AppKit",
      "-framework",
      "ApplicationServices",
      sourcePath,
      "-o",
      archBuild.outputPath
    ],
    {
      cwd: repoRoot,
      stdio: "inherit"
    }
  );
}

execFileSync("xcrun", ["lipo", "-create", ...archBuilds.map((archBuild) => archBuild.outputPath), "-output", outputPath], {
  cwd: repoRoot,
  stdio: "inherit"
});

for (const archBuild of archBuilds) {
  rmSync(archBuild.outputPath, { force: true });
}
