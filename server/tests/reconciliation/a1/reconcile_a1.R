# A1 の照合：QuantLet（RiemannFinMath）と Curie の旧デモ結果（GaussQuant・QuantLib 1.42）。
#
#   Rscript tests/reconciliation/a1/reconcile_a1.R     （どのフォルダーからでもよい。ui/ からは npm run r -- ../server/tests/reconciliation/a1/reconcile_a1.R）
#
# 基準：Curie output/offer_results_{JPY,ISO}_demo_20261006.xlsx の「オファー結果」シート（2026-10-27 作成、QuantLet の
# tests/reconciliation/curie_reference/a1/ に写した）。入力は同じデモデータ（架空）。Curie・GaussQuant・Riemann は変更しない。
# 結果は tests/reconciliation/a1/results/ に書く。
suppressPackageStartupMessages({ library(dplyr); library(readxl) })
# この R スクリプトの場所から server/（VERSION があるフォルダー）を決め、そこを作業ディレクトリにする（どこから起動してもよい）
local({
  f <- sub("^--file=", "", grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE))
  d <- if (length(f)) dirname(normalizePath(f[1L], winslash = "/")) else normalizePath(getwd(), winslash = "/")
  while (!file.exists(file.path(d, "VERSION")) && dirname(d) != d) d <- dirname(d)
  setwd(d)
})
source("R/load_quantlet.R", encoding = "UTF-8"); load_quantlet(getwd())
out_dir <- file.path("tests", "reconciliation", "a1", "results"); dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
demo <- a1_demo_inputs_QL()

tol <- c(native_asw_bp = 1e-6, jgb_spread_bp = 1e-6, jpy_compound_yield_pct = 1e-10, jgb_interpolated_yield_pct = 1e-10,
         accrued_per_100 = 1e-10, dirty_price = 1e-10, basis_bp = 1e-6, fx_spot = 0, jpy_asw_bp = 1e-6, simple_sum_bp = 1e-6,
         calibrated_discount_spread_bp = 1e-6)
compare <- function(workflow, offer_path, ref_file) {
  run <- run_offer_sheet_QL(workflow, offer_path, file.path(out_dir, paste0("quantlet_", workflow, ".xlsx")),
                            work_dir = file.path(tempdir(), paste0("ql_", workflow)))
  ref <- read_excel(file.path("tests", "reconciliation", "curie_reference", "a1", ref_file), sheet = "オファー結果")
  ql <- run$results
  stopifnot(nrow(ref) == nrow(ql), identical(ref$ISIN, ql$ISIN))
  items <- intersect(names(tol), names(ref))
  num <- purrr::map(items, \(k) tibble(workflow = workflow, ISIN = ql$ISIN, item = k,
                                       curie = suppressWarnings(as.numeric(ref[[k]])), quantlet = as.numeric(ql[[k]]))) |>
    purrr::list_rbind() |>
    mutate(diff = quantlet - curie, tolerance = tol[item],
           pass = (is.na(curie) & is.na(quantlet)) | (!is.na(diff) & abs(diff) <= tolerance))
  st <- tibble(workflow = workflow, ISIN = ql$ISIN, curie_pricing_status = ref$pricing_status, quantlet_pricing_status = ql$pricing_status,
               curie_validation = ref$validation_status, quantlet_validation = ql$validation_status,
               status_match = curie_pricing_status == quantlet_pricing_status & curie_validation == quantlet_validation,
               curie_message = ref$pricing_message, quantlet_message = ql$pricing_message)
  list(num = num, status = st)
}
jpy <- compare("JPY", demo$offer_jpy, "offer_results_JPY_demo_20261006.xlsx")
iso <- compare("ISO", demo$offer_iso, "offer_results_ISO_demo_20261006.xlsx")
num <- bind_rows(jpy$num, iso$num); status <- bind_rows(jpy$status, iso$status)
write.csv(num, file.path(out_dir, "a1_numbers.csv"), row.names = FALSE, fileEncoding = "UTF-8")
write.csv(status, file.path(out_dir, "a1_status.csv"), row.names = FALSE, fileEncoding = "UTF-8")
options(width = 200, pillar.sigfig = 6)
print(num |> filter(!is.na(curie) | !is.na(quantlet)) |> group_by(workflow, item) |>
        summarise(n = sum(!is.na(curie)), max_abs_diff = max(abs(diff), na.rm = TRUE), tolerance = first(tolerance), all_pass = all(pass), .groups = "drop"))
print(status |> select(workflow, ISIN, curie_pricing_status, quantlet_pricing_status, status_match), n = 50)
print(status |> filter(!status_match | curie_message != quantlet_message) |> select(ISIN, curie_message, quantlet_message), width = 200)
writeLines(c(paste("run_at:", format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z")), paste("R:", R.version.string),
             paste("RiemannFinMath:", as.character(packageVersion("RiemannFinMath")), "built", packageDescription("RiemannFinMath")$Built),
             paste("numeric checks:", nrow(num), "fail:", sum(!num$pass)), paste("status mismatches:", sum(!status$status_match))),
           file.path(out_dir, "session_info.txt"))
cat(readLines(file.path(out_dir, "session_info.txt")), sep = "\n")
