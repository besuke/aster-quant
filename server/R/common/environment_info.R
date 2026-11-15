# 実行環境の記録（Excel の「実行環境」「計算エンジン」シート）。
# Curie は GaussQuant のインストール済み版とソース版の照合を記録していた。QuantLet の計算は RiemannFinMath なので、
# その版と、A1 が呼ぶ RiemannFinMath の関数を記録する。

.a1_engine_functions_QL <- c(
  "create_ois_instruments", "bootstrap_ois_curve", "get_quote_repricing", "create_fixed_rate_bond",
  "compute_settlement_date", "compute_ois_asset_swap", "compute_yen_asset_swap",
  "compute_remaining_years", "compute_compound_yield_from_price"
)

environment_info_QL <- function() {
  pkgs <- c("dplyr", "purrr", "tibble", "tidyr", "stringr", "readr", "readxl", "writexl", "collapse", "RiemannFinMath")
  installed <- purrr::map(pkgs, function(p) {
    tibble::tibble(item = p, value = as.character(utils::packageVersion(p)),
                   note = paste0("built: ", dplyr::coalesce(utils::packageDescription(p)$Built, "")))
  }) |> purrr::list_rbind()
  dplyr::bind_rows(
    tibble::tibble(item = c("QuantLet", "R"), value = c(curie_version_line_Curie(), R.version.string), note = ""),
    installed
  )
}

engine_functions_QL <- function(functions = .a1_engine_functions_QL) {
  ns <- asNamespace("RiemannFinMath")
  tibble::tibble(
    function_name = functions,
    available = purrr::map_lgl(functions, \(f) exists(f, ns, inherits = FALSE)),
    arguments = purrr::map_chr(functions, \(f) if (exists(f, ns, inherits = FALSE)) paste(names(formals(get(f, ns))), collapse = ", ") else ""),
    engine = paste("RiemannFinMath", as.character(utils::packageVersion("RiemannFinMath")))
  )
}
