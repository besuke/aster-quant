Curie デモ市場データ（すべて架空。実際の市場価格ではない）
市場日: 2026-10-06（quote_time は取得時刻、日本時間）
形式: パイプ区切り（|）、UTF-8、1行目が列名
OIS  : 通貨ごとに別ファイル。rate_pct はパーセント。instrument_type = spot_ois
JGB  : 時価ファイル。clean_price は額面100当たりのクリーン単価（受渡日 settlement_date = T+2）と、
       利回り計算に必要な属性（coupon_rate、coupon_frequency、maturity_date、redemption）。利回りは入力しない
       受渡日の違う単価（例：T+1）は、オファー受渡日（T+2）の比較には使わない
FX   : fx_spot は base_currency 1単位当たりの円。spot_date は受渡日
CCS  : basis_bp は bp。円レッグに加算（外貨OISフラット支払／円TONAR + basis 受取）
       notional_type = constant は元本固定型。mtm_reset は元本リセット型（現行モデルの対象外）
       同じ通貨ペア・市場日・契約条件・償還日の気配は算術平均して使う
