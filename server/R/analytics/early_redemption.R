# 早期償還：コール条項つき債券（Hull-White 1因子）と MBS（パススルー、PSA・借換えインセンティブ）。Carmine Studio の
# /api/callable（early-redemption）から、RiemannFinMath で計算できる部分を移した。計算はすべて RiemannFinMath。
# （静的 OAS の表と、Hull-White の金利経路での MBS の評価は、RiemannFinMath の compute_mbs_oas・generate_hull_white_monthly_rates・
#  compute_mbs_path_values で計算するので移した。経路は RiemannFinMath の乱数（seed 48）で、原稿の set.seed(48) の経路とは数値が違う。
#  コール判断の境界は RiemannFinMath が行使判断を返さないので、まだ移していない）
#
# POST /api/analytics/early-redemption
#   {"bond":{"ratePct":2,"aPct":15,"sigmaPct":1.2,"couponPct":3,"firstCallYear":1,"callPrice":100},
#    "mbs":{"psaPct":100,"incentive":20,"refiCostPct":0.5}}
# 債券：額面100、5年、半年ごとのクーポン、フラットな連続複利の初期カーブ。コールはクーポン支払後に元本をコール価格で償還。
# MBS ：元本100、モーゲージ金利 5%、パススルー金利 4.5%、360か月。

ER_DEFAULTS_QL <- list(
  bond = list(ratePct = 2, aPct = 15, sigmaPct = 1.2, couponPct = 3, firstCallYear = 1, callPrice = 100),
  mbs = list(psaPct = 100, incentive = 20, refiCostPct = 0.5, oasPrice = 110)
)
ER_MBS_QL <- list(balance = 100, mortgage_rate = 0.05, pass_through_rate = 0.045, months = 360L)
ER_CACHE_QL <- new.env(parent = emptyenv())

er_memo_QL <- function(name, inputs, f) {
  key <- paste(name, paste(format(unlist(inputs), digits = 17), collapse = "|"))
  if (is.null(ER_CACHE_QL[[key]])) assign(key, f(), envir = ER_CACHE_QL)
  ER_CACHE_QL[[key]]
}

er_read_QL <- function(body, section, ranges) {
  given <- body[[section]]
  if (!is.null(given) && !is.list(given)) an_bad_QL(sprintf("%s はオブジェクトにする", section))
  extra <- setdiff(names(given), names(ER_DEFAULTS_QL[[section]]))
  if (length(extra)) an_bad_QL(paste0("知らない項目: ", section, ".", extra[1]))
  p <- utils::modifyList(ER_DEFAULTS_QL[[section]], if (is.null(given)) list() else given)
  for (k in names(ranges)) {
    x <- p[[k]]; lim <- ranges[[k]]
    if (!(is.numeric(x) && length(x) == 1L && is.finite(x) && x >= lim[1] && x <= lim[2])) {
      an_bad_QL(sprintf("%s.%s は %s 以上 %s 以下の数値にする", section, k, lim[1], lim[2]))
    }
  }
  p
}

er_flows_QL <- function(p) {
  time <- seq(0.5, 5, by = 0.5)
  data.frame(time = time, coupon = 100 * p$couponPct / 100 * 0.5, principal = ifelse(time == 5, 100, 0),
             call_price = ifelse(time >= p$firstCallYear & time < 5, p$callPrice, NA_real_))
}
er_value_QL <- function(flows, a, sigma, curve) {
  as.list(RiemannFinMath::compute_hull_white_callable_bond_value(flows$time, flows$coupon, flows$principal, flows$call_price,
                                                                 a, sigma, curve, points = 321L, limit = 0.13, nodes = 24L))
}

er_bond_QL <- function(p) er_memo_QL("bond", p, function() {
  r <- p$ratePct / 100; a <- p$aPct / 100; sigma <- p$sigmaPct / 100
  curve <- RiemannFinMath::create_flat_curve("2026-11-02", r, "actual_365_fixed", "continuous")
  flows <- er_flows_QL(p)
  v <- er_value_QL(flows, a, sigma, curve)
  vol_grid <- seq(0, 0.025, by = 0.0025)
  by_vol <- do.call(rbind, lapply(vol_grid, function(s) {
    x <- er_value_QL(flows, a, s, curve)
    data.frame(volatility = s, callable = x$callable, bullet = x$bullet, issuer_call_value = x$issuer_call_value)
  }))
  list(flows = flows, bullet = v$bullet, callable = v$callable, issuer_call_value = v$issuer_call_value, by_volatility = by_vol)
})

# プールの条件だけをキャッシュの鍵にする（OAS を解く価格を変えても、キャッシュフローや経路は作り直さない）
er_pool_key_QL <- function(p) p[c("psaPct", "incentive", "refiCostPct")]

er_mbs_QL <- function(p) er_memo_QL("mbs", er_pool_key_QL(p), function() {
  m <- ER_MBS_QL
  pool <- RiemannFinMath::create_mbs_pass_through(m$balance, m$mortgage_rate, m$pass_through_rate, maturity_months = m$months,
                                                  psa_multiplier = p$psaPct / 100, incentive_sensitivity = p$incentive,
                                                  refinancing_cost_rate = p$refiCostPct / 100, cpr_cap = 0.6, amortization = "fixed_payment")
  names3 <- c("借換え金利低下", "金利一定", "借換え金利上昇")
  paths <- list(c(rep(0.05, 24), rep(0.035, m$months - 24)), rep(0.05, m$months), c(rep(0.05, 24), rep(0.065, m$months - 24)))
  cfs <- lapply(paths, function(f) RiemannFinMath::compute_mbs_cashflows(pool, f))
  scen <- do.call(rbind, lapply(seq_along(paths), function(i) {
    f <- paths[[i]]
    fixed <- RiemannFinMath::compute_mbs_path_values(pool, matrix(0.04, 1, m$months), matrix(f, 1))
    path <- RiemannFinMath::compute_mbs_path_values(pool, matrix(f - 0.01, 1), matrix(f, 1))
    data.frame(scenario = names3[i], weighted_average_life = fixed$weighted_average_life, price_fixed_discount = fixed$price,
               price_path_discount = path$price, total_principal = sum(cfs[[i]]$scheduled_principal + cfs[[i]]$prepaid_principal))
  }))
  flat <- as.data.frame(cfs[[2]])
  list(
    pool = list(balance = m$balance, mortgage_rate = m$mortgage_rate, pass_through_rate = m$pass_through_rate, months = m$months),
    scenarios = scen,
    cpr = data.frame(month = seq_len(m$months), falling = cfs[[1]]$cpr, flat = flat$cpr, rising = cfs[[3]]$cpr),
    flat_cashflows = flat[, c("month", "interest", "scheduled_principal", "prepaid_principal", "end_balance")]
  )
})

# 静的 OAS（Carmine の callable_model.R の cb_static と同じ）：PSA 0・50・100%、借換え金利 5% でインセンティブなし、
# ゼロ金利 4% にスプレッドを加えて架空の価格 95・105 に合わせたスプレッド。あわせて、スプレッドごとの価格
er_static_QL <- function() er_memo_QL("static", list(), function() {
  m <- ER_MBS_QL
  grid <- expand.grid(assumed_price = c(95, 105), psa_percent = c(0, 50, 100))[, c("psa_percent", "assumed_price")]
  pool_at <- function(psa) RiemannFinMath::create_mbs_pass_through(m$balance, m$mortgage_rate, m$pass_through_rate, maturity_months = m$months,
                                                                   psa_multiplier = psa / 100, incentive_sensitivity = 0)
  r4 <- matrix(0.04, 1, m$months); f5 <- matrix(0.05, 1, m$months)
  grid$oas_bp <- mapply(function(psa, price) 1e4 * RiemannFinMath::compute_mbs_oas(pool_at(psa), price, r4, f5), grid$psa_percent, grid$assumed_price)
  spreads <- seq(-200, 300, by = 10)
  price_curve <- do.call(rbind, lapply(c(0, 50, 100), function(psa) {
    pool <- pool_at(psa)
    data.frame(psa_percent = psa, spread_bp = spreads,
               price = vapply(spreads, function(s) RiemannFinMath::compute_mbs_path_values(pool, r4 + s / 1e4, f5)$price, 0))
  }))
  list(table = grid, price_curve = price_curve)
})

# Hull-White（初期カーブ 2%、a = 0.15、sigma = 0.012）の月次の短期金利の経路で MBS を評価する。割引率は短期金利 + 3%（下限 0）、借換え金利は短期金利
# 20 本は画面に描く経路。2000 本は平均価格とその標準誤差。乱数は RiemannFinMath のもの（seed 48）
er_paths_QL <- function(p) er_memo_QL("paths", er_pool_key_QL(p), function() {
  m <- ER_MBS_QL
  pool <- RiemannFinMath::create_mbs_pass_through(m$balance, m$mortgage_rate, m$pass_through_rate, maturity_months = m$months,
                                                  psa_multiplier = p$psaPct / 100, incentive_sensitivity = p$incentive,
                                                  refinancing_cost_rate = p$refiCostPct / 100, cpr_cap = 0.6, amortization = "fixed_payment")
  value <- function(n) {
    rates <- RiemannFinMath::generate_hull_white_monthly_rates(n, m$months, 0.02, 0.15, 0.012, seed = 48L)
    list(rates = rates, v = RiemannFinMath::compute_mbs_path_values(pool, rates, pmax(rates + 0.03, 0)))
  }
  s <- value(20L)
  big <- value(2000L)$v
  list(
    seed = 48L, count = nrow(s$rates), rates = lapply(seq_len(nrow(s$rates)), function(i) s$rates[i, ]),
    price = s$v$price, weighted_average_life = s$v$weighted_average_life,
    mean_price = mean(s$v$price), mean_wal = mean(s$v$weighted_average_life),
    mc = list(count = 2000L, seed = 48L, mean_price = mean(big$price), standard_error = stats::sd(big$price) / sqrt(nrow(big)), mean_wal = mean(big$weighted_average_life))
  )
})

# ダイナミック OAS：Hull-White の経路（20本・500本）の平均価格が、市場価格に一致するスプレッド（短期金利に加える）。RiemannFinMath の compute_mbs_oas
# 静的 OAS は、金利 4% 一定・借換え金利 5% 一定の 1 本の経路で解いたもの。価格ごとの OAS の表は 20 本の経路で作る
er_oas_QL <- function(p) er_memo_QL("oas", p, function() {
  m <- ER_MBS_QL
  pool <- RiemannFinMath::create_mbs_pass_through(m$balance, m$mortgage_rate, m$pass_through_rate, maturity_months = m$months,
                                                  psa_multiplier = p$psaPct / 100, incentive_sensitivity = p$incentive,
                                                  refinancing_cost_rate = p$refiCostPct / 100, cpr_cap = 0.6, amortization = "fixed_payment")
  # 20 本は画面に描く経路と同じ（20 本として作ったもの）。500 本は別に作る
  rates20 <- RiemannFinMath::generate_hull_white_monthly_rates(20L, m$months, 0.02, 0.15, 0.012, seed = 48L)
  rates500 <- RiemannFinMath::generate_hull_white_monthly_rates(500L, m$months, 0.02, 0.15, 0.012, seed = 48L)
  oas <- function(price, r = rates500) 1e4 * RiemannFinMath::compute_mbs_oas(pool, price, r, pmax(r + 0.03, 0))
  flat <- function(price) 1e4 * RiemannFinMath::compute_mbs_oas(pool, price, matrix(0.04, 1, m$months), matrix(0.05, 1, m$months))
  grid <- seq(95, 125, by = 5)
  list(price = p$oasPrice, dynamic_20_bp = oas(p$oasPrice, rates20), dynamic_500_bp = oas(p$oasPrice), static_bp = flat(p$oasPrice),
       by_price = data.frame(price = grid, dynamic_bp = vapply(grid, oas, 0, r = rates20), static_bp = vapply(grid, flat, 0)))
})

compute_early_redemption_QL <- function(body = list()) {
  an_unknown_QL(body, c("bond", "mbs"))
  b <- er_read_QL(body, "bond", list(ratePct = c(-2, 10), aPct = c(1, 100), sigmaPct = c(0, 3), couponPct = c(0, 10), firstCallYear = c(0.5, 4.5), callPrice = c(90, 120)))
  m <- er_read_QL(body, "mbs", list(psaPct = c(0, 500), incentive = c(0, 50), refiCostPct = c(0, 3), oasPrice = c(50, 150)))
  if (abs(b$firstCallYear * 2 - round(b$firstCallYear * 2)) > 1e-9) an_bad_QL("最初のコール日は利払日（0.5 年刻み）にする")
  list(
    inputs = list(bond = b, mbs = m),
    conventions = list(
      bond = "額面100、5年、半年ごとのクーポン。コールはクーポン支払後に元本をコール価格で償還。フラットな連続複利の初期カーブ、Hull-White 1因子（状態の格子 321 点、Gauss-Hermite 24 点）",
      mbs = "パススルー（元本100、モーゲージ金利 5%、パススルー金利 4.5%、360か月、元の毎月返済額を維持）。CPR = min(0.6, PSA × min(0.002m, 0.06) × exp(β(c − f − k)))",
      engine = an_engine_QL()),
    bond = er_bond_QL(b), mbs = c(er_mbs_QL(m), list(paths = er_paths_QL(m), static = er_static_QL(), oas = er_oas_QL(m)))
  )
}
