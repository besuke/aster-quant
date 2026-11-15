# QuantLet サーバーの R 関数の読込。server/ を作業ディレクトリにしなくても動くよう、server フォルダーを root で受け取る。
#
#   source("C:/AnalyticFin/Projects/QuantLet/server/R/load_quantlet.R", encoding = "UTF-8"); load_quantlet()
#
# R/common/  Curie の z0_utility から写した共通関数（取込・変換・補間・Excel 書式・コンソール表示・版）と環境の記録
# R/a1/      A1 オファーシート（データ処理は Curie から写した。計算は pricing_riemann.R が RiemannFinMath を呼ぶ）
# R/c1/      C1 TRS 確認書（Curie の c1_trs_terms をそのまま写し、環境変数名だけ QUANTLET_* に変えた）
# R/bloomberg/ Bloomberg Data License からの取得（Riemann tools/market/fetch_bbg_dl_ois.R を関数に分けたもの）

.quantlet_packages <- c("dplyr", "purrr", "tibble", "tidyr", "stringr", "readr", "readxl", "writexl", "xml2", "zip",
                        "rlang", "collapse", "jsonlite", "RiemannFinMath")

.quantlet_modules <- list(
  common = c("console.R", "version.R", "isin.R", "parse_utils.R", "import_settings.R", "market_data_import.R",
             "interpolation.R", "attributes.R", "report_format.R", "excel_format.R", "environment_info.R",
             "lagrange/import_data.R", "lagrange/workflows_validate_worksheet.R"),
  a1 = c("pricing_riemann.R", "convert_offer_sheet.R", "spread_inputs.R", "validate_offer_worksheet.R",
         "write_offer_results_excel.R", "workflows_offer_sheet.R", "demo_attributes.R", "a1_service.R"),
  # c1 は jsonlite・xml2・pdftools・openssl・curl・processx を使う（関数を呼んだときに必要）
  c1 = c("trs_fields.R", "verify_quotes.R", "fpml_trs.R", "fpml_validate.R", "acquire_document.R", "reading_data.R",
         "claude_agent.R", "reader.R", "read_results.R", "validate_results.R", "aladdin_payload.R",
         "workflows_c1_case.R", "inbox_c1.R", "trs_cashflows.R"),
  bloomberg = c("bbg_data_license.R", "bbg_to_market_data.R"),
  yields = c("jgb_ust_yields.R"),
  reports = c("report_reader.R", "report_store.R", "report_feedback.R"),
  market = c("ois_datasets.R"),
  irrbb = c("irrbb_scenarios.R")
)

load_quantlet <- function(root = Sys.getenv("QUANTLET_ROOT", ""), envir = globalenv()) {
  if (!nzchar(root)) root <- dirname(dirname(normalizePath(sys.frame(1)$ofile %||% "R/load_quantlet.R", winslash = "/", mustWork = FALSE)))
  root <- normalizePath(root, winslash = "/")
  if (!file.exists(file.path(root, "VERSION"))) stop("Not the QuantLet server folder (no VERSION): ", root, call. = FALSE)
  Sys.setenv(QUANTLET_ROOT = root)
  # 個人用の設定（User-Agent・Aladdin の対応表・Bloomberg の認証情報のパスなど）。Git に入れない。値は表示しない
  renv <- file.path(root, "tmp", ".Renviron")
  if (file.exists(renv)) readRenviron(renv)
  ok <- vapply(.quantlet_packages, \(p) tryCatch({ loadNamespace(p); TRUE }, error = function(e) FALSE), logical(1))
  if (!all(ok)) stop("Cannot load packages: ", paste(.quantlet_packages[!ok], collapse = ", "), call. = FALSE)
  for (dir in names(.quantlet_modules)) {
    for (f in .quantlet_modules[[dir]]) sys.source(file.path(root, "R", dir, f), envir = envir, keep.source = FALSE)
  }
  invisible(root)
}

`%||%` <- function(a, b) if (is.null(a)) b else a
