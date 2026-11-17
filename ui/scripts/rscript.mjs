// どの Rscript を使うかを決める（Infrago Quant のすべての R の起動はここを通る）。
//
//   1. 環境変数 RSCRIPT（そのときだけ切り替えるとき）
//   2. プロジェクトルートの settings.local.env の RSCRIPT=（この PC の設定。Git に入れない。見本は settings.example.env）
//   3. PATH 上の Rscript.exe
//
// 指定されたパスに Rscript がなければ、ほかの R に切り替えずに止める（どの R で動いたかを曖昧にしない）。
// R の版を固定したパス（C:/Program Files/R/R-4.6.0/... など）はコードに書かない。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// このファイルの場所（ui/scripts/）からプロジェクトルートを決める。フォルダー名や作業ディレクトリに依らない
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SETTINGS_FILE = join(ROOT, "settings.local.env");
const RSCRIPT_EXE = process.platform === "win32" ? "Rscript.exe" : "Rscript";

function readSetting(key) {
  if (!existsSync(SETTINGS_FILE)) return null;
  for (const line of readFileSync(SETTINGS_FILE, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`));
    if (m) {
      const v = m[1].replace(/^(["'])(.*)\1$/, "$2").trim();
      return v || null;
    }
  }
  return null;
}

function findOnPath(name) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const d = dir.trim().replace(/^"(.*)"$/, "$1");
    if (d && existsSync(join(d, name))) return join(d, name);
  }
  return null;
}

// 案内用：この PC に入っている R（自動では使わない）
export function installedRscripts() {
  const bases = ["C:/Program Files/R", process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "R")].filter(Boolean);
  const found = [];
  for (const base of bases) {
    try {
      for (const d of readdirSync(base)) {
        const p = join(base, d, "bin", RSCRIPT_EXE);
        if (existsSync(p)) found.push(p.replaceAll("\\", "/"));
      }
    } catch {
      /* そのフォルダーはない */
    }
  }
  return found;
}

// { path, source } を返す。見つからなければ path は null
export function resolveRscript() {
  const env = process.env.RSCRIPT?.trim();
  if (env) return { path: env, source: "環境変数 RSCRIPT" };
  const setting = readSetting("RSCRIPT");
  if (setting) return { path: setting, source: "settings.local.env の RSCRIPT" };
  const onPath = findOnPath(RSCRIPT_EXE);
  if (onPath) return { path: onPath, source: `PATH 上の ${RSCRIPT_EXE}` };
  return { path: null, source: null };
}

// 使える Rscript のパスを返す。なければ理由と設定のしかたを示して終了する
export function requireRscript() {
  const r = resolveRscript();
  const hint = () => {
    const found = installedRscripts();
    console.error(`\n設定のしかた：${SETTINGS_FILE} に次の1行を書く（見本は settings.example.env）。`);
    console.error(`  RSCRIPT=${found[0] ?? "C:/Program Files/R/R-x.y.z/bin/Rscript.exe"}`);
    if (found.length) console.error(`この PC で見つかった Rscript：\n${found.map((p) => `  ${p}`).join("\n")}`);
  };
  if (!r.path) {
    console.error(`Rscript が決まりません。settings.local.env にも環境変数 RSCRIPT にも指定がなく、PATH 上にも ${RSCRIPT_EXE} がありません。`);
    hint();
    process.exit(1);
  }
  if (!existsSync(r.path)) {
    console.error(`${r.source} で指定された Rscript が見つかりません：${r.path}`);
    console.error("ほかの R には切り替えません。パスを直してください。");
    hint();
    process.exit(1);
  }
  return r;
}
