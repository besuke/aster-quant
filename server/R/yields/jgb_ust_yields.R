# 日米の国債の公表利回り（1・5・10・20・30年）の取得・整形・保存と、月次の表示用データ。
#
# 出典
#   米国：FRED（セントルイス連銀）DGS1, DGS5, DGS10, DGS20, DGS30。Market Yield on U.S. Treasury Securities at {n}-Year
#         Constant Maturity, Quoted on an Investment Basis（日次、%）。fredgraph.csv（API キー不要）から取る
#   日本：財務省「国債金利情報」jgbcm_all.csv（1974年9月〜前月末）と jgbcm.csv（当月）。CP932、基準日は和暦（S・H・R）、
#         公表がない年限は「-」
# どちらも公表された利回り（%）をそのまま使う。補間・計算はしない（評価用の OIS カーブとは別物である）。
#
# 保存先（server/data/market/yields/。Git に入れない）
#   raw/<取得日時>_<出典>.csv   取得したファイルそのまま
#   yields_daily.csv           長い形：date, country, tenor_years, yield_pct, series_id, source（欠損の行は yield_pct が空）
#   provenance.json            取得元の URL・取得日時・SHA-256・行数・期間
# 月次：各国・各年限の月内最終観測値（その月で値のある最後の日の値）と、その観測日。月内に値がなければ欠損。

yield_tenors_QL <- c(1L, 5L, 10L, 20L, 30L)
yield_dir_QL <- function() file.path(Sys.getenv("QUANTLET_ROOT"), "data", "market", "yields")

.fred_url_QL <- function(id) paste0("https://fred.stlouisfed.org/graph/fredgraph.csv?id=", id)
.mof_urls_QL <- c(all = "https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv",
                  current = "https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv")
yield_sources_QL <- list(
  US = list(label = "米国債", source = "FRED（Federal Reserve Bank of St. Louis）DGS1・DGS5・DGS10・DGS20・DGS30（Treasury constant maturity、日次）"),
  JP = list(label = "日本国債", source = "財務省「国債金利情報」（jgbcm_all.csv・jgbcm.csv、日次）")
)

# 取得。個人の情報は送らない（User-Agent は汎用の名前）
.download_QL <- function(url, dest) {
  # FRED は独自の User-Agent（例 "QuantLet"）だと応答しなかった（HTTP/2 の中断、HTTP/1.1 では無応答。2026-11-15 に確認）。
  # R の curl の既定の User-Agent（個人の情報を含まない）を使い、時間切れを設けて3回まで取り直す
  for (i in 1:3) {
    h <- curl::new_handle(timeout = 120, connecttimeout = 20)
    ok <- tryCatch({ curl::curl_download(url, dest, handle = h, quiet = TRUE); TRUE }, error = function(e) if (i == 3) stop(e) else FALSE)
    if (ok) break
    Sys.sleep(2)
  }
  list(url = url, file = basename(dest), bytes = file.size(dest), sha256 = pdf_sha256_c1(dest),
       retrieved_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"))
}

parse_fred_csv_QL <- function(path, id) {
  x <- readr::read_csv(path, col_types = readr::cols(.default = readr::col_character()), progress = FALSE)
  names(x)[1:2] <- c("date", "value")
  tibble::tibble(date = as.Date(x$date), country = "US", tenor_years = as.integer(sub("^DGS", "", id)),
                 yield_pct = suppressWarnings(as.numeric(dplyr::na_if(dplyr::na_if(x$value, "."), ""))),
                 series_id = id, source = "FRED")
}

# 和暦（S49.9.24、H31.4.30、R8.11.2）→ Date
parse_wareki_QL <- function(x) {
  m <- stringr::str_match(x, "^([SHR])(\\d+)\\.(\\d+)\\.(\\d+)$")
  base <- c(S = 1925L, H = 1988L, R = 2018L)
  as.Date(ifelse(is.na(m[, 1]), NA_character_,
                 sprintf("%04d-%02d-%02d", base[m[, 2]] + as.integer(m[, 3]), as.integer(m[, 4]), as.integer(m[, 5]))))
}

parse_mof_csv_QL <- function(path) {
  lines <- iconv(readLines(path, encoding = "bytes", warn = FALSE), "CP932", "UTF-8")
  header <- grep("^基準日,", lines)[1]
  if (is.na(header)) stop("財務省の CSV に見出し行（基準日）がない: ", basename(path), call. = FALSE)
  x <- readr::read_csv(I(paste(lines[header:length(lines)], collapse = "\n")),
                       col_types = readr::cols(.default = readr::col_character()), progress = FALSE)
  x <- x |> dplyr::mutate(date = parse_wareki_QL(.data$基準日)) |> dplyr::filter(!is.na(.data$date))
  purrr::map(yield_tenors_QL, \(t) {
    col <- paste0(t, "年")
    tibble::tibble(date = x$date, country = "JP", tenor_years = t,
                   yield_pct = suppressWarnings(as.numeric(dplyr::na_if(x[[col]], "-"))),
                   series_id = paste0("jgbcm ", col), source = "財務省")
  }) |> purrr::list_rbind()
}

# 取得して保存する。戻り値は保存したファイルの記録（provenance）
refresh_yields_QL <- function(dir = yield_dir_QL()) {
  raw <- file.path(dir, "raw"); dir.create(raw, recursive = TRUE, showWarnings = FALSE)
  stamp <- format(Sys.time(), "%Y%m%d_%H%M%S")
  fred_ids <- paste0("DGS", yield_tenors_QL)
  fred <- purrr::map(fred_ids, \(id) {
    dest <- file.path(raw, paste0(stamp, "_fred_", id, ".csv"))
    list(meta = .download_QL(.fred_url_QL(id), dest), data = parse_fred_csv_QL(dest, id))
  })
  mof <- purrr::imap(.mof_urls_QL, \(u, k) {
    dest <- file.path(raw, paste0(stamp, "_mof_jgbcm_", k, ".csv"))
    list(meta = .download_QL(u, dest), data = parse_mof_csv_QL(dest))
  })
  # 当月ファイルと全期間ファイルで同じ日があれば、当月ファイル（新しい公表）を使う
  jp <- dplyr::bind_rows(mof$current$data, mof$all$data) |> dplyr::distinct(.data$date, .data$tenor_years, .keep_all = TRUE)
  daily <- dplyr::bind_rows(purrr::map(fred, "data") |> purrr::list_rbind(), jp) |>
    dplyr::arrange(.data$country, .data$tenor_years, .data$date)
  readr::write_csv(daily, file.path(dir, "yields_daily.csv"), na = "")
  prov <- list(
    refreshed_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
    files = c(purrr::map(fred, "meta"), unname(purrr::map(mof, "meta"))),
    summary = daily |> dplyr::summarise(rows = dplyr::n(), observed = sum(!is.na(.data$yield_pct)),
                                        first = format(min(.data$date[!is.na(.data$yield_pct)])),
                                        last = format(max(.data$date[!is.na(.data$yield_pct)])), .by = c("country", "tenor_years"))
  )
  jsonlite::write_json(prov, file.path(dir, "provenance.json"), auto_unbox = TRUE, pretty = TRUE)
  prov
}

read_yields_daily_QL <- function(dir = yield_dir_QL()) {
  f <- file.path(dir, "yields_daily.csv")
  if (!file.exists(f)) return(NULL)
  readr::read_csv(f, col_types = readr::cols(date = readr::col_date(), tenor_years = readr::col_integer(),
                                             yield_pct = readr::col_double(), .default = readr::col_character()), progress = FALSE)
}

# 月次：各国・各年限の月内最終観測値。表示する月は、両国のどちらかに観測がある最初の月（日本の開始 1974年9月以降）から最新の月まで
monthly_yields_QL <- function(daily, from = "197409") {
  obs <- daily |>
    dplyr::filter(!is.na(.data$yield_pct)) |>
    dplyr::mutate(month = format(.data$date, "%Y%m")) |>
    dplyr::filter(.data$month >= from)
  last_obs <- obs |>
    dplyr::slice_max(.data$date, n = 1, by = c("country", "tenor_years", "month"), with_ties = FALSE) |>
    dplyr::select("country", "tenor_years", "month", obs_date = "date", "yield_pct", "series_id")
  # その国の月内の最終観測日（どれかの年限に値のある最後の日）。年限の観測日がこれより前なら、その年限は月末近くに値がない
  country_last <- obs |> dplyr::summarise(country_last_date = max(.data$date), .by = c("country", "month"))
  months <- sort(unique(obs$month))
  grid <- tidyr::expand_grid(country = c("US", "JP"), tenor_years = yield_tenors_QL, month = months)
  grid |>
    dplyr::left_join(last_obs, by = c("country", "tenor_years", "month")) |>
    dplyr::left_join(country_last, by = c("country", "month")) |>
    dplyr::mutate(missing = is.na(.data$yield_pct),
                  note = dplyr::case_when(
                    .data$missing & is.na(.data$country_last_date) ~ "この月の公表値がない",
                    .data$missing ~ "この年限の公表値がない（この月）",
                    .data$obs_date < .data$country_last_date ~ paste0("この年限の最終観測日は ", format(.data$obs_date), "（他の年限より前）"),
                    .default = ""))
}

# 画面に返す形：月ごとに、国ごとの5年限の利回り・観測日・注記。軸は画面が期間を選んで固定する（全月の値を返す）
yields_payload_QL <- function(dir = yield_dir_QL()) {
  daily <- read_yields_daily_QL(dir)
  if (is.null(daily)) return(NULL)
  m <- monthly_yields_QL(daily)
  latest <- max(daily$date[!is.na(daily$yield_pct)])
  by_month <- split(m, m$month)
  months <- purrr::imap(by_month, \(x, month) {
    one <- function(cc) {
      y <- x[x$country == cc, ][match(yield_tenors_QL, x$tenor_years[x$country == cc]), ]
      list(yield_pct = y$yield_pct, obs_date = ifelse(is.na(y$obs_date), NA_character_, format(y$obs_date)), note = y$note,
           last_date = if (all(is.na(y$country_last_date))) NA_character_ else format(max(y$country_last_date, na.rm = TRUE)))
    }
    list(month = month, US = one("US"), JP = one("JP"))
  })
  prov <- jsonlite::fromJSON(file.path(dir, "provenance.json"), simplifyVector = TRUE)
  list(
    tenors = yield_tenors_QL, countries = yield_sources_QL,
    months = unname(months),
    in_progress_month = format(latest, "%Y%m"),
    latest_date = format(latest),
    refreshed_at = prov$refreshed_at,
    coverage = prov$summary,
    conventions = list(
      monthly = "各国・各年限の月内最終観測値（その月で値のある最後の日の値）。観測日は年限ごとに示す",
      missing = "月内に公表値がない年限は欠損として示し、前後の月や他の年限から補わない",
      note = "公表された国債の利回り（%）の比較。評価に使う OIS カーブ（A1）とは別のもので、計算には使わない",
      basis = "両国とも公表値をそのまま使う。利回りの計算方式（複利の扱いなど）は出典ごとの定義により、ここでは揃えていない"
    )
  )
}
