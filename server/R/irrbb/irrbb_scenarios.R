# IRRBB 金利シナリオ：円建て固定利付債のサンプル・ポートフォリオを、バーゼル SRP31.90〜31.93 の金利ショックで再評価する。
#
# 分担
#   rmql：年限別のショック（compute_irrbb_shocks・compute_irrbb_curve_points）、ショック後カーブ（create_irrbb_shocked_curve）、
#                   債券のキャッシュフローと再評価（create_fixed_rate_bond・compute_bond_value_on_curve）、基準カーブ（bootstrap_ois_curve）
#   ここ（R）     ：入力（ポートフォリオ・基準カーブ・シナリオ・フロア）を整え、結果を集計して JSON にする
# 評価対象はサンプルの固定利付債（data/demo/irrbb/portfolio_jpy_fixed.csv、架空）に限る。

irrbb_references_QL <- list(
  list(id = "SRP31", title = "Basel Framework SRP31 Interest rate risk in the banking book（SRP31.90〜31.93）",
       publisher = "バーゼル銀行監督委員会（BCBS）", published = "2024-07-16", effective = "2026-01-01",
       url = "https://www.bis.org/committees/bcbs/basel-framework/standard/srp/31/inforce/2026-01-01/published/2024-07-16",
       used_for = "6 シナリオ（31.90）、通貨別ショック幅 Table 2（JPY：パラレル 100・短期 100・長期 100 bp）、形状（31.91、x = 4）、計算例（31.92）、フロアは各国当局の裁量で 0 以下（31.93）"),
  list(id = "FSA-2024", title = "金融庁・日本銀行「IRRBB（銀行勘定の金利リスク）」に関する資料（2024年10月15日）",
       publisher = "金融庁", published = "2024-10-15", effective = NA,
       url = "https://www.fsa.go.jp/frtc/kikou/2024/20241015.pdf",
       used_for = "本邦では国際統一基準行が 6 シナリオ、国内基準行が上方パラレル・下方パラレル・スティープ化の 3 シナリオを用いる"),
  list(id = "FSA-2025", title = "金融庁「バーゼルIII関連告示の改正（金利リスクの計測に用いる金利ショックの水準の修正）」（2025年3月31日公表）",
       publisher = "金融庁", published = "2025-03-31", effective = "未確認（本実装では確認していない。BCBS 側の適用は 2026-01-01）",
       url = "https://www.fsa.go.jp/news/r6/ginkou/20250331.html",
       used_for = "SRP31 の見直し（2024年）を本邦の告示に反映。円のショック幅は見直し後も 100 bp（SRP31.90 Table 2）")
)

irrbb_scenarios_QL <- tibble::tribble(
  ~id,             ~label,              ~domestic,
  "parallel_up",   "上方パラレル",       TRUE,
  "parallel_down", "下方パラレル",       TRUE,
  "steepener",     "スティープ化",       TRUE,
  "flattener",     "フラット化",         FALSE,
  "short_up",      "短期金利上昇",       FALSE,
  "short_down",    "短期金利低下",       FALSE
)

irrbb_portfolio_QL <- function(root = Sys.getenv("QUANTLET_ROOT")) {
  readr::read_csv(file.path(root, "data", "demo", "irrbb", "portfolio_jpy_fixed.csv"), progress = FALSE,
                  col_types = readr::cols(issue_date = readr::col_date(), maturity_date = readr::col_date(), coupon_pct = readr::col_double(),
                                          coupon_frequency = readr::col_integer(), face_amount = readr::col_double(),
                                          settlement_days = readr::col_integer(), .default = readr::col_character()))
}

# 基準の円ゼロ金利カーブ：オファーシートと同じデモの円 OIS（TONA）を rmql でブートストラップしたもの
irrbb_base_curve_QL <- function() {
  ds <- asw_ois_dataset_QL()
  f <- ois_dataset_files_QL()
  f <- f[f$kind == ds$kind & f$base_date == as.Date(ds$base_date) & f$currency == "JPY", ]
  q <- import_ois_files_Curie(f$path, text_import_settings_Curie(), tempfile("ois"))$quotes
  cv <- build_ois_curves_Curie(q, as.Date(ds$base_date), "JPY")$JPY
  if (!is.null(cv$error)) stop("円の基準カーブを作れない: ", cv$error, call. = FALSE)
  list(curve = cv$curve, valuation_date = as.Date(ds$base_date), last_date = cv$last_date,
       source = paste0(ds$label, "の円 OIS（TONA）。", paste(unique(q$source), collapse = " / ")),
       quote_time = paste(unique(stats::na.omit(q$quote_time)), collapse = ", "), label = ds$label)
}

# floor：NULL（フロアなし）または 0 以下の小数
compute_irrbb_portfolio_QL <- function(floor = NULL) {
  base <- irrbb_base_curve_QL()
  vd <- base$valuation_date
  dates <- unique(c(seq(vd, base$last_date, by = "month"), base$last_date))
  pf <- irrbb_portfolio_QL()
  if (any(pf$maturity_date > base$last_date)) stop("満期が基準カーブの最後の期日より後の銘柄がある（外挿しない）", call. = FALSE)
  bonds <- purrr::pmap(pf, function(bond_id, security_name, issue_date, maturity_date, coupon_pct, coupon_frequency, face_amount,
                                    day_count, calendar, settlement_days, payment_convention) {
    rmql::create_fixed_rate_bond(settlement_days, face_amount, issue_date, maturity_date,
                                           c(`1` = "12M", `2` = "6M", `4` = "3M")[[as.character(coupon_frequency)]], calendar,
                                           "unadjusted", "unadjusted", "backward", FALSE, coupon_pct / 100, day_count, payment_convention, 100)
  })
  pv <- function(curve) purrr::map_dbl(bonds, \(b) rmql::compute_bond_value_on_curve(b, curve, vd)$npv)
  sizes <- rmql::get_irrbb_shock_sizes("JPY")
  base_curve <- rmql::create_irrbb_shocked_curve(base$curve, "base", dates, "JPY", floor = floor)
  base_vals <- purrr::map(bonds, \(b) rmql::compute_bond_value_on_curve(b, base_curve, vd))
  base_pv <- purrr::map_dbl(base_vals, "npv")
  base_clean <- purrr::map_dbl(base_vals, "clean_price")
  base_dirty <- purrr::map_dbl(base_vals, "dirty_price")
  settle_dates <- purrr::map_vec(bonds, \(b) rmql::compute_settlement_date(b, vd))
  rem_years <- rmql::compute_remaining_years(settle_dates, pf$maturity_date)
  cy_raw <- purrr::pmap_dbl(
    list(rem_years, pf$coupon_pct, base_clean, pf$coupon_frequency),
    \(t, c, p, f) rmql::compute_compound_yield_from_price(t, c, p, 100, as.integer(f), 2L, on_error = "na")
  )
  risk_tbl <- purrr::pmap(
    list(rem_years, pf$coupon_pct, cy_raw, base_dirty - base_clean, pf$coupon_frequency),
    \(t, c, y, acc, f) rmql::compute_risk_from_compound_yield(t, c, y, 100, acc, as.integer(f), 2L, on_error = "na")
  ) |> purrr::list_rbind()
  original_pv <- pv(base$curve)
  tenors <- c(0.25, 0.5, 1, 2, 3, 3.5, 5, 7, 10, 15, 20, 25, 30)
  # グラフ用：3か月ごとの点（月次の点から間引く）
  chart_idx <- unique(c(seq(1, length(dates), by = 3), length(dates)))
  scen <- purrr::pmap(irrbb_scenarios_QL, function(id, label, domestic) {
    pts <- rmql::compute_irrbb_curve_points(base$curve, id, dates, "JPY", floor = floor)
    shocked_pv <- pv(rmql::create_irrbb_shocked_curve(base$curve, id, dates, "JPY", floor = floor))
    bonds_tbl <- tibble::tibble(bond_id = pf$bond_id, security_name = pf$security_name, base_pv = base_pv, shocked_pv = shocked_pv,
                                pv_change = shocked_pv - base_pv)
    list(id = id, label = label, domestic = domestic,
         shocks_by_tenor = tibble::tibble(tenor_years = tenors, shock_bp = rmql::compute_irrbb_shocks(tenors, id, sizes)),
         curve = tibble::tibble(years = pts$time[chart_idx], base_zero_pct = pts$base_zero[chart_idx] * 100,
                                shocked_zero_pct = pts$shocked_zero[chart_idx] * 100, shock_bp = pts$shock_bp[chart_idx],
                                floored = pts$floored[chart_idx]),
         floored_points = sum(pts$floored),
         bonds = bonds_tbl,
         total = list(base_pv = sum(base_pv), shocked_pv = sum(shocked_pv), pv_change = sum(shocked_pv) - sum(base_pv),
                      sum_of_bond_changes = sum(bonds_tbl$pv_change)))
  })
  list(
    title = "IRRBBシナリオによる債券ポートフォリオのPV変化",
    valuation_date = format(vd),
    base_curve = list(name = "円ゼロ金利カーブ（TONA OIS から rmql でブートストラップ）", source = base$source,
                      base_date = format(vd), quote_time = base$quote_time, last_date = format(base$last_date)),
    portfolio = pf |> dplyr::mutate(remaining_years = round(as.numeric(.data$maturity_date - vd) / 365, 2),
                                    compound_yield_pct = .trunc3_QL(cy_raw),
                                    modified_duration = .trunc3_QL(risk_tbl$modified_duration),
                                    convexity = .trunc3_QL(risk_tbl$convexity),
                                    dplyr::across(dplyr::where(\(x) inherits(x, "Date")), format)),
    shock_sizes_bp = sizes,
    scenario_sets = list(domestic = list(label = "国内基準行（3シナリオ）", ids = irrbb_scenarios_QL$id[irrbb_scenarios_QL$domestic]),
                         international = list(label = "国際統一基準行（6シナリオ）", ids = irrbb_scenarios_QL$id)),
    scenarios = scen,
    references = irrbb_references_QL,
    assumptions = list(
      floor = if (is.null(floor)) "金利フロア：適用しない。SRP31.93 は各国当局が 0 以下のフロアを設けることを認めるが、金融庁のフロアの扱いは本実装では確認していない（画面で 0% のフロアを選べる）" else
        paste0("金利フロア：ショック後のゼロ金利に ", floor * 100, "% を適用（参考）。基準の金利がフロアより低い年限は、ショック後も基準の金利より下げない（max(基準＋ショック, min(基準, フロア))）"),
      shapes = "形状は SRP31.91：パラレル ±P、短期 ±S·exp(−t/4)、長期 ±L·(1−exp(−t/4))、スティープ化 −0.65|短期|+0.9|長期|、フラット化 +0.8|短期|−0.6|長期|（t は評価日からの年数、Actual/365 Fixed）",
      curve = "ショックは基準カーブのゼロ金利（連続複利）に加える。基準カーブ・ショック後カーブとも、評価日から最後の期日まで月ごとの点のゼロ金利を線形補間したカーブで評価する（基準 PV もこのカーブ。差がショックだけから生じるように）",
      original_curve_note = paste0("参考：元の OIS カーブ（MonotonicLogCubic）での基準 PV 合計との差 ", format(round(sum(base_pv) - sum(original_pv)), big.mark = ","), " 円"),
      valuation = "PV は評価日時点の現在価値（経過利子を含む。評価日より後のキャッシュフローの割引現在価値）。額面 1 億円ずつ、円",
      scope = "評価対象はサンプルの固定利付債 5 銘柄に限る。IRRBB の ΔEVE（預金・貸出・行動オプションなどを含む銀行勘定全体）ではない"
    ),
    engine = paste("rmql", as.character(utils::packageVersion("rmql")))
  )
}
