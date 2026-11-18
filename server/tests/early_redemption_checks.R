# 早期償還（MBS の OAS と経路）の検算（rmql と QuantLet の集計）。
#   Rscript tests/early_redemption_checks.R     （どのフォルダーからでもよい。ui/ からは npm run test:early-redemption）
# この R スクリプトの場所から server/（VERSION があるフォルダー）を決め、そこを作業ディレクトリにする。
local({
  f <- sub("^--file=", "", grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE))
  d <- if (length(f)) dirname(normalizePath(f[1L], winslash = "/")) else normalizePath(getwd(), winslash = "/")
  while (!file.exists(file.path(d, "VERSION")) && dirname(d) != d) d <- dirname(d)
  setwd(d)
})
source("R/load_quantlet.R", encoding = "UTF-8"); load_quantlet(getwd())
results <- list()
check <- function(name, ok, detail = "") {
  results[[length(results) + 1L]] <<- data.frame(check = name, result = if (isTRUE(ok)) "PASS" else "FAIL", detail = detail)
}

d <- compute_early_redemption_QL(list())
m <- d$mbs
pool <- rmql::create_mbs_pass_through(100, 0.05, 0.045, maturity_months = 360L, psa_multiplier = 1, incentive_sensitivity = 20,
                                                refinancing_cost_rate = 0.005, cpr_cap = 0.6, amortization = "fixed_payment")

# 1. 静的 OAS：Carmine Studio が GaussQuant（原稿の uniroot）に照合した値と、0.5 bp 以内（原因は uniroot の精度。rmql docs/spec_mbs.md）
ref <- c(92.68562256278896, 9.033250123953447, 113.39435844300418, -10.5489098569278, 130.1085394819889, -26.010199593171425)
diff <- abs(m$static$table$oas_bp - ref)
check("静的 OAS 6 点が Carmine の照合済みの値と 0.5 bp 以内", all(diff < 0.5), sprintf("最大差 %.3f bp", max(diff)))
check("静的 OAS の表は PSA 0・50・100% と価格 95・105 の 6 行", nrow(m$static$table) == 6L && setequal(m$static$table$psa_percent, c(0, 50, 100)))

# 2. ダイナミック OAS：そのスプレッドを短期金利に加えると、経路の平均価格が市場価格に一致する
rates <- rmql::generate_hull_white_monthly_rates(20L, 360L, 0.02, 0.15, 0.012, seed = 48L)
refi <- pmax(rates + 0.03, 0)
back <- mean(rmql::compute_mbs_path_values(pool, rates + m$oas$dynamic_20_bp / 1e4, refi)$price)
check("ダイナミック OAS（20本）を加えた経路の平均価格が市場価格（110）に一致", abs(back - m$oas$price) < 1e-6, sprintf("平均 %.9f", back))
flat_back <- rmql::compute_mbs_path_values(pool, matrix(0.04 + m$oas$static_bp / 1e4, 1, 360), matrix(0.05, 1, 360))$price
check("静的 OAS を加えた 1 本の経路の価格が市場価格（110）に一致", abs(flat_back - m$oas$price) < 1e-6, sprintf("価格 %.9f", flat_back))
check("ダイナミック OAS は市場価格が高いほど小さい（95〜125、単調に減少）", all(diff(m$oas$by_price$dynamic_bp) < 0))
check("静的 OAS は市場価格が高いほど小さい（95〜125、単調に減少）", all(diff(m$oas$by_price$static_bp) < 0))
check("表の 110 の行が、単独の計算と一致（ダイナミック 20 本・静的）",
      abs(m$oas$by_price$dynamic_bp[m$oas$by_price$price == 110] - m$oas$dynamic_20_bp) < 1e-9 &&
        abs(m$oas$by_price$static_bp[m$oas$by_price$price == 110] - m$oas$static_bp) < 1e-9)

# 3. 経路
check("経路は 20 本 × 360 か月、価格・WAL も 20 本分", m$paths$count == 20L && length(m$paths$rates) == 20L && all(lengths(m$paths$rates) == 360L) &&
        length(m$paths$price) == 20L && length(m$paths$weighted_average_life) == 20L)
check("20 本の平均価格 = 価格の平均", abs(m$paths$mean_price - mean(m$paths$price)) < 1e-12)
check("20 本の平均価格は 2000 本の平均価格から 3 以内（20 本の平均の標準誤差は約 1.7）",
      m$paths$mc$count == 2000L && abs(m$paths$mean_price - m$paths$mc$mean_price) < 3, sprintf("20本 %.3f、2000本 %.3f（標準誤差 %.3f）", m$paths$mean_price, m$paths$mc$mean_price, m$paths$mc$standard_error))
check("同じ入力なら同じ結果（seed 48）", identical(compute_early_redemption_QL(list())$mbs$paths$price, m$paths$price))

# 4. 入力の検査
bad <- tryCatch(compute_early_redemption_QL(list(mbs = list(oasPrice = 500))), error = function(e) conditionMessage(e))
check("OAS を解く価格が範囲外なら 400（50〜150）", is.character(bad) && grepl("oasPrice", bad), as.character(bad)[1])

out <- do.call(rbind, results)
print(out, right = FALSE)
dir.create("tests/results", showWarnings = FALSE)
write.csv(out, "tests/results/early_redemption_checks.csv", row.names = FALSE, fileEncoding = "UTF-8")
cat(sprintf("run_at: %s  rmql %s  PASS %d / %d\n", format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"), packageVersion("rmql"),
            sum(out$result == "PASS"), nrow(out)))
if (any(out$result != "PASS")) quit(status = 1)
