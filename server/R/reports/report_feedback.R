# レポート分析掲示板：レポートごとの反応（いいね／ダメ）とコメント・返信。
# 保存先はレポートの案件フォルダー（data/cases/reports/<reportId>/feedback.json）。再読み込み後も同じものを表示する。
#   reactions：閲覧者（ブラウザーごとの client_id）ごとに1つ（like／dislike）。押し直すと取り消し、反対を押すと切り替え
#   comments ：id、parent_id（返信なら親の id）、表示名、本文、日時。削除・編集はまだない
# 認証はないので、表示名は利用者が画面で入れたもの（既定は「利用者」）。

.feedback_path_RP <- function(report_id, root_dir = reports_dir_RP()) file.path(root_dir, report_id, "feedback.json")

read_feedback_RP <- function(report_id, root_dir = reports_dir_RP()) {
  p <- .feedback_path_RP(report_id, root_dir)
  x <- if (file.exists(p)) jsonlite::fromJSON(p, simplifyVector = FALSE) else list()
  list(reactions = x$reactions %||% list(), comments = x$comments %||% list())
}

# 書き込みは一時ファイルに書いてから置き換える（途中で止まっても壊れたファイルを残さない）
.write_feedback_RP <- function(report_id, fb, root_dir = reports_dir_RP()) {
  p <- .feedback_path_RP(report_id, root_dir)
  tmp <- paste0(p, ".tmp")
  jsonlite::write_json(fb, tmp, auto_unbox = TRUE, pretty = TRUE, null = "null")
  file.rename(tmp, p)
}

# 画面に返す形：件数、自分の反応、コメントの木（返信は親の下）
feedback_view_RP <- function(report_id, client_id = "", root_dir = reports_dir_RP()) {
  fb <- read_feedback_RP(report_id, root_dir)
  kinds <- purrr::map_chr(fb$reactions, "reaction")
  mine <- purrr::detect(fb$reactions, \(r) identical(r$client_id, client_id))
  comments <- purrr::map(fb$comments, \(c) c[c("id", "parent_id", "author", "text", "created_at")])
  list(report_id = report_id, likes = sum(kinds == "like"), dislikes = sum(kinds == "dislike"),
       my_reaction = mine$reaction %||% NULL, comments = comments, comment_count = length(comments))
}

.valid_client_RP <- function(x) is.character(x) && length(x) == 1L && grepl("^[A-Za-z0-9_-]{8,64}$", x)

set_reaction_RP <- function(report_id, client_id, reaction, root_dir = reports_dir_RP()) {
  if (!.valid_client_RP(client_id)) stop("client_id が不正である", call. = FALSE)
  if (!is.null(reaction) && !reaction %in% c("like", "dislike")) stop("反応は like か dislike", call. = FALSE)
  fb <- read_feedback_RP(report_id, root_dir)
  fb$reactions <- purrr::discard(fb$reactions, \(r) identical(r$client_id, client_id))
  if (!is.null(reaction)) fb$reactions <- c(fb$reactions, list(list(client_id = client_id, reaction = reaction, at = .now_RP())))
  .write_feedback_RP(report_id, fb, root_dir)
  feedback_view_RP(report_id, client_id, root_dir)
}

add_comment_RP <- function(report_id, text, author = NULL, parent_id = NULL, client_id = "", root_dir = reports_dir_RP()) {
  text <- trimws(enc2utf8(as.character(text %||% "")))
  if (!nzchar(text)) stop("コメントが空である", call. = FALSE)
  if (nchar(text) > 2000) stop("コメントは 2000 文字まで", call. = FALSE)
  author <- trimws(enc2utf8(as.character(author %||% "")))
  if (!nzchar(author)) author <- "利用者"
  if (nchar(author) > 40) stop("表示名は 40 文字まで", call. = FALSE)
  fb <- read_feedback_RP(report_id, root_dir)
  ids <- purrr::map_chr(fb$comments, "id")
  if (!is.null(parent_id) && !parent_id %in% ids) stop("返信先のコメントがない: ", parent_id, call. = FALSE)
  id <- paste0("c", format(Sys.time(), "%Y%m%d%H%M%S"), sprintf("%03d", length(ids) + 1L))
  fb$comments <- c(fb$comments, list(list(id = id, parent_id = parent_id, author = author, text = text, created_at = .now_RP(),
                                          client_id = if (.valid_client_RP(client_id)) client_id else NULL)))
  .write_feedback_RP(report_id, fb, root_dir)
  feedback_view_RP(report_id, client_id, root_dir)
}
