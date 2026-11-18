# A1 の計算層（rmql）。
#
# Curie の次の関数を、同じ名前・同じ入出力の列で rmql に置き換えたもの。
#   R/z0_utility/bond_build.R      calendar_from_name_Curie, frequency_period_Curie, build_fixed_rate_bond_Curie
#   R/z0_utility/curve_build.R     build_ois_curves_Curie, summarise_ois_curves_Curie
#   R/z0_utility/bond_yield_YEN.R  compound_yield_YEN_Curie, compute_jgb_yields_Curie
#   R/a1_offer_sheet/compute_offer_pricing.R  pricing_settings_Curie, price_offer_row_Curie, compute_offer_pricing_Curie
# Curie は GaussQuant と QuantLib（R バインディング）で計算していた。計算規約は Curie と同じにする。
#   - OIS カーブ：spot OIS の気配、受渡2営業日（SONIA は0）、年1回払い、支払ラグ0、MonotonicLogCubic、外挿なし
#   - 債券：銘柄属性の規約（QuantLib の名前を rmql の名前に変換）、額面100、終期は計算終期
#   - ASW：受渡日に開始、翌日物レッグは pricing_settings の払い方（既定は半年払い・支払ラグ0。Curie のデモの仮定）
#   - 円債の複利利回り：残存年数は満年数＋端数 ACT/365、小数第7位で切り捨て（rmql docs/spec_bonds.md 5.1）
# 計算そのものは rmql を呼ぶだけで、ここでは数式を実装しない（JGB・ベーシスの補間は spread_inputs.R の R の処理）。

.ois_index_QL <- list(
  JPY = list(index = "tonar", index_name = "TONAR", day_count = "actual_365_fixed", settlement_days = 2L),
  USD = list(index = "sofr", index_name = "SOFR", day_count = "actual_360", settlement_days = 2L),
  EUR = list(index = "estr", index_name = "ESTR", day_count = "actual_360", settlement_days = 2L),
  GBP = list(index = "sonia", index_name = "SONIA", day_count = "actual_365_fixed", settlement_days = 0L)
)

# 銘柄属性の名前（QuantLib の名前）→ rmql の名前。表にないものは未対応としてエラーにする
.calendar_names_QL <- c(Japan = "japan", UnitedStates_GovernmentBond = "us_government_bond", TARGET = "target",
                        UnitedKingdom = "united_kingdom")
.day_count_names_QL <- c(Actual365Fixed = "actual_365_fixed", Actual360 = "actual_360",
                         Thirty360_BondBasis = "thirty_360_bond_basis", ActualActual_Bond = "act_act_isma",
                         ActualActual_ISMA = "act_act_isma")
.frequency_tenors_QL <- c(`1` = "12M", `2` = "6M", `4` = "3M", `12` = "1M")
.frequency_numbers_QL <- c(Annual = 1L, Semiannual = 2L, Quarterly = 4L, Monthly = 12L)

calendar_from_name_Curie <- function(name) {
  v <- .calendar_names_QL[name]
  if (is.na(v)) stop("Unsupported calendar: ", name, call. = FALSE)
  unname(v)
}

day_count_from_name_QL <- function(name) {
  v <- .day_count_names_QL[name]
  if (is.na(v)) stop("Unsupported day count: ", name, call. = FALSE)
  unname(v)
}

frequency_period_Curie <- function(coupon_frequency) {
  v <- .frequency_tenors_QL[as.character(coupon_frequency)]
  if (is.na(v)) stop("Unsupported coupon frequency: ", coupon_frequency, call. = FALSE)
  unname(v)
}

# "ModifiedFollowing" → "modified_following"
.convention_name_QL <- function(x) tolower(gsub("([a-z])([A-Z])", "\\1_\\2", x))

.payment_frequency_QL <- function(x) {
  if (is.numeric(x)) return(as.integer(x))
  v <- .frequency_numbers_QL[x]
  if (is.na(v)) stop("Unsupported payment frequency: ", x, call. = FALSE)
  unname(v)
}

# 銘柄属性の1行から固定利付債を作る（額面100、終期は計算終期）
build_fixed_rate_bond_Curie <- function(row) {
  rmql::create_fixed_rate_bond(
    settlement_days = as.integer(row$settlement_days), face_amount = 100,
    effective_date = as.Date(row$issue_date), termination_date = as.Date(row$calculation_end_date),
    tenor = frequency_period_Curie(row$coupon_frequency), calendar = calendar_from_name_Curie(row$calendar),
    convention = .convention_name_QL(row$schedule_convention),
    termination_convention = .convention_name_QL(row$maturity_convention),
    rule = .convention_name_QL(row$date_generation), end_of_month = isTRUE(as.logical(row$end_of_month)),
    coupon_rate = row$coupon_rate, day_count = day_count_from_name_QL(row$day_count),
    payment_convention = .convention_name_QL(row$payment_convention), redemption = row$redemption
  )
}

# ---- OIS カーブ -------------------------------------------------------------------------------------
build_ois_curves_Curie <- function(ois, valuation_date, currencies) {
  currencies |>
    rlang::set_names() |>
    purrr::map(function(ccy) {
      quotes <- dplyr::filter(ois, .data$marketdate == valuation_date, .data$currency == ccy)
      if (!nrow(quotes)) {
        return(list(error = paste0(ccy, " の評価日 ", valuation_date, " のOIS気配がない（別の日付では補わない）")))
      }
      spec <- .ois_index_QL[[ccy]]
      if (is.null(spec)) return(list(error = paste0("rmql の OIS カーブは TONAR・SOFR・€STR・SONIA のみ（", ccy, " は未対応）")))
      if (!"instrument_type" %in% names(quotes)) quotes$instrument_type <- "spot_ois"
      if (any(quotes$instrument_type != "spot_ois")) {
        return(list(error = paste0(ccy, " の気配に spot_ois 以外（", paste(unique(setdiff(quotes$instrument_type, "spot_ois")), collapse = ", "),
                                   "）がある。rmql の OIS カーブは spot OIS の気配だけを使う")))
      }
      tryCatch({
        instruments <- rmql::create_ois_instruments(toupper(trimws(quotes$tenor)), quotes$rate_pct / 100, spec$settlement_days, 1L, 0L)
        curve <- rmql::bootstrap_ois_curve(valuation_date, valuation_date, spec$index, spec$day_count, instruments,
                                                     interpolation = "monotonic_log_cubic")
        rep <- rmql::get_quote_repricing(curve)
        list(
          curve = curve, currency = ccy, index = spec$index, index_name = spec$index_name, marketdate = valuation_date,
          quotes = quotes, repricing = rep, last_date = max(rep$pillar_date),
          curve_id = paste("OIS", paste(unique(quotes$source_file), collapse = ","), valuation_date,
                           paste(unique(quotes$instrument), collapse = ","), sep = "|"),
          quote_time = if ("quote_time" %in% names(quotes)) paste(unique(stats::na.omit(quotes$quote_time)), collapse = ", ") else ""
        )
      }, error = function(e) list(error = conditionMessage(e)))
    })
}

summarise_ois_curves_Curie <- function(curves) {
  purrr::imap(curves, function(x, ccy) {
    if (!is.null(x$error)) return(tibble::tibble(currency = ccy, curve_status = "failed", curve_message = x$error))
    tibble::tibble(
      currency = ccy, curve_status = "success", curve_message = "",
      ois_curve_id = x$curve_id, index = x$index_name, marketdate = x$marketdate,
      quote_time = x$quote_time, quotes = nrow(x$quotes), last_tenordate = max(x$repricing$maturity_date),
      max_abs_quote_error_bp = max(x$repricing$reproduction_error) * 1e4,
      engine = "rmql bootstrap_ois_curve（monotonic_log_cubic、年1回払い、支払ラグ0）"
    )
  }) |> purrr::list_rbind()
}

# ---- 円債の複利利回り・リスク指標（複利・デュレーション・コンベクシティは小数点3桁、4桁目切り捨て） ----
.trunc3_QL <- function(x) ifelse(is.na(x), NA_real_, trunc(x * 1000) / 1000)

compound_yield_YEN_Curie <- function(settlement_date, maturity_date, coupon_rate, clean_price,
                                     redemption, coupon_frequency, compound_frequency) {
  t <- rmql::compute_remaining_years(as.Date(settlement_date), as.Date(maturity_date))
  rmql::compute_compound_yield_from_price(t, coupon_rate * 100, clean_price, redemption,
                                                    as.integer(coupon_frequency), as.integer(compound_frequency))
}

compute_jgb_yields_Curie <- function(jgb, compound_frequency = 2) {
  jgb |>
    dplyr::mutate(
      result = purrr::pmap(
        list(.data$settlement_date, .data$maturity_date, .data$coupon_rate, .data$clean_price,
             .data$redemption, .data$coupon_frequency, .data$price_type),
        function(settle, maturity, coupon, price, redemption, freq, type) {
          if (is.na(coupon)) return(list(y = NA_real_, msg = "JGBの銘柄属性がない"))
          if (!identical(type, "clean")) return(list(y = NA_real_, msg = "単価がクリーン価格ではない"))
          tryCatch(list(y = compound_yield_YEN_Curie(settle, maturity, coupon, price, redemption, freq, compound_frequency), msg = ""),
                   error = function(e) list(y = NA_real_, msg = conditionMessage(e)))
        }
      ),
      compound_yield_pct = purrr::map_dbl(.data$result, "y"),
      yield_message = purrr::map_chr(.data$result, "msg"),
      compound_frequency = compound_frequency,
      remaining_years = rmql::compute_remaining_years(.data$settlement_date, .data$maturity_date)
    ) |>
    dplyr::select(-"result")
}

# ---- オファーの計算 --------------------------------------------------------------------------------
.jpy_asw_model_note_Curie <- paste(
  "簡易モデル（rmql compute_yen_asset_swap。Curie の compute_asset_swap_basis_JPY と同じ定義）：",
  "円担保・元本固定・開始日と満期に元本交換。満期に対応するベーシス1点（気配を補間した値）で外貨割引の一定スプレッドを校正する。",
  "CCSの期間構造全体を校正したモデルではない。MtMリセット・FXスワップ調整・取引費用・クオント調整・信用等の調整は含まない"
)

pricing_settings_Curie <- function(
    asw_payment_frequency = "Semiannual", asw_payment_lag = 0L,
    jpy_payment_frequency = "Semiannual", jpy_payment_lag = 0L,
    jgb_compound_frequency = 2,
    assumption_note = "ASWの翌日物レッグ（半年払い・支払ラグ0）はデモの仮定") {
  list(asw_payment_frequency = asw_payment_frequency, asw_payment_lag = as.integer(asw_payment_lag),
       jpy_payment_frequency = jpy_payment_frequency, jpy_payment_lag = as.integer(jpy_payment_lag),
       jgb_compound_frequency = jgb_compound_frequency, assumption_note = assumption_note)
}

.empty_pricing_Curie <- function(settings) {
  tibble::tibble(
    valuation_date = as.Date(NA), bond_settlement_date = as.Date(NA), asw_effective_date = as.Date(NA),
    asw_maturity_date = as.Date(NA), accrued_per_100 = NA_real_, dirty_price = NA_real_,
    asw_payment_frequency = settings$asw_payment_frequency, asw_payment_lag = settings$asw_payment_lag,
    asw_conditions_note = settings$assumption_note,
    native_asw_bp = NA_real_, native_asw_status = NA_character_,
    native_ois_curve_id = NA_character_, native_ois_marketdate = as.Date(NA), native_ois_quote_time = NA_character_,
    jpy_compound_yield_pct = NA_real_, jgb_interpolated_yield_pct = NA_real_, jgb_spread_bp = NA_real_,
    compound_yield_pct = NA_real_, modified_duration = NA_real_, convexity = NA_real_,
    jgb_yield_convention = NA_character_, jgb_curve_id = NA_character_,
    jgb_marketdate = as.Date(NA), jgb_quote_time = NA_character_, jgb_spread_status = NA_character_,
    fx_spot = NA_real_, fx_spot_date = as.Date(NA), fx_quote_id = NA_character_,
    fx_marketdate = as.Date(NA), fx_quote_time = NA_character_,
    basis_bp = NA_real_, basis_quote_set_id = NA_character_, basis_method = NA_character_,
    basis_marketdate = as.Date(NA), basis_quote_time = NA_character_,
    jpy_asw_bp = NA_real_, simple_sum_bp = NA_real_, calibrated_discount_spread_bp = NA_real_,
    ccs_repricing_npv_jpy = NA_real_, fair_spread_npv_jpy = NA_real_,
    jpy_asw_model = NA_character_, jpy_asw_status = NA_character_,
    jpy_ois_curve_id = NA_character_, jpy_ois_marketdate = as.Date(NA), jpy_ois_quote_time = NA_character_,
    pricing_status = NA_character_, pricing_message = NA_character_
  )
}

.price_jgb_spread_Curie <- function(out, row, jgb_avg, settings) {
  out$jpy_compound_yield_pct <- compound_yield_YEN_Curie(
    row$offer_settlementdate, row$calculation_end_date, row$coupon_rate, row$offer_price,
    row$redemption, row$coupon_frequency, settings$jgb_compound_frequency)
  t_rem <- rmql::compute_remaining_years(as.Date(row$offer_settlementdate), as.Date(row$calculation_end_date))
  risk_jpy <- rmql::compute_risk_from_compound_yield(
    t_rem, row$coupon_rate * 100, out$jpy_compound_yield_pct, row$redemption, out$accrued_per_100,
    as.integer(row$coupon_frequency), as.integer(settings$jgb_compound_frequency), on_error = "na"
  )
  out$compound_yield_pct <- .trunc3_QL(out$jpy_compound_yield_pct)
  out$modified_duration <- .trunc3_QL(risk_jpy$modified_duration)
  out$convexity <- .trunc3_QL(risk_jpy$convexity)
  out$jgb_yield_convention <- paste0(
    "rmql::compute_compound_yield_from_price、クリーン単価、受渡日 ", row$offer_settlementdate,
    "、利払年", row$coupon_frequency, "回・複利年", settings$jgb_compound_frequency,
    "回、残存年数は満年数＋端数ACT/365（対象債・JGB共通）")
  spread <- jgb_spread_Curie(jgb_avg, row$offer_date, row$offer_settlementdate, row$calculation_end_date,
                             out$jpy_compound_yield_pct, row$coupon_frequency, settings$jgb_compound_frequency)
  out$jgb_interpolated_yield_pct <- spread$jgb_interpolated_yield_pct
  out$jgb_spread_bp <- spread$jgb_spread_bp
  out$jgb_curve_id <- spread$jgb_curve_id
  out$jgb_marketdate <- spread$jgb_marketdate
  out$jgb_quote_time <- spread$jgb_quote_time
  out$jgb_spread_status <- if (is.na(spread$jgb_spread_bp)) "not_computed" else "computed"
  list(out = out, message = if (is.na(spread$jgb_spread_bp)) paste0("JGBスプレッド未計算: ", spread$jgb_spread_message))
}

.price_jpy_asw_Curie <- function(out, row, bond, native, curve, curves, fx, basis_avg, settings) {
  ccy <- row$currency
  dc_iso <- day_count_from_name_QL(row$day_count)
  freq_iso <- as.integer(row$coupon_frequency)
  y_iso <- rmql::compute_yield_from_price(
    bond, row$offer_price, "clean", dc_iso, "compounded", freq_iso, row$offer_settlementdate, on_error = "na"
  )
  if (!is.na(y_iso)) {
    bv_iso <- rmql::compute_bond_values(
      bond, y_iso, dc_iso, "compounded", freq_iso, row$offer_settlementdate, on_error = "na"
    )
    out$compound_yield_pct <- .trunc3_QL(y_iso * 100)
    out$modified_duration <- .trunc3_QL(bv_iso$duration_modified)
    out$convexity <- .trunc3_QL(bv_iso$convexity)
  }
  out$jpy_asw_status <- "not_computed"
  out$jpy_asw_model <- .jpy_asw_model_note_Curie
  jpy_curve <- curves[["JPY"]]
  fx_row <- dplyr::filter(fx, .data$marketdate == row$offer_date, .data$base_currency == ccy, .data$quote_currency == "JPY")
  basis_row <- interpolate_ccs_basis_Curie(basis_avg, row$offer_date, row$calculation_end_date, ccy,
                                           basis_terms_for_model_Curie(ccy, curve$index_name))
  out$basis_bp <- basis_row$basis_bp
  out$basis_quote_set_id <- basis_row$basis_quote_set_id
  out$basis_method <- basis_row$basis_method
  out$basis_marketdate <- basis_row$basis_marketdate
  out$basis_quote_time <- basis_row$basis_quote_time
  if (nrow(fx_row) == 1L) {
    out$fx_spot <- fx_row$fx_spot
    out$fx_spot_date <- fx_row$spot_date
    out$fx_quote_id <- fx_row$fx_quote_id
    out$fx_marketdate <- fx_row$marketdate
    out$fx_quote_time <- fx_row$quote_time
  }
  reason <- if (is.null(jpy_curve) || !is.null(jpy_curve$error)) {
    paste0("JPYのOISカーブを構築できない: ", jpy_curve$error)
  } else if (nrow(fx_row) != 1L) {
    paste0("評価日の対円FXスポットが1件に定まらない（", nrow(fx_row), "件）")
  } else if (fx_row$spot_date != native$effective_date) {
    paste0("FXの受渡日 ", fx_row$spot_date, " とASW開始日 ", native$effective_date, " が異なる（FXスワップ調整は未実装）")
  } else if (is.na(basis_row$basis_bp)) {
    basis_row$basis_message
  } else if (as.Date(row$calculation_end_date) > jpy_curve$last_date) {
    paste0("満期 ", row$calculation_end_date, " がJPYカーブの最後のピラー ", jpy_curve$last_date, " より後（外挿しない）")
  } else ""
  if (nzchar(reason)) return(list(out = out, message = paste0("円換算ASW未計算: ", reason)))
  y <- rmql::compute_yen_asset_swap(
    bond, row$offer_price, curve$curve, jpy_curve$curve, out$fx_spot, out$basis_bp, row$offer_date,
    foreign_payment_frequency = .payment_frequency_QL(settings$asw_payment_frequency),
    yen_payment_frequency = .payment_frequency_QL(settings$jpy_payment_frequency),
    foreign_payment_lag = settings$asw_payment_lag, yen_payment_lag = settings$jpy_payment_lag, on_error = "na")
  if (!is.na(y$error)) return(list(out = out, message = paste0("円換算ASW未計算: 計算エラー: ", y$error)))
  out$jpy_asw_bp <- y$yen_asw_bp
  out$simple_sum_bp <- y$simple_sum_bp
  out$calibrated_discount_spread_bp <- y$calibrated_discount_spread_bp
  # rmql は CCS 校正の残差を返さない（README「rmql で対応していない部分」）。NA のまま
  out$ccs_repricing_npv_jpy <- NA_real_
  # spread_bp = 0 の NPV に、フェアスプレッド × アニュイティを足したもの（0 になるはず）
  out$fair_spread_npv_jpy <- y$npv_yen + y$yen_asw_bp / 1e4 * y$spread_annuity_yen
  out$jpy_asw_status <- "computed"
  out$jpy_ois_curve_id <- jpy_curve$curve_id
  out$jpy_ois_marketdate <- jpy_curve$marketdate
  out$jpy_ois_quote_time <- jpy_curve$quote_time
  list(out = out, message = NULL)
}

price_offer_row_Curie <- function(workflow, row, curves, market, basis_avg, jgb_avg, settings) {
  out <- .empty_pricing_Curie(settings)
  out$valuation_date <- row$offer_date
  fail <- function(message) {
    out$pricing_status <- "failed"
    out$pricing_message <- message
    out
  }
  if (!identical(row$validation_status, "valid")) {
    if (isTRUE(row$unsupported_only)) {
      out$pricing_status <- "unsupported"
      out$pricing_message <- paste0("未対応: ", dplyr::coalesce(row$unsupported_reason, row$validation_message), "（固定利付債として代用しない）")
    } else {
      out$pricing_status <- "skipped"
      out$pricing_message <- paste("入力検証で不合格:", row$validation_message)
    }
    return(out)
  }
  curve <- curves[[row$currency]]
  if (is.null(curve) || !is.null(curve$error)) return(fail(paste0(row$currency, " のOISカーブを構築できない: ", curve$error)))
  run <- function() {
    if (as.Date(row$calculation_end_date) > curve$last_date) {
      return(fail(paste0("計算終期 ", row$calculation_end_date, " が ", row$currency, " カーブの最後のピラー ", curve$last_date, " より後（外挿しない）")))
    }
    bond <- build_fixed_rate_bond_Curie(row)
    out$bond_settlement_date <- rmql::compute_settlement_date(bond, row$offer_date)
    if (out$bond_settlement_date != row$offer_settlementdate) {
      return(fail(paste0("受渡日の不一致: 債券の受渡日 ", out$bond_settlement_date, "（評価日+", row$settlement_days,
                         "営業日）とオファー受渡日 ", row$offer_settlementdate, " が異なる")))
    }
    v <- rmql::compute_ois_asset_swap(bond, row$offer_price, curve$curve, row$offer_date,
                                                payment_frequency = .payment_frequency_QL(settings$asw_payment_frequency),
                                                payment_lag = settings$asw_payment_lag, on_error = "na")
    if (!is.na(v$error)) return(fail(paste("計算エラー:", v$error)))
    if (v$maturity_date != row$calculation_end_date) {
      return(fail(paste0("ASWの満期 ", v$maturity_date, " が計算終期 ", row$calculation_end_date, " と異なる")))
    }
    out$asw_effective_date <- v$effective_date
    out$asw_maturity_date <- v$maturity_date
    out$accrued_per_100 <- v$accrued
    out$dirty_price <- v$dirty_price
    out$native_asw_bp <- v$fair_spread_bp
    out$native_asw_status <- "computed"
    out$native_ois_curve_id <- curve$curve_id
    out$native_ois_marketdate <- curve$marketdate
    out$native_ois_quote_time <- curve$quote_time
    step <- if (workflow == "JPY") {
      .price_jgb_spread_Curie(out, row, jgb_avg, settings)
    } else {
      .price_jpy_asw_Curie(out, row, bond, v, curve, curves, market$fx, basis_avg, settings)
    }
    out <- step$out
    out$pricing_status <- if (length(step$message)) "partial" else "success"
    out$pricing_message <- if (length(step$message)) step$message else ""
    out
  }
  tryCatch(run(), error = function(e) fail(paste("計算エラー:", conditionMessage(e))))
}

compute_offer_pricing_Curie <- function(workflow = c("JPY", "ISO"), worksheet, ois, market, valuation_date,
                                        settings = pricing_settings_Curie()) {
  workflow <- match.arg(workflow)
  basis_avg <- if (workflow == "ISO") average_ccs_basis_Curie(market$basis) else NULL
  jgb_avg <- if (workflow == "JPY") average_jgb_yields_Curie(market$jgb_yields) else NULL
  valid_ccy <- stats::na.omit(worksheet$currency[worksheet$validation_status == "valid"])
  curves <- build_ois_curves_Curie(ois, valuation_date, unique(c("JPY", valid_ccy)))
  results <- purrr::map(seq_len(nrow(worksheet)), \(i) {
    price_offer_row_Curie(workflow, worksheet[i, ], curves, market, basis_avg, jgb_avg, settings)
  }) |> purrr::list_rbind()
  list(
    results = worksheet |> dplyr::select(-dplyr::any_of(names(results))) |> dplyr::bind_cols(results),
    curves = summarise_ois_curves_Curie(curves), basis_average = basis_avg, jgb_average = jgb_avg, settings = settings
  )
}
