# Bloomberg Data License（REST、HistoryRequest）からの取得。
#
# 移植元：rmql tools/market/fetch_bbg_dl_ois.R（コミット 82869a1）。スクリプトを関数に分けただけで、要求本文・エンドポイント・
# トークンの流れ・正規化の列は変えていない。移植元の状態は【設計案】のままである：
#   - 要求本文・エンドポイント・トークンの流れは Bloomberg の公開サンプルの記憶に基づき、実際のアカウントで確かめていない
#   - ティッカーは候補で、Data License 側での確認が必要
# QuantLet でも実際の取得（live）は一度も実行していない。dry run は通信せず、架空の値（SYNTHETIC）を作る。
#
# 役割の分け方（将来 INDIGO に取得を移す予定。README「Bloomberg 連携」）
#   取得（ここ）        ：fetch_bbg_records_QL()  … live（Data License）／synthetic（通信しない）
#   正規化（ここ）      ：normalize_bbg_history_QL() … 長い形の表 date, currency, index, tenor, ticker, field, value, source
#   A1 への受け渡し     ：R/bloomberg/bbg_to_market_data.R … 正規化した表 → A1 の OIS 気配ファイルの形
#   評価                ：A1 の pricing_rmql.R が rmql に渡す
# INDIGO へ移すときは、取得の関数を INDIGO の呼び出しに替え、正規化した表の列を保てば、後ろの処理は変えなくてよい。
#
# 接続設定・認証情報・取得したデータはローカルだけに置く（Git に入れない。.gitignore）：
#   QUANTLET_BBG_DL_CREDENTIALS  Data License のコンソールが発行する認証情報 JSON のパス（client_id, client_secret）
#   QUANTLET_BBG_DL_CATALOG      アカウントのカタログ ID（既定の "bbg" は仮の値）
#   保存先                       server/data/market/bbg_dl/（要求本文 request_<id>.json、raw/、正規化した CSV）
# 認証情報の値はログ・画面・応答に出さない（パスが設定されているかどうかだけを返す）。

bbg_dl_base_QL <- "https://api.bloomberg.com"
bbg_dl_token_url_QL <- "https://bsso.blpprofessional.com/ext/api/as/token.oauth2"

# 候補のティッカー（Data License 側で要確認）。翌日物のフィキシングの参考：MUTKCALM Index（TONA）、SOFRRATE Index、ESTRON Index
bbg_ois_universe_QL <- function(tenor_years = c(1L, 2L, 5L, 10L)) {
  tibble::tribble(
    ~currency, ~index,  ~prefix,
    "JPY",     "TONAR", "JYSO",
    "USD",     "SOFR",  "USOSFR",
    "EUR",     "ESTR",  "EESWE"
  ) |>
    tidyr::crossing(tenor_years = as.integer(tenor_years)) |>
    dplyr::mutate(tenor = paste0(.data$tenor_years, "Y"), ticker = paste0(.data$prefix, .data$tenor_years, " Curncy")) |>
    dplyr::select("currency", "index", "tenor", "tenor_years", "ticker")
}

create_bbg_history_request_QL <- function(tickers, field, start_date, end_date, pricing_source, name) {
  list(
    `@type` = "HistoryRequest", name = name, identifier = name,
    description = "QuantLet OIS par rates (sample)",
    universe = list(`@type` = "Universe",
                    contains = purrr::map(tickers, \(t) list(`@type` = "Identifier", identifierType = "TICKER", identifierValue = t))),
    fieldList = list(`@type` = "HistoryFieldList", contains = list(list(mnemonic = field))),
    trigger = list(`@type` = "SubmitTrigger"),
    runtimeOptions = list(`@type` = "HistoryRuntimeOptions",
                          dateRange = list(`@type` = "IntervalDateRange", startDate = format(start_date), endDate = format(end_date))),
    pricingSourceOptions = list(`@type` = "HistoryPricingSourceOptions", prefer = list(mnemonic = pricing_source)),
    formatting = list(`@type` = "MediaType", outputMediaType = "application/json")
  )
}

# Data License の history 出力：(identifier, date) ごとに1行、項目が列。出力の見出しは未確認なので大文字小文字を区別せずに合わせる
normalize_bbg_history_QL <- function(records, universe, field, source) {
  names(records) <- toupper(names(records))
  id_col <- intersect(c("IDENTIFIER", "SECURITY", "TICKER"), names(records))[1]
  stopifnot(!is.na(id_col), "DATE" %in% names(records), toupper(field) %in% names(records))
  tibble::tibble(ticker = records[[id_col]], date = as.Date(records[["DATE"]]),
                 value = suppressWarnings(as.numeric(records[[toupper(field)]]))) |>
    dplyr::inner_join(universe, by = "ticker") |>
    dplyr::transmute(.data$date, .data$currency, .data$index, .data$tenor, .data$ticker, field = field, .data$value, source = source) |>
    dplyr::filter(!is.na(.data$value)) |>
    dplyr::arrange(.data$currency, factor(.data$tenor, levels = unique(universe$tenor)), .data$date)
}

# dry run：乱数の歩みで作る架空の値（市場の気配ではない）。平日だけ（休日カレンダーは使わない）
generate_bbg_synthetic_records_QL <- function(universe, start_date, end_date, field, seed = 20261115L) {
  set.seed(seed)
  days <- seq(start_date, end_date, by = "day")
  days <- days[!format(days, "%u") %in% c("6", "7")]
  base <- c(JPY = 0.9, USD = 3.6, EUR = 2.1)
  universe |>
    purrr::pmap(\(currency, index, tenor, tenor_years, ticker) {
      level <- base[[currency]] + 0.08 * log(tenor_years)
      tibble::tibble(IDENTIFIER = ticker, DATE = format(days), !!field := round(level + cumsum(stats::rnorm(length(days), 0, 0.02)), 4))
    }) |>
    purrr::list_rbind()
}

bbg_dl_config_QL <- function() {
  cred <- Sys.getenv("QUANTLET_BBG_DL_CREDENTIALS", "")
  list(credentials_set = nzchar(cred), credentials_file_exists = nzchar(cred) && file.exists(cred),
       catalog = Sys.getenv("QUANTLET_BBG_DL_CATALOG", "bbg"),
       httr2_installed = requireNamespace("httr2", quietly = TRUE),
       out_dir = file.path(Sys.getenv("QUANTLET_ROOT", "."), "data", "market", "bbg_dl"))
}

fetch_bbg_live_records_QL <- function(body, request_id, out_dir) {
  if (!requireNamespace("httr2", quietly = TRUE)) stop("live mode needs the httr2 package (not installed).", call. = FALSE)
  cred_path <- Sys.getenv("QUANTLET_BBG_DL_CREDENTIALS")
  if (!nzchar(cred_path) || !file.exists(cred_path)) stop("Set QUANTLET_BBG_DL_CREDENTIALS to the credential JSON file.", call. = FALSE)
  cred <- jsonlite::fromJSON(cred_path)
  catalog <- Sys.getenv("QUANTLET_BBG_DL_CATALOG", "bbg")
  client <- httr2::oauth_client(id = cred$client_id, secret = cred$client_secret, token_url = bbg_dl_token_url_QL)
  dl_req <- function(path) {
    httr2::request(bbg_dl_base_QL) |> httr2::req_url_path(path) |> httr2::req_headers(`api-version` = "2") |>
      httr2::req_oauth_client_credentials(client)
  }
  dl_req(sprintf("/eap/catalogs/%s/requests/", catalog)) |> httr2::req_body_json(body, auto_unbox = TRUE) |> httr2::req_perform()
  key <- NULL
  for (i in seq_len(60)) {
    resp <- dl_req(sprintf("/eap/catalogs/%s/content/responses/", catalog)) |>
      httr2::req_url_query(requestIdentifier = request_id) |> httr2::req_perform() |> httr2::resp_body_json()
    if (length(resp$contains) > 0) { key <- resp$contains[[1]]$key; break }
    Sys.sleep(30)
  }
  if (is.null(key)) stop("no output for ", request_id, " after 30 minutes", call. = FALSE)
  raw_path <- file.path(out_dir, "raw", basename(key))
  dir.create(dirname(raw_path), recursive = TRUE, showWarnings = FALSE)
  dl_req(sprintf("/eap/catalogs/%s/content/responses/%s", catalog, key)) |> httr2::req_perform(path = raw_path)
  txt <- if (grepl("\\.gz$", raw_path)) readLines(gzfile(raw_path), warn = FALSE) else readLines(raw_path, warn = FALSE)
  tibble::as_tibble(jsonlite::fromJSON(paste(txt, collapse = "\n"), flatten = TRUE))
}

# 取得から正規化まで。mode = "synthetic"（通信しない）／"live"（Data License）。保存したファイルのパスと、件数だけの要約を返す
fetch_bbg_ois_QL <- function(start_date, end_date, mode = c("synthetic", "live"), universe = bbg_ois_universe_QL(),
                             field = "PX_LAST", pricing_source = "BGN", out_dir = bbg_dl_config_QL()$out_dir) {
  mode <- match.arg(mode)
  start_date <- as.Date(start_date); end_date <- as.Date(end_date)
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
  request_id <- paste0("qlOis", format(Sys.time(), "%Y%m%d%H%M%S"))
  body <- create_bbg_history_request_QL(universe$ticker, field, start_date, end_date, pricing_source, request_id)
  request_path <- file.path(out_dir, paste0("request_", request_id, ".json"))
  jsonlite::write_json(body, request_path, auto_unbox = TRUE, pretty = TRUE)
  records <- if (mode == "live") fetch_bbg_live_records_QL(body, request_id, out_dir) else
    generate_bbg_synthetic_records_QL(universe, start_date, end_date, field)
  rates <- normalize_bbg_history_QL(records, universe, field, source = if (mode == "live") paste0("BBG_DL_", pricing_source) else "SYNTHETIC")
  stem <- file.path(out_dir, sprintf("ois_px_last_%s_%s_%s", mode, format(start_date, "%Y%m%d"), format(end_date, "%Y%m%d")))
  readr::write_csv(rates, paste0(stem, ".csv"))
  list(mode = mode, request_id = request_id, request_path = request_path, csv_path = paste0(stem, ".csv"), rates = rates,
       summary = dplyr::count(rates, .data$currency, .data$index, .data$tenor, name = "rows"))
}
