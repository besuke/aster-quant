// R スクリプトを Rscript で起動する。cmd.exe の引用符処理を通さない（R のパスに空白があることが多い）。
//
//   node scripts/run-r.mjs <script.R> [args...]          そのまま動かす
//   node scripts/run-r.mjs --check <script.R> [args...]  R の版と必須パッケージを確かめてから動かす（npm run api・lan）
//   node scripts/run-r.mjs --check                       確かめるだけ（npm run check:r）
//
// どの Rscript を使うかは rscript.mjs が決める（環境変数 RSCRIPT → config/settings.local.env の RSCRIPT → PATH）。
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, installedRscripts, requireRscript } from "./rscript.mjs";

let args = process.argv.slice(2);
const check = args[0] === "--check";
if (check) args = args.slice(1);

const r = requireRscript();
console.log(`R：${r.path}（${r.source}）`);

if (check) {
  const res = spawnSync(r.path, [join(ROOT, "server", "scripts", "check_r.R")], { stdio: "inherit" });
  if (res.status !== 0) {
    const others = installedRscripts().filter((p) => p.toLowerCase() !== r.path.replaceAll("\\", "/").toLowerCase());
    if (others.length) {
      console.error("\nこの PC にある、ほかの R（config/settings.local.env の RSCRIPT か、環境変数 RSCRIPT で指定できる）：");
      for (const p of others) console.error(`  ${p}`);
    }
    process.exit(res.status ?? 1);
  }
  if (!args.length) process.exit(0);
}

const child = spawn(r.path, args, { stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
