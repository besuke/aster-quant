# 選ばれた R の版と、Infrago Quant Server の必須パッケージ（rmql など）を読み込めるかを確かめる。
#
#   npm run check:r           （ui/ で実行。R は ui/scripts/rscript.mjs が選ぶ）
#   Rscript server/scripts/check_r.R
#
# 読み込めないものがあれば、選ばれた R と不足しているパッケージを示して、終了コード 1 で終わる。
# 任意のパッケージ（TRS 契約書連携やレポート分析の一部で使う）がなくても起動は止めず、名前だけ示す。

# この R スクリプトの場所から server/（VERSION があるフォルダー）を決める
server_dir <- local({
  f <- sub("^--file=", "", grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE))
  d <- if (length(f)) dirname(normalizePath(f[1L], winslash = "/")) else normalizePath(getwd(), winslash = "/")
  while (!file.exists(file.path(d, "VERSION")) && dirname(d) != d) d <- dirname(d)
  d
})
source(file.path(server_dir, "R", "load_quantlet.R"), encoding = "UTF-8")  # .quantlet_packages

required <- unique(c("httpuv", .quantlet_packages))
optional <- c("pdftools", "openssl", "curl", "processx", "ps", "httr2", "flextable", "stringi", "later", "future", "furrr")

rscript <- normalizePath(file.path(R.home("bin"), if (.Platform$OS.type == "windows") "Rscript.exe" else "Rscript"),
                         winslash = "/", mustWork = FALSE)
cat("R の版：", R.version.string, "\n", sep = "")
cat("  Rscript：", rscript, "\n", sep = "")
cat("  ライブラリ：", paste(normalizePath(.libPaths(), winslash = "/"), collapse = "; "), "\n", sep = "")

try_load <- function(p) {
  installed <- nzchar(system.file(package = p))
  err <- tryCatch({ suppressPackageStartupMessages(loadNamespace(p)); NA_character_ },
                  error = function(e) conditionMessage(e))
  list(package = p, ok = is.na(err), installed = installed,
       version = if (installed) as.character(utils::packageVersion(p)) else NA_character_,
       error = if (!installed) "インストールされていない" else err)
}
req <- lapply(required, try_load)
bad <- Filter(\(x) !x$ok, req)

if (length(bad)) {
  cat("\n選ばれた R（", R.version.string, "、", rscript, "）では、次の必須パッケージを読み込めません：\n", sep = "")
  for (x in bad) {
    cat("  - ", x$package, if (!is.na(x$version)) paste0(" ", x$version), "：", gsub("\\s+", " ", x$error), "\n", sep = "")
  }
  cat("\nこの R にパッケージを入れるか（rmql は rmql から入れ直す）、",
      "別の R を使うときは config/settings.local.env の RSCRIPT にその Rscript.exe を書いてください。\n", sep = "")
  quit(save = "no", status = 1)
}

rfm <- utils::packageDescription("rmql")
built <- sub(";.*$", "", rfm$Built %||% "")
cat("  必須パッケージ ", length(required), " 個を読み込めました（rmql ", rfm$Version,
    if (nzchar(built)) paste0("、", built, " でビルド"), "）\n", sep = "")

opt_missing <- optional[!vapply(optional, \(p) nzchar(system.file(package = p)), logical(1))]
if (length(opt_missing)) cat("  任意のパッケージで入っていないもの（使う機能だけ動かない）：", paste(opt_missing, collapse = ", "), "\n", sep = "")
