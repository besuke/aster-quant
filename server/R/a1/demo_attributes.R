# 銘柄属性の取得関数（Curie scripts/demo_data/demo_data_master.R の make_demo_attribute_fetcher_Curie と同じ）。
# 本番では Aladdin API から取得する関数に差し替える（Curie と同じく未実装）。RDS から、指定 ISIN・評価日と同じ属性日の行を返す。
make_file_attribute_fetcher_QL <- function(path) {
  force(path)
  function(isin, valuation_date) {
    readRDS(path) |>
      dplyr::filter(.data$ISIN %in% isin, .data$attribute_date == as.Date(valuation_date))
  }
}
