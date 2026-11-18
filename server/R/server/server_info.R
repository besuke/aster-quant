# Infrago Quant Server の接続確認ページの API（GET /api/server）。Carmine Studio の接続ページにならう。
# サーバーが何で、どこで待ち受け、利用者にどの URL を案内するか、どれだけ動いているか、どの経路に答えるか、
# RiemannFinMath の小さな計算にかかる時間（ネットワークの往復と分けて見るため）を返す。
#
# 案内用の URL：配備先のホスト名（DNS で解決できる名前）または LAN の IP アドレス。環境変数 QUANTLET_PUBLIC_HOST
# （scripts/InfragoQuant.ps1 が配備設定 config/deploy.local.env から渡す）を使い、なければ LAN の IPv4 を探す。127.0.0.1 はこの PC の中だけで使う。

SERVER_STARTED_QL <- Sys.time()
SERVER_REQUESTS_QL <- new.env()
SERVER_REQUESTS_QL$count <- 0L

SERVER_ROUTES_QL <- tibble::tribble(
  ~method, ~path,                                   ~page,
  "GET",  "/api/health",                            "接続の確認（右上の表示）",
  "GET",  "/api/server",                            "Infrago Quant Server（このページ）",
  "GET",  "/api/reports",                           "レポート分析（掲示板・一覧）",
  "POST", "/api/uploads/reports",                   "レポート分析（登録）",
  "POST", "/api/reports/register",                  "レポート分析（登録）",
  "GET",  "/api/reports/<id>",                      "レポート分析（一覧の詳細）",
  "POST", "/api/reports/<id>/links",                "レポート分析（オファーとの紐づけ）",
  "GET",  "/api/reports/<id>/feedback",             "レポート分析（掲示板の反応とコメント）",
  "POST", "/api/reports/<id>/reactions",            "レポート分析（いいね・ダメ）",
  "POST", "/api/reports/<id>/comments",             "レポート分析（コメント・返信）",
  "GET",  "/api/yields/monthly",                    "日米の国債金利・OIS（国債）",
  "POST", "/api/yields/refresh",                    "日米の国債金利・OIS（国債の取得）",
  "GET",  "/api/ois/datasets",                      "日米の国債金利・OIS（評価用 OIS）",
  "GET",  "/api/ois/curves",                        "日米の国債金利・OIS（評価用 OIS）",
  "POST", "/api/uploads/a1",                        "オファーシート作成",
  "POST", "/api/a1/run",                            "オファーシート作成",
  "GET",  "/api/a1/latest",                         "オファーシート作成",
  "GET",  "/api/market/ois/status",                 "オファーシート作成（OIS の基準日）",
  "POST", "/api/market/ois/refresh",                "オファーシート作成（Bloomberg 更新）",
  "POST", "/api/uploads/c1",                        "TRS契約書連携",
  "POST", "/api/c1/run",                            "TRS契約書連携",
  "POST", "/api/c1/cases/<id>/cashflows",           "TRS契約書連携（キャッシュフロー）",
  "GET",  "/api/irrbb",                             "IRRBB金利シナリオ"
)

# 案内用のホスト：設定があればそれ、なければ LAN の IPv4（127.*・169.254.* を除く最初のもの）
public_host_QL <- function() {
  h <- trimws(Sys.getenv("QUANTLET_PUBLIC_HOST", ""))
  # scripts/InfragoQuant.ps1 は、設定（config/deploy.local.env）か自動検出かを QUANTLET_PUBLIC_HOST_SOURCE で一緒に渡す
  if (nzchar(h)) return(list(host = h, source = Sys.getenv("QUANTLET_PUBLIC_HOST_SOURCE", "環境変数 QUANTLET_PUBLIC_HOST")))
  ips <- tryCatch(suppressWarnings(system2("powershell.exe", c("-NoProfile", "-Command",
    shQuote("Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress")),
    stdout = TRUE, stderr = FALSE)), error = function(e) character())
  ips <- trimws(ips[nzchar(trimws(ips))])
  if (length(ips)) list(host = ips[1], source = "LAN の IP アドレス（自動検出）") else list(host = NA_character_, source = "見つからない")
}

server_probe_QL <- function(repeats = 20L) {
  returns <- matrix(sin(seq_len(240)) / 50, 60, 4, dimnames = list(NULL, c("a", "b", "c", "d")))
  t0 <- as.numeric(Sys.time())
  runs <- purrr::map(seq_len(repeats), \(k) RiemannFinMath::compute_return_moments(returns))
  list(calculation = "RiemannFinMath::compute_return_moments（60期間 × 4資産）", repeats = repeats,
       seconds_each = (as.numeric(Sys.time()) - t0) / repeats, check_value = unname(purrr::pluck(runs, repeats, "mean", "a")))
}

server_info_QL <- function(host, port, static_dir) {
  now <- Sys.time()
  pub <- public_host_QL()
  lan <- identical(host, "0.0.0.0")
  list(
    name = "Infrago Quant Server", status = "ok", app_version = curie_version_line_Curie(),
    engine = list(name = "RiemannFinMath", version = as.character(utils::packageVersion("RiemannFinMath")),
                  library = dirname(system.file(package = "RiemannFinMath"))),
    runtime = list(r_version = paste(R.version$major, R.version$minor, sep = "."), platform = R.version$platform,
                   pid = Sys.getpid(), logical_processors = parallel::detectCores(logical = TRUE)),
    listen = list(host = host, port = port, lan = lan, serves_page = !is.na(static_dir)),
    urls = list(
      public_host = pub$host, public_host_source = pub$source,
      # LAN で待ち受けて画面も配るときだけ、他の端末から開ける（配備）。そうでなければこの PC の中だけ
      share = if (lan && !is.na(pub$host)) paste0("http://", pub$host, ":", port, "/") else NA_character_,
      local = paste0("http://127.0.0.1:", port, "/"),
      note = if (lan) "利用者には share の URL を案内する（ホスト名は config/deploy.local.env で設定）。他の端末から開けないときは、Windows ファイアウォールで受信を許可する" else
        "この R API は 127.0.0.1 だけで待ち受けている（開発用）。社内の端末に配るときは scripts/InfragoQuant.ps1 の 2（社内LANで起動）を使う"),
    started_at = format(SERVER_STARTED_QL, "%Y-%m-%dT%H:%M:%S%z"),
    server_time = format(now, "%Y-%m-%dT%H:%M:%S%z"),
    uptime_seconds = as.numeric(difftime(now, SERVER_STARTED_QL, units = "secs")),
    requests_served = SERVER_REQUESTS_QL$count,
    probe = server_probe_QL(),
    routes = SERVER_ROUTES_QL
  )
}
