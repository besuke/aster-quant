import { useRef, useState } from "react";
import { api, type UploadResult } from "./api";

// ファイルを選ぶ（またはドロップする）と、すぐサーバーへ送って保存する（server/data/uploads/<kind>/）。
export default function Upload(props: {
  kind: "a1" | "c1" | "reports";
  accept: string;
  label: string;
  hint: string;
  uploaded: UploadResult | null;
  onUploaded: (u: UploadResult | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const send = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      props.onUploaded(await api.upload(props.kind, file));
    } catch (e) {
      setError((e as Error).message);
      props.onUploaded(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div
      className={`dropzone ${over ? "over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void send(e.dataTransfer.files[0]);
      }}
    >
      <div className="dropzone-label">{props.label}</div>
      <div className="muted small">{props.hint}</div>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "送信中…" : "ファイルを選ぶ"}
        </button>
        <input ref={input} type="file" accept={props.accept} hidden onChange={(e) => void send(e.target.files?.[0])} />
        {props.uploaded && (
          <span className="small">
            <b>{props.uploaded.fileName}</b>（{(props.uploaded.bytes / 1024).toFixed(1)} KB）→ <code>server/{props.uploaded.savedTo}</code>
            <button className="link" onClick={() => props.onUploaded(null)}>
              取り消す
            </button>
          </span>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
