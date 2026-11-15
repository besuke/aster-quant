// Rscript を cmd.exe の引用符処理を通さずに起動する（既定の R のパスに空白がある）。
//   node scripts/run-r.mjs <script.R> [args...]     RSCRIPT で別の Rscript を指定できる
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const rscript = process.env.RSCRIPT ?? "C:/Program Files/R/R-4.6.0/bin/Rscript.exe";
if (!existsSync(rscript)) {
  console.error(`Rscript が見つからない: ${rscript}\n環境変数 RSCRIPT でパスを指定する。`);
  process.exit(1);
}
const child = spawn(rscript, process.argv.slice(2), { stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
