# C1：TRS のキャッシュフロー・スケジュール（FundingLeg・ReturnLeg）を作り、Excel に保存する。
#
# 役割の分担
#   QuantLet（ここ）：C1 が原文と照合した契約条件（確認済みの値だけ）を読み、rmql の引数に変換して検証する。
#                    不足・前提を列ごとに記録し、結果を Excel（FundingLeg・ReturnLeg の2シート）に整形する
#   rmql  ：両レッグの日程（計算期間・リセット日・金利決定日・観測日・支払日・評価日）と金額
#                    （create_trs_funding_leg・compute_trs_funding_cashflows・create_trs_return_leg・compute_trs_return_cashflows）
# 金額の状態：確定（公表値だけ）／試算（市場データ・シナリオを使う）／算出不可（空欄。理由を示す）。
# 市場データは A1 と同じ規則：評価日と同じ市場日のデータだけを使う（デモの JPY OIS は 2026-10-06、架空）。

.trs_frequency_QL <- c(ANNUAL = 1L, SEMIANNUAL = 2L, QUARTERLY = 4L, MONTHLY = 12L)
.trs_calendar_QL <- c(tokyo = "japan", japan = "japan", target = "target", "new york" = "us_government_bond",
                      "u.s. government securities" = "us_government_bond", london = "united_kingdom")
.trs_bdc_QL <- c("modified following" = "modified_following", following = "following", preceding = "preceding",
                 "modified preceding" = "modified_preceding", "no adjustment" = "unadjusted", none = "unadjusted")
.trs_day_count_QL <- c("actual/365 (fixed)" = "actual_365_fixed", "act/365 (fixed)" = "actual_365_fixed", "actual/365f" = "actual_365_fixed",
                       "actual/360" = "actual_360", "act/360" = "actual_360")
.trs_index_QL <- list(tonar = "TONA|TONAR", sofr = "SOFR", estr = "ESTR|€STR|EUROSTR", sonia = "SONIA")
.trs_numbers_QL <- c(one = 1L, two = 2L, three = 3L, four = 4L, five = 5L, six = 6L, seven = 7L, eight = 8L, nine = 9L, ten = 10L)

.lookup_QL <- function(x, table) if (is.na(x)) NA_character_ else unname(table[tolower(trimws(x))])

# 契約条件 → rmql の引数。値ごとに、原文の値・変換後・状態（記載あり／不足／前提）を残す
trs_terms_QL <- function(conditions) {
  g <- .condition_getter_c1(conditions)
  log <- list()
  item <- function(id, label, value, converted, status = NULL, note = "") {
    st <- status %||% (if (is.na(value)) "不足" else if (is.null(converted) || anyNA(converted)) "変換できない" else "原文どおり")
    log[[length(log) + 1L]] <<- tibble::tibble(項目ID = id, 項目 = label, 原文の値 = value %|% "", 変換後 = paste(converted %||% "", collapse = ""),
                                               状態 = st, 備考 = note)
    if (st %in% c("不足", "変換できない")) NA else converted
  }
  num <- function(id) suppressWarnings(as.numeric(g(id)))
  date <- function(id) suppressWarnings(as.Date(g(id)))
  freq <- function(id) unname(.trs_frequency_QL[toupper(g(id) %|% "")])
  index_of <- function(x) {
    if (is.na(x)) return(NA_character_)
    hit <- names(.trs_index_QL)[purrr::map_lgl(.trs_index_QL, \(p) grepl(p, toupper(x)))]
    if (length(hit) == 1L) hit else NA_character_
  }
  # "Two Business Days prior to each Payment Date" → 営業日数と基準日
  valuation_rule <- function(x) {
    if (is.na(x)) return(list(offset = NA_integer_, anchor = NA_character_))
    m <- stringr::str_match(tolower(x), "^(\\w+) business days? (prior to|before|after) (?:each |the )?(payment date|period end date|calculation period end date|period end)")
    if (is.na(m[1, 1])) return(list(offset = NA_integer_, anchor = NA_character_))
    n <- suppressWarnings(as.integer(m[1, 2])) %|% .trs_numbers_QL[m[1, 2]]
    list(offset = unname(as.integer(n) * if (m[1, 3] == "after") 1L else -1L),
         anchor = if (startsWith(m[1, 4], "payment")) "payment_date" else "period_end")
  }
  vr <- valuation_rule(g("return.valuation_date_rule"))
  shift <- g("funding.observation_shift")
  t <- list(
    effective_date = item("trade.effective_date", "効力発生日", g("trade.effective_date"), date("trade.effective_date")),
    termination_date = item("trade.termination_date", "終了日", g("trade.termination_date"), date("trade.termination_date")),
    notional = item("trade.notional_amount", "想定元本", g("trade.notional_amount"), num("trade.notional_amount")),
    currency = item("trade.notional_currency", "通貨", g("trade.notional_currency"), g("trade.notional_currency")),
    f_frequency = item("funding.payment_frequency", "FundingLeg 支払頻度", g("funding.payment_frequency"), freq("funding.payment_frequency")),
    f_index = item("funding.floating_rate_index", "FundingLeg 参照金利", g("funding.floating_rate_index"), index_of(g("funding.floating_rate_index"))),
    f_spread_bp = item("funding.spread_bp", "FundingLeg スプレッド（bp）", g("funding.spread_bp"), num("funding.spread_bp")),
    f_day_count = item("funding.day_count", "FundingLeg 日数計算", g("funding.day_count"), .lookup_QL(g("funding.day_count"), .trs_day_count_QL)),
    f_lookback = item("funding.lookback_days", "FundingLeg ルックバック（営業日）", g("funding.lookback_days"), num("funding.lookback_days")),
    f_shift = item("funding.observation_shift", "FundingLeg 観測期間のシフト", shift, if (identical(toupper(shift %|% ""), "NO")) "なし" else NA,
                   status = if (is.na(shift)) "不足" else if (toupper(shift) == "NO") "原文どおり" else "未対応",
                   note = "観測期間のシフトありは rmql の TRS が未対応"),
    f_reset = item("funding.reset_relative_to", "FundingLeg リセット日", g("funding.reset_relative_to"),
                   c(PERIOD_START = "period_start", PERIOD_END = "period_end")[toupper(g("funding.reset_relative_to") %|% "")]),
    f_fixing_offset = item("funding.fixing_offset_days", "FundingLeg 金利決定日（リセット日からの営業日）", g("funding.fixing_offset_days"), num("funding.fixing_offset_days")),
    f_fixing_calendar = item("funding.fixing_calendar", "FundingLeg 金利決定日のカレンダー", g("funding.fixing_calendar"), .lookup_QL(g("funding.fixing_calendar"), .trs_calendar_QL)),
    f_fixing_convention = item("funding.fixing_business_day_convention", "FundingLeg 金利決定日の営業日調整", g("funding.fixing_business_day_convention"),
                               .lookup_QL(g("funding.fixing_business_day_convention"), .trs_bdc_QL)),
    f_payment_lag = item("funding.payment_lag_days", "FundingLeg 支払ラグ（営業日）", g("funding.payment_lag_days"), num("funding.payment_lag_days")),
    f_payment_calendar = item("funding.payment_calendar", "FundingLeg 支払日のカレンダー", g("funding.payment_calendar"), .lookup_QL(g("funding.payment_calendar"), .trs_calendar_QL)),
    f_payment_convention = item("funding.payment_business_day_convention", "FundingLeg 支払日の営業日調整", g("funding.payment_business_day_convention"),
                                .lookup_QL(g("funding.payment_business_day_convention"), .trs_bdc_QL)),
    r_frequency = item("return.valuation_frequency", "ReturnLeg 評価頻度", g("return.valuation_frequency"), freq("return.valuation_frequency")),
    r_initial_price = item("return.initial_price", "ReturnLeg 当初価格", g("return.initial_price"), num("return.initial_price")),
    r_valuation_rule = item("return.valuation_date_rule", "ReturnLeg 評価日", g("return.valuation_date_rule"),
                            if (is.na(vr$offset)) NA else paste0(vr$offset, " 営業日（", vr$anchor, " 基準）")),
    r_valuation_calendar = item("return.valuation_calendar", "ReturnLeg 評価日のカレンダー", g("return.valuation_calendar"), .lookup_QL(g("return.valuation_calendar"), .trs_calendar_QL)),
    r_final_valuation = item("return.final_valuation_date", "ReturnLeg 最終評価日", g("return.final_valuation_date"), date("return.final_valuation_date")),
    r_underlyer = item("return.underlyer_name", "ReturnLeg 参照資産", g("return.underlyer_name"), g("return.underlyer_name"))
  )
  t$r_valuation_offset <- vr$offset
  t$r_valuation_anchor <- vr$anchor
  # 原文に定義のない条件（前提をおくか、不足のまま残す）
  item("（原文になし）", "計算期間の終了日の営業日調整", NA, "modified_following", status = "前提",
       note = "原文は支払日の営業日調整だけを定める。計算期間の終了日にも同じ Modified Following を当てた（調整前の日がすべて営業日なら結果は変わらない）")
  item("（原文になし）", "ReturnLeg の支払日（Payment Date）", NA, NULL, status = "不足",
       note = "Payment Date の定義（支払ラグ・営業日調整）は FundingLeg にしかない。ReturnLeg の支払日は空欄にする")
  item("（原文になし）", "ReturnLeg 評価日の営業日調整", NA, "preceding", status = "前提",
       note = "「営業日前」は営業日を数えるので、結果は営業日になり調整の影響はない")
  t$log <- dplyr::bind_rows(log)
  t
}

# 金利の公表値（あれば）：data/market/fixings/<index>.csv（date, rate［小数］）。なければ NULL
trs_fixings_QL <- function(index) {
  f <- file.path(Sys.getenv("QUANTLET_ROOT"), "data", "market", "fixings", paste0(index, ".csv"))
  if (!file.exists(f)) return(NULL)
  readr::read_csv(f, col_types = readr::cols(date = readr::col_date(), rate = readr::col_double()), progress = FALSE)
}

.business_days_between_QL <- function(calendar, from, to) {
  # from（含まない）から to（含む）までの営業日数。to < from なら負
  if (is.na(from) || is.na(to)) return(NA_integer_)
  if (to == from) return(0L)
  s <- if (to > from) seq(from + 1, to, by = "day") else seq(to + 1, from, by = "day")
  n <- sum(rmql::is_business_day(calendar, s))
  if (to > from) n else -n
}

# 1件の案件から両レッグを作る。scenario_return_pct：ReturnLeg の試算に使う指数の年率の騰落（%）。NULL なら試算しない
build_trs_cashflows_QL <- function(case_dir, scenario_return_pct = NULL) {
  results <- read_c1_case_results(case_dir)
  validation <- validate_c1_case(results, Sys.getenv("QUANTLET_FPML_XSD", ""))
  cond <- validation$conditions
  if (is.null(cond)) stop("契約条件がない（C1 の抽出が完了していない）", call. = FALSE)
  t <- trs_terms_QL(cond)
  need <- function(keys) names(Filter(\(v) length(v) == 1L && is.na(v), t[keys]))
  common <- c("effective_date", "termination_date", "notional")
  f_missing <- need(c(common, "f_frequency", "f_index", "f_spread_bp", "f_day_count", "f_lookback", "f_shift", "f_reset",
                      "f_fixing_offset", "f_fixing_calendar", "f_fixing_convention", "f_payment_lag", "f_payment_calendar", "f_payment_convention"))
  r_missing <- need(c(common, "r_frequency", "r_initial_price", "r_valuation_rule", "r_valuation_calendar"))
  label_of <- function(keys) paste(t$log$項目[match(keys, names(t)[seq_len(nrow(t$log))])], collapse = "、")
  period_convention <- "modified_following"

  # ---- 市場データ（評価日と同じ市場日のもの） ----
  demo <- a1_demo_inputs_QL()
  evaluation_date <- demo$valuation_date
  curve <- NULL
  curve_note <- "予測カーブなし"
  if (!length(f_missing) && t$f_index == "tonar") {
    q <- import_ois_files_Curie(unname(demo$ois["JPY"]), text_import_settings_Curie(), tempfile("ois"))$quotes
    cv <- build_ois_curves_Curie(q, evaluation_date, "JPY")$JPY
    if (is.null(cv$error)) {
      curve <- cv$curve
      curve_note <- paste0("A1 のデモの JPY OIS カーブ（", evaluation_date, "、架空。rmql bootstrap_ois_curve）で翌日物の先渡金利を試算")
    }
  }
  fixings <- if (!length(f_missing)) trs_fixings_QL(t$f_index) else NULL

  # ---- FundingLeg ----
  funding <- if (length(f_missing)) {
    list(sheet = tibble::tibble(状態 = "算出不可", 不足項目 = label_of(f_missing)), checks = NULL, rows = NULL)
  } else {
    leg <- rmql::create_trs_funding_leg(
      t$effective_date, t$termination_date, t$f_frequency, t$f_payment_calendar, period_convention, t$f_payment_calendar,
      t$f_payment_convention, t$f_payment_lag, t$f_index, t$f_day_count, t$notional, t$f_spread_bp, lookback = t$f_lookback,
      reset_relative_to = t$f_reset, fixing_offset = t$f_fixing_offset, fixing_calendar = t$f_fixing_calendar,
      fixing_convention = t$f_fixing_convention)
    s <- rmql::get_trs_funding_schedule(leg)
    a <- rmql::compute_trs_funding_cashflows(leg, evaluation_date, fixings, curve)
    same_unadjusted <- all(s$unadjusted_start == s$accrual_start & s$unadjusted_end == s$accrual_end)
    status_ja <- c(fixed = "確定", projected = "試算", missing = "算出不可")
    basis <- dplyr::case_when(
      a$status == "fixed" ~ "公表値（TONA）だけ",
      a$status == "projected" ~ paste0("公表値 ", a$fixed_days, " 日・予測 ", a$projected_days, " 日。", curve_note),
      .default = paste0("前提が不足：", dplyr::if_else(grepl("no published fixing", a$reason),
                                                   paste0("観測日の TONA 公表値がない（評価日 ", evaluation_date, " より前の観測日。公表値のファイル data/market/fixings/tonar.csv もない）"),
                                                   a$reason)))
    sheet <- tibble::tibble(
      期間 = s$period, 調整前の開始日 = s$unadjusted_start, 調整前の終了日 = s$unadjusted_end,
      計算期間開始日 = s$accrual_start, 計算期間終了日 = s$accrual_end,
      リセット日 = s$reset_date, 金利決定日 = s$fixing_date, 観測期間開始日 = s$observation_start, 観測期間終了日 = s$observation_end,
      支払日 = s$payment_date, 日数 = as.integer(s$accrual_end - s$accrual_start), 年数 = s$accrual, 営業日数 = s$business_days,
      参照金利 = g_value(cond, "funding.floating_rate_index"), スプレッド_bp = t$f_spread_bp,
      複利金利_pct = a$compounded_rate * 100, 想定元本 = t$notional, 金額 = a$amount, 通貨 = t$currency,
      金額の状態 = unname(status_ja[a$status]), 金額の根拠 = basis,
      日程の状態 = if (same_unadjusted) "確定（前提あり：計算期間終了日の営業日調整。調整前の日がすべて営業日のため結果は前提によらない）" else
        "前提あり（計算期間終了日の営業日調整を Modified Following とした）"
    )
    checks <- dplyr::bind_rows(
      tibble::tibble(レッグ = "FundingLeg", 照合 = "最初の計算期間開始日 = 効力発生日", 契約 = format(t$effective_date), 計算 = format(s$accrual_start[1])),
      tibble::tibble(レッグ = "FundingLeg", 照合 = "最後の計算期間終了日 = 終了日", 契約 = format(t$termination_date), 計算 = format(dplyr::last(s$accrual_end))),
      tibble::tibble(レッグ = "FundingLeg", 照合 = "期間の数 = 支払頻度 × 年数", 契約 = as.character(round(t$f_frequency * as.numeric(t$termination_date - t$effective_date) / 365.25)),
                     計算 = as.character(nrow(s))),
      purrr::map(s$period, \(p) tibble::tibble(
        レッグ = "FundingLeg",
        照合 = c(paste0("期間", p, " 支払日 = 終了日の ", t$f_payment_lag, " 営業日後（", t$f_payment_calendar, "）"),
                 paste0("期間", p, " リセット日 = 計算期間の初日"),
                 paste0("期間", p, " 金利決定日 = リセット日の ", -t$f_fixing_offset, " 営業日前"),
                 paste0("期間", p, " 観測期間開始日 = 計算期間開始日の ", t$f_lookback, " 営業日前")),
        契約 = as.character(c(t$f_payment_lag, 0, t$f_fixing_offset, -t$f_lookback)),
        計算 = as.character(c(.business_days_between_QL(t$f_payment_calendar, s$accrual_end[p], s$payment_date[p]),
                              as.integer(s$reset_date[p] - s$accrual_start[p]),
                              .business_days_between_QL(t$f_fixing_calendar, s$reset_date[p], s$fixing_date[p]),
                              .business_days_between_QL("japan", s$accrual_start[p], s$observation_start[p]))))) |> purrr::list_rbind()
    )
    list(sheet = sheet, checks = checks, rows = s, amounts = a)
  }

  # ---- ReturnLeg ----
  return_leg <- if (length(r_missing)) {
    list(sheet = tibble::tibble(状態 = "算出不可", 不足項目 = label_of(r_missing)), checks = NULL)
  } else {
    make <- function(anchor, with_payment) rmql::create_trs_return_leg(
      t$effective_date, t$termination_date, t$r_frequency, t$r_valuation_calendar, period_convention,
      if (with_payment) t$f_payment_calendar else NULL, if (with_payment) t$f_payment_convention else NULL,
      if (with_payment) t$f_payment_lag else NULL, t$notional, t$r_initial_price, anchor, t$r_valuation_offset,
      t$r_valuation_calendar, "preceding", final_valuation_date = if (is.na(t$r_final_valuation)) NULL else t$r_final_valuation)
    # 「Payment Date」の読み方：ReturnLeg の支払日は原文で定義されていない。FundingLeg の支払日と読む場合と、計算期間の終了日と
    # 読む場合を rmql で計算し、原文の最終評価日と一致する読み方を採る（一致しなければ要確認）
    readings <- list()
    if (identical(t$r_valuation_anchor, "payment_date") && !length(f_missing)) {
      readings$funding_payment <- rmql::get_trs_return_schedule(make("payment_date", TRUE))
    }
    readings$period_end <- rmql::get_trs_return_schedule(make("period_end", FALSE))
    final_by <- purrr::map(readings, \(s) dplyr::last(s$valuation_date_by_rule))
    agrees <- purrr::map_lgl(final_by, \(d) !is.na(t$r_final_valuation) && d == t$r_final_valuation)
    chosen <- if (identical(t$r_valuation_anchor, "period_end")) "period_end" else if (isTRUE(agrees[["funding_payment"]])) "funding_payment" else
      if (isTRUE(agrees[["period_end"]])) "period_end" else names(readings)[1]
    s <- readings[[chosen]]
    leg <- if (chosen == "funding_payment") make("payment_date", TRUE) else make("period_end", FALSE)
    reading_note <- switch(chosen,
      funding_payment = "評価日の基準「Payment Date」を FundingLeg の支払日と読んだ（原文の最終評価日と一致）",
      period_end = paste0("評価日の基準「Payment Date」を各計算期間の終了日（支払ラグ前）と読んだ。原文の最終評価日 ", t$r_final_valuation,
                          " と一致する読み方。FundingLeg の支払日（ラグ ", t$f_payment_lag, " 営業日）と読むと最終評価日は ",
                          final_by[["funding_payment"]] %||% "—", " になり、原文と一致しない（要確認）"))
    levels <- NULL
    if (!is.null(scenario_return_pct) && is.finite(scenario_return_pct)) {
      yrs <- as.numeric(s$valuation_date - t$effective_date) / 365
      levels <- tibble::tibble(date = s$valuation_date, level = t$r_initial_price * (1 + scenario_return_pct / 100)^yrs, kind = "scenario")
    }
    a <- rmql::compute_trs_return_cashflows(leg, levels)
    status_ja <- c(fixed = "確定", scenario = "試算", missing = "算出不可")
    basis <- dplyr::case_when(
      a$status == "fixed" ~ "公表された指数値",
      a$status == "scenario" ~ paste0("シナリオ：指数が年率 ", scenario_return_pct, "% で推移（効力発生日の当初価格 ", t$r_initial_price, " から）"),
      .default = paste0("前提が不足：評価日の指数値（", t$r_underlyer, "）がない"))
    sheet <- tibble::tibble(
      期間 = s$period, 調整前の開始日 = s$unadjusted_start, 調整前の終了日 = s$unadjusted_end,
      計算期間開始日 = s$period_start, 計算期間終了日 = s$period_end,
      期初の評価日 = s$start_valuation_date, 評価日 = s$valuation_date, 規則による評価日 = s$valuation_date_by_rule,
      支払日 = if (chosen == "funding_payment") s$payment_date else as.Date(rep(NA, nrow(s))),
      参照資産 = t$r_underlyer, 期初の水準 = a$start_level, 期末の水準 = a$end_level,
      騰落率_pct = a$period_return * 100, 想定元本 = t$notional, 金額 = a$amount, 通貨 = t$currency,
      金額の状態 = unname(status_ja[a$status]), 金額の根拠 = basis,
      日程の状態 = paste0("前提あり：", reading_note),
      不足項目 = if (chosen == "funding_payment") "" else "支払日：ReturnLeg の Payment Date の定義（支払ラグ・営業日調整）が原文にない"
    )
    checks <- dplyr::bind_rows(
      tibble::tibble(レッグ = "ReturnLeg", 照合 = "最終評価日 = 原文の最終評価日", 契約 = format(t$r_final_valuation), 計算 = format(dplyr::last(s$valuation_date_by_rule))),
      tibble::tibble(レッグ = "ReturnLeg", 照合 = "最初の計算期間開始日 = 効力発生日", 契約 = format(t$effective_date), 計算 = format(s$period_start[1])),
      tibble::tibble(レッグ = "ReturnLeg", 照合 = "期間の数 = 評価頻度 × 年数", 契約 = as.character(round(t$r_frequency * as.numeric(t$termination_date - t$effective_date) / 365.25)),
                     計算 = as.character(nrow(s))),
      purrr::map(s$period, \(p) {
        anchor <- if (chosen == "period_end") s$period_end[p] else s$payment_date[p]
        tibble::tibble(レッグ = "ReturnLeg", 照合 = paste0("期間", p, " 評価日（規則）= 基準日の ", -t$r_valuation_offset, " 営業日前"),
                       契約 = as.character(t$r_valuation_offset), 計算 = as.character(.business_days_between_QL(t$r_valuation_calendar, anchor, s$valuation_date_by_rule[p])))
      }) |> purrr::list_rbind(),
      if (!is.null(readings$funding_payment)) tibble::tibble(レッグ = "ReturnLeg", 照合 = "（参考）FundingLeg の支払日を基準にした最終評価日",
                                                            契約 = format(t$r_final_valuation), 計算 = format(final_by[["funding_payment"]]))
    )
    list(sheet = sheet, checks = checks, chosen = chosen)
  }
  checks <- dplyr::bind_rows(funding$checks, return_leg$checks) |> dplyr::mutate(一致 = .data$契約 == .data$計算)
  list(terms = t, funding = funding, return_leg = return_leg, checks = checks, evaluation_date = evaluation_date,
       naming = c1_common_name(cond, read_aladdin_map_c1()), conditions = cond)
}

g_value <- function(cond, id) .condition_getter_c1(cond)(id)

# 案件フォルダーに Excel を保存する。ファイル名は C1 の共通名（PDF と同じベース名）＋ .xlsx
write_trs_cashflows_QL <- function(case_dir, scenario_return_pct = NULL) {
  x <- build_trs_cashflows_QL(case_dir, scenario_return_pct)
  base <- x$naming$name %|% x$naming$review_name
  path <- file.path(case_dir, "result", paste0(base, ".xlsx"))
  write_xlsx_Curie(list(FundingLeg = x$funding$sheet, ReturnLeg = x$return_leg$sheet), path)
  jsonlite::write_json(list(file = basename(path), base_name = base, name_confirmed = !is.na(x$naming$name), name_missing = x$naming$missing,
                            evaluation_date = format(x$evaluation_date), scenario_return_pct = scenario_return_pct,
                            terms = x$terms$log, checks = x$checks, created_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")),
                       file.path(case_dir, "result", "trs_cashflows.json"), auto_unbox = TRUE, pretty = TRUE, null = "null", na = "null", dataframe = "rows")
  c(x, list(path = path, base_name = base))
}
