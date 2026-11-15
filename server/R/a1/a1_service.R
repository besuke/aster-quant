# A1 の入口（HTTP API と照合スクリプトが共通で使う）。
# オファー Excel と市場データのパスを受け取り、Curie から移植したワークフロー（workflows_offer_sheet_JPY／ISO）を実行する。
# 市場データを指定しなければ、デモの市場データ（架空、評価日 2026-10-06）を使う。

a1_demo_inputs_QL <- function(root = Sys.getenv("QUANTLET_ROOT")) {
  d <- file.path(root, "data", "demo", "a1")
  list(
    valuation_date = as.Date("2026-10-06"),
    offer_jpy = file.path(d, "offers", "demo_offers_JPY_20261006.xlsx"),
    offer_iso = file.path(d, "offers", "demo_offers_ISO_20261006.xlsx"),
    ois = c(JPY = file.path(d, "market", "demo_ois_JPY_20261006.txt"), USD = file.path(d, "market", "demo_ois_USD_20261006.txt"),
            EUR = file.path(d, "market", "demo_ois_EUR_20261006.txt")),
    jgb = file.path(d, "market", "demo_jgb_20261006.txt"),
    basis = file.path(d, "market", "demo_basis_20261006.txt"),
    fx = file.path(d, "market", "demo_fx_20261006.txt"),
    attributes = file.path(d, "attributes", "demo_attributes_20261006.rds")
  )
}

# workflow = "JPY"：円債（JPY OIS ASW・JGBスプレッド）、"ISO"：外債（自国 OIS ASW・円換算 ASW）
# offer_sheet：JPY の既定は Curie と同じ「円債オファー」シート。ISO は Curie と同じく自動判定（NULL）
run_offer_sheet_QL <- function(workflow = c("JPY", "ISO"), offer_path, output_path, valuation_date = NULL,
                               market = a1_demo_inputs_QL(), ois_paths = NULL, offer_sheet = NULL,
                               attribute_fetcher = make_file_attribute_fetcher_QL(market$attributes), work_dir = NULL) {
  workflow <- match.arg(workflow)
  valuation_date <- as.Date(valuation_date %||% market$valuation_date)
  if (workflow == "JPY") {
    workflows_offer_sheet_JPY(
      offer_path = offer_path, ois_path = ois_paths %||% unname(market$ois["JPY"]), jgb_path = market$jgb,
      valuation_date = valuation_date, output_path = output_path, attribute_fetcher = attribute_fetcher,
      offer_settings = offer_import_settings_Curie(sheet = offer_sheet %||% "円債オファー", currency = "JPY"), work_dir = work_dir)
  } else {
    workflows_offer_sheet_ISO(
      offer_path = offer_path, ois_paths = ois_paths %||% unname(market$ois[c("USD", "EUR", "JPY")]), basis_path = market$basis,
      fx_path = market$fx, valuation_date = valuation_date, output_path = output_path, attribute_fetcher = attribute_fetcher,
      offer_settings = if (is.null(offer_sheet)) offer_import_settings_Curie() else offer_import_settings_Curie(sheet = offer_sheet),
      work_dir = work_dir)
  }
}

# 画面に返す形（JSON）。Date は文字列、list 列は配列にする
a1_result_json_QL <- function(run, workflow) {
  iso <- function(d) ifelse(is.na(d), NA_character_, format(as.Date(d), "%Y-%m-%d"))
  r <- run$results
  cols <- c("offer_id", "offer_book", "ISIN", "security_name", "currency", "broker_names", "offer_price", "offer_size",
            "offer_size_unit", "offer_date", "offer_settlementdate", "coupon_rate", "maturity_date", "calculation_end_date",
            "validation_status", "validation_message", "pricing_status", "pricing_message",
            "accrued_per_100", "dirty_price", "asw_effective_date", "asw_maturity_date", "native_asw_bp",
            "jpy_compound_yield_pct", "jgb_interpolated_yield_pct", "jgb_spread_bp",
            "fx_spot", "basis_bp", "jpy_asw_bp", "simple_sum_bp", "calibrated_discount_spread_bp", "fair_spread_npv_jpy",
            "offer_source_file", "offer_source_sheet", "offer_source_row")
  rows <- r |>
    dplyr::select(dplyr::any_of(cols)) |>
    dplyr::mutate(dplyr::across(dplyr::where(\(x) inherits(x, "Date")), iso),
                  offer_source_file = basename(.data$offer_source_file))
  list(
    workflow = workflow,
    valuation_date = iso(run$results$valuation_date[!is.na(run$results$valuation_date)][1]),
    counts = dplyr::count(r, .data$validation_status, .data$pricing_status, name = "n"),
    offers = rows,
    curves = run$pricing$curves |> dplyr::mutate(dplyr::across(dplyr::where(\(x) inherits(x, "Date")), iso)),
    market_log = run$market_log |> dplyr::mutate(dplyr::across(dplyr::where(\(x) inherits(x, "Date")), iso)),
    settings = run$pricing$settings,
    environment = run$environment$environment,
    output_file = basename(run$output_path)
  )
}
