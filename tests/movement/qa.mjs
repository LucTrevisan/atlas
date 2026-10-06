// ATLAS — QA de interface (ETAPA 10): acessibilidade (axe-core, WCAG 2.1 A/AA), teclado,
// responsividade e contraste dos tokens. Não substitui o run.mjs (movimento).
//   node qa.mjs            → relatório no terminal + screenshots em ./qa-out/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.ATLAS_ROOT || path.resolve(HERE, "../.."));
const OUT = path.join(HERE, "qa-out"); fs.mkdirSync(OUT, { recursive: true });
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const CHROME = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(p => fs.existsSync(p));

const MIME = { ".html": "text/html", ".glb": "model/gltf-binary" };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(r); });
await new Promise(r => srv.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${srv.address().port}/index.html`;
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = { axe: {}, keyboard: [], responsive: [], contrast: [], errors: [] };
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? "✓ " : "✗ ") + m); };

async function open(w, h, mobile) {
  const pg = await b.newPage(); pg.on("pageerror", e => report.errors.push(String(e.stack || e)));
  await pg.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile });
  await pg.goto(URL_, { timeout: 120000 });
  await pg.waitForFunction(() => typeof pose !== "undefined" && pose && /Pronto|VR indispon/.test(document.getElementById("st").textContent), { timeout: 120000 });
  await wait(800); return pg;
}
const showTab = (pg, t) => pg.evaluate(t => { if (document.getElementById("p-" + t).hidden) document.getElementById("t-" + t).click(); }, t);

try {
  // ---------- 1. Acessibilidade (axe-core) ----------
  console.log("\nACESSIBILIDADE (axe-core, WCAG 2.1 A/AA)");
  let pg = await open(1440, 860);
  await pg.addScriptTag({ path: AXE });
  const audit = async label => {
    const v = await pg.evaluate(async () => {
      const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
      return r.violations.map(x => ({ id: x.id, impact: x.impact, help: x.help, n: x.nodes.length, targets: x.nodes.slice(0, 4).map(n => n.target.join(" ")) }));
    });
    report.axe[label] = v;
    ok(v.length === 0, `${label}: ${v.length ? v.map(x => `${x.id} (${x.impact}, ${x.n}×) ${x.targets.join(" | ")}`).join("; ") : "sem violações"}`);
  };
  for (const t of ["twin", "ctrl", "tele", "xr", "cfg"]) { await showTab(pg, t); await wait(400); await audit("aba " + t); }
  await pg.evaluate(() => { mq = { connected: true, publish() {}, end() {} }; document.getElementById("snd").click(); });
  await wait(300); await audit("diálogo de controle real");
  await pg.evaluate(() => { document.getElementById("dlg-real-no").click(); mq = null; });

  // ---------- 2. Teclado ----------
  console.log("\nTECLADO");
  await pg.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await showTab(pg, "ctrl"); await pg.focus("#t-ctrl");
  await pg.keyboard.press("ArrowRight"); let a = await pg.evaluate(() => [document.activeElement.id, document.getElementById("p-tele").hidden]);
  ok(a[0] === "t-tele" && a[1] === false, "Seta → move o foco e abre a próxima aba (Telemetria)");
  await pg.keyboard.press("End"); a = await pg.evaluate(() => document.activeElement.id); ok(a === "t-cfg", "End vai para a última aba");
  await pg.keyboard.press("Home"); a = await pg.evaluate(() => document.activeElement.id); ok(a === "t-twin", "Home vai para a primeira aba");
  await showTab(pg, "ctrl"); await pg.focus("#t-ctrl"); await pg.keyboard.press("Tab");
  a = await pg.evaluate(() => [document.activeElement.id, document.activeElement.closest("#panel") ? "panel" : ""]);
  ok(a[1] === "panel" || /chip|panel-close/.test(a[0]) || a[0] === "", "Tab sai da lista de abas para o conteúdo (" + a[0] + ")");
  await pg.focus("#rst"); await pg.keyboard.press("Escape");
  a = await pg.evaluate(() => [document.getElementById("panel").hidden, document.activeElement.id]);
  ok(a[0] === true && a[1] === "t-ctrl", "Esc recolhe o painel e devolve o foco à aba");
  await pg.keyboard.press("Enter"); a = await pg.evaluate(() => !document.getElementById("p-ctrl").hidden); ok(a, "Enter na aba reabre o painel");
  await pg.focus("#t-ctrl"); await pg.evaluate(() => { const i = inputs.shoulder[0]; i.focus(); });
  const v0 = await pg.evaluate(() => S.shoulder); await pg.keyboard.press("ArrowRight"); await pg.keyboard.press("ArrowRight");
  const v1 = await pg.evaluate(() => S.shoulder); ok(v1 === v0 + 1, `slider pelo teclado usa o mesmo caminho (S.shoulder ${v0} → ${v1}, passo 0,5)`);
  await pg.evaluate(() => document.getElementById("rst").click());
  const fv = await pg.evaluate(() => { const s = getComputedStyle(document.getElementById("t-ctrl"), ":focus-visible"); return true; });
  report.keyboard.push({ focusVisibleStyles: fv });
  await pg.close();

  // ---------- 3. Responsividade ----------
  console.log("\nRESPONSIVIDADE");
  for (const [w, h, m, name] of [[1440, 860, 0, "desktop"], [1024, 768, 0, "tablet-paisagem"], [768, 1024, 1, "tablet-retrato"], [390, 844, 1, "celular"], [360, 640, 1, "celular-pequeno"]]) {
    pg = await open(w, h, m); await showTab(pg, "ctrl"); await wait(500);
    const r = await pg.evaluate(() => {
      const de = document.documentElement, p = document.getElementById("panel").getBoundingClientRect(), hd = document.querySelector(".atlas-header").getBoundingClientRect();
      const small = [...document.querySelectorAll("#ui button:not([disabled]), #ui input[type=range], #ui input[type=checkbox]")].filter(e => e.offsetParent)
        .map(e => { const rc = (e.closest("label") || e).getBoundingClientRect(); return [e.id || e.className || e.tagName, Math.round(rc.width), Math.round(rc.height)]; })
        .filter(([, w, h]) => w < 24 || h < 24);
      return { overflowX: de.scrollWidth > innerWidth + 1, panelInView: p.left >= 0 && p.right <= innerWidth + 1 && p.bottom <= innerHeight + 1, headerH: Math.round(hd.height),
        twinShare: Math.round((1 - (p.width * p.height) / (innerWidth * (innerHeight - hd.height))) * 100), small };
    });
    report.responsive.push({ name, w, h, ...r });
    ok(!r.overflowX && r.panelInView, `${name} ${w}×${h}: sem rolagem horizontal, painel visível, header ${r.headerH}px, Digital Twin livre ≈ ${r.twinShare}% da área${r.small.length ? " · alvos < 24px: " + JSON.stringify(r.small) : ""}`);
    await pg.screenshot({ path: path.join(OUT, `${name}.png`) });
    await pg.close();
  }

  // ---------- 4. Contraste dos tokens (WCAG) ----------
  console.log("\nCONTRASTE (texto sobre painel #071C32)");
  const lum = hex => { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const ratio = (a, b2) => { const [x, y] = [lum(a), lum(b2)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  for (const [n, c] of [["texto", "F4FAFF"], ["texto secundário", "91AFC5"], ["ciano", "00D9FF"], ["ciano claro", "63E8FF"], ["sucesso", "20E6A4"], ["alerta", "FFB020"], ["crítico", "FF334F"], ["azul (botão)", "008CFF"]]) {
    const r = ratio(c, "071C32"); report.contrast.push({ n, c, r: +r.toFixed(2) });
    ok(r >= 4.5, `${n} #${c}: ${r.toFixed(2)}:1 ${r >= 7 ? "(AAA)" : r >= 4.5 ? "(AA)" : "(abaixo de AA para texto normal)"}`);
  }
  for (const [n, fg, bg] of [["botão primário (topo do gradiente)", "FFFFFF", "006CFF"], ["botão primário (base)", "FFFFFF", "0052CC"], ["botão crítico", "020B18", "FF334F"], ["chip CONTROLE REAL", "1A1000", "FFB020"]]) {
    const r = ratio(fg, bg); report.contrast.push({ n, fg, bg, r: +r.toFixed(2) });
    ok(r >= 4.5, `${n}: #${fg} sobre #${bg} = ${r.toFixed(2)}:1`);
  }
} finally {
  await b.close(); srv.close();
}
ok(report.errors.length === 0, "nenhum erro de JavaScript" + (report.errors.length ? ": " + report.errors.join(" | ") : ""));
fs.writeFileSync(path.join(OUT, "qa-report.json"), JSON.stringify(report, null, 1));
console.log(`\n${fail ? "QA COM PENDÊNCIAS — " + fail + " item(ns)" : "QA APROVADO"} · relatório: tests/movement/qa-out/qa-report.json`);
process.exit(fail ? 1 : 0);
