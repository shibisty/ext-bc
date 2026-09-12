/**
 * Builds the extension for Chrome and Firefox from the shared src/ folder.
 *
 *   node scripts/build.mjs            # build both, produce dist/*.zip
 *   node scripts/build.mjs --watch    # rebuild on change, no zips
 *
 * Replaces the old build.sh / build.bat / firefox.py trio: one cross-platform
 * script, and zips are written with forward slashes so AMO accepts them.
 */
import { build, context } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yazl from "yazl";
import { TARGETS, manifestFor } from "./manifest.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const watch = process.argv.includes("--watch");

const rel = (...parts) => path.join(root, ...parts);

/** Walks a directory, returning every file path relative to it. */
async function walk(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rp = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await walk(path.join(dir, entry.name), rp)));
    else files.push(rp);
  }
  return files;
}

/** Zips a directory with POSIX separators, which is what AMO and the CWS expect. */
async function zipDir(dir, outFile) {
  const zip = new yazl.ZipFile();
  for (const file of (await walk(dir)).sort()) {
    zip.addFile(path.join(dir, file), file);
  }
  zip.end();

  await new Promise((resolve, reject) => {
    const out = createWriteStream(outFile);
    zip.outputStream.pipe(out).on("close", resolve).on("error", reject);
  });

  const { size } = await stat(outFile);
  console.log(`    -> ${path.relative(root, outFile)} (${Math.round(size / 1024)} KB)`);
}

async function copyStatic(outdir, target) {
  await cp(rel("src/_locales"), path.join(outdir, "_locales"), { recursive: true });
  await cp(rel("src/icons"), path.join(outdir, "icons"), { recursive: true });
  await cp(rel("src/ui/popup.css"), path.join(outdir, "popup.css"));

  // sidepanel.html is popup.html with one extra body class — generated rather
  // than kept as a second near-identical copy in the repo. Both browsers get
  // it: Chrome through side_panel, Firefox through sidebar_action.
  const html = await readFile(rel("src/ui/popup.html"), "utf8");
  await writeFile(path.join(outdir, "popup.html"), html);
  await writeFile(
    path.join(outdir, "sidepanel.html"),
    html.replace("<body>", '<body class="side-panel-mode">'),
  );

  await writeFile(
    path.join(outdir, "manifest.json"),
    `${JSON.stringify(manifestFor(target), null, 2)}\n`,
  );
}

async function buildTarget(target) {
  console.log(`==> Building ${target}...`);
  const outdir = rel("dist", target);
  await mkdir(outdir, { recursive: true });

  /**
   * IIFE rather than ESM: no "type": "module" needed in the manifest and no
   * module script tag in popup.html, which keeps Firefox 115 happy.
   */
  const options = {
    entryPoints: {
      background: rel("src/background/index.ts"),
      popup: rel("src/popup/index.ts"),
    },
    outdir,
    bundle: true,
    format: "iife",
    target: ["chrome114", "firefox115"],
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    define: { __TARGET__: JSON.stringify(target) },
    legalComments: "none",
    logLevel: "warning",
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
  } else {
    await build(options);
  }

  await copyStatic(outdir, target);

  if (!watch) {
    await zipDir(outdir, rel("dist", `bookmark-status-checker-${target}.zip`));
  }
}

await rm(rel("dist"), { recursive: true, force: true });
await mkdir(rel("dist"), { recursive: true });

for (const target of TARGETS) {
  await buildTarget(target);
}

console.log(watch ? "Watching for changes..." : "Done.");
