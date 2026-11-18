# 債券キャッシュフロー・イールドカーブ・クレジット（CDS）の画面の入力を読む共通関数。
# 本文は read_json_body（simplifyVector = FALSE）の list。値がなければ既定値、範囲外なら 400 にする。

an_bad_QL <- function(msg) {
  stop(structure(class = c("http_error", "error", "condition"), list(message = msg, status = 400L, call = NULL)))
}

an_num_QL <- function(body, key, default, lo, hi) {
  x <- body[[key]]
  if (is.null(x)) return(default)
  if (is.list(x) || !is.numeric(x) || length(x) != 1L || !is.finite(x) || x < lo || x > hi) {
    an_bad_QL(sprintf("%s は %s 以上 %s 以下の数値にする", key, format(lo), format(hi)))
  }
  as.numeric(x)
}

an_date_QL <- function(body, key, default) {
  x <- body[[key]]
  if (is.null(x)) return(as.Date(default))
  d <- if (is.character(x) && length(x) == 1L) tryCatch(as.Date(x), error = function(e) NA) else NA
  if (is.na(d)) an_bad_QL(sprintf("%s は YYYY-MM-DD の日付にする", key))
  d
}

an_choice_QL <- function(body, key, default, choices) {
  x <- body[[key]]
  if (is.null(x)) return(default)
  if (!is.character(x) || length(x) != 1L || !x %in% choices) an_bad_QL(sprintf("%s は %s のどれかにする", key, paste(choices, collapse = "・")))
  x
}

an_unknown_QL <- function(body, allowed) {
  extra <- setdiff(names(body), allowed)
  if (length(extra)) an_bad_QL(paste("知らない項目:", paste(extra, collapse = ", ")))
}

# 日付 + 期間（D・W・M・Y）。月末を超える日は月末にそろえる（営業日の調整はしない）
an_add_tenor_QL <- function(d, tenor) {
  n <- as.integer(sub("[DWMY]$", "", tenor))
  u <- sub("^[0-9]+", "", tenor)
  if (u == "D") return(d + n)
  if (u == "W") return(d + 7L * n)
  months <- if (u == "M") n else 12L * n
  y <- as.integer(format(d, "%Y")); m <- as.integer(format(d, "%m")) + months; dd <- as.integer(format(d, "%d"))
  y <- y + (m - 1L) %/% 12L; m <- (m - 1L) %% 12L + 1L
  last <- as.integer(format(seq(as.Date(sprintf("%d-%02d-01", y, m)), by = "1 month", length.out = 2L)[2L] - 1L, "%d"))
  as.Date(sprintf("%d-%02d-%02d", y, m, min(dd, last)))
}

an_engine_QL <- function() paste("RiemannFinMath", as.character(utils::packageVersion("RiemannFinMath")))
