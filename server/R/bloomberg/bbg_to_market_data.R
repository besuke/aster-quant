# 正規化した Bloomberg の表 → A1 の OIS 気配ファイル（Curie の形：marketdate|quote_time|currency|instrument|instrument_type|tenor|rate_pct|quote_side|source）。
# この形にすれば、A1 は従来の取込（import_ois_files_Curie）→ RiemannFinMath のカーブ構築をそのまま使える。
# 値は PX_LAST をそのまま％として使う（Data License の単位は未確認。README「Bloomberg 連携」）。指定した市場日の行だけを使い、別の日付で補わない。

.bbg_ois_instruments_QL <- c(JPY = "TONAR_OIS", USD = "SOFR_OIS", EUR = "ESTR_OIS")

bbg_rates_to_ois_quotes_QL <- function(rates, marketdate, quote_time = NA_character_) {
  marketdate <- as.Date(marketdate)
  rates |>
    dplyr::filter(.data$date == marketdate) |>
    dplyr::transmute(
      marketdate = .data$date, quote_time = quote_time, currency = .data$currency,
      instrument = unname(.bbg_ois_instruments_QL[.data$currency]), instrument_type = "spot_ois",
      tenor = .data$tenor, rate_pct = .data$value, quote_side = "mid",
      source = paste0(.data$source, " ", .data$ticker, " ", .data$field)
    )
}

# 通貨ごとに A1 の取込の形で書き出す。書いたファイルのパス（通貨名つき）を返す
write_bbg_ois_files_QL <- function(rates, marketdate, out_dir, quote_time = NA_character_) {
  q <- bbg_rates_to_ois_quotes_QL(rates, marketdate, quote_time)
  if (!nrow(q)) stop("No Bloomberg OIS rows on ", marketdate, " (other dates are not used).", call. = FALSE)
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
  split(q, q$currency) |>
    purrr::imap_chr(function(x, ccy) {
      path <- file.path(out_dir, sprintf("bbg_ois_%s_%s.txt", ccy, format(as.Date(marketdate), "%Y%m%d")))
      readr::write_delim(x, path, delim = "|", na = "")
      path
    })
}
