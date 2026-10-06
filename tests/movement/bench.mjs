import http from "node:http"; import fs from "node:fs"; import path from "node:path";
// Benchmark: taxa EFETIVA de publish MQTT (10 s, cliente falso) — o loop de 20 Hz divide a thread com o render.
//   node bench.mjs <pasta1> [<pasta2> ...]    (padrão: raiz do projeto)
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const roots = process.argv.length > 2 ? process.argv.slice(2) : [path.resolve(HERE, "../..")];
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const ROOT of roots) {
  const srv = http.createServer((q, r) => { const p = path.join(ROOT, new URL(q.url, "http://x").pathname); if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": p.endsWith(".html") ? "text/html" : "application/octet-stream" }); fs.createReadStream(p).pipe(r); });
  await new Promise(r => srv.listen(0, r));
  const pg = await b.newPage(); await pg.setViewport({ width: 1280, height: 800 });
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { timeout: 120000 });
  await pg.waitForFunction(() => typeof pose !== "undefined" && pose && /Pronto|VR indispon/.test(document.getElementById("st").textContent), { timeout: 120000 });
  await new Promise(r => setTimeout(r, 2000));
  const n = await pg.evaluate(async () => {
    let c = 0; mq = { connected: true, publish() { c++; }, end() {}, on() {} };
    $("snd").checked = true; $("snd").dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 10000)); $("snd").checked = false; mq = null; return c;
  });
  console.log(path.basename(ROOT), (n / 10).toFixed(1), "pub/s");
  await pg.close(); srv.close();
}
await b.close();
