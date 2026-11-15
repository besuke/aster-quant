// Stop with a reason if the browser port is taken; never move to another port.
//   node scripts/check-port.mjs [port=8091] [host=127.0.0.1]
import net from "node:net";

const port = Number(process.argv[2] ?? 8091);
const host = process.argv[3] ?? "127.0.0.1";
const server = net.createServer();
server.once("error", (e) => {
  console.error(`ポート ${port}（${host}）は使用中のため起動しません（${e.code}）。別のポートには切り替えません。`);
  console.error(`使っているプロセスを止めてから、もう一度実行してください。確認：netstat -ano | findstr :${port}`);
  process.exit(1);
});
server.listen(port, host, () => server.close(() => process.exit(0)));
