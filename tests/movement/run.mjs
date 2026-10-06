// ATLAS — teste anti-regressão de movimentação (golden snapshot).
// Carrega o index.html ORIGINAL (sem modificações) num Chrome headless e compara
// matrizes de mundo das articulações, payloads MQTT, Demo, IK e hand tracking
// com tests/movement/baseline.json. Stubs (MQTT falso, mãos falsas, relógio fixo)
// existem apenas no navegador de teste; o app não é alterado.
//
//   npm install           (uma vez, dentro de tests/movement)
//   npm run record        grava baseline.json (somente na ETAPA 0 ou com autorização)
//   npm test              compara com baseline.json; exit 1 se qualquer valor mudar
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.ATLAS_ROOT || path.resolve(HERE, "../.."));
const GOLDEN = path.join(HERE, "baseline.json");
const RECORD = process.argv.includes("--record");
const TOL = 1e-6;

const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(p => fs.existsSync(p));

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    const idx = path.join(p, "index.html");
    if (fs.existsSync(idx)) { res.writeHead(200, { "content-type": MIME[".html"] }); return fs.createReadStream(idx).pipe(res); }
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1280,800"],
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", e => pageErrors.push(String(e)));

let result;
try {
  await page.goto(URL_, { waitUntil: "load" });
  await page.waitForFunction(() => typeof pose !== "undefined" && pose !== null, { timeout: 90000 });
  // espera a etapa WebXR terminar (sucesso ou falha) para não competir com ela
  await page.waitForFunction(() => /Pronto|VR indispon/.test(document.getElementById("st").textContent), { timeout: 60000 });

  result = await page.evaluate(async () => {
    const r6 = v => Math.round(v * 1e7) / 1e7;
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const NODES = ["stage", "j_waist", "j_shoulder", "j_elbow", "j_roll", "j_pitch",
      "j_gearA", "j_linkA", "j_fingA", "j_gearB", "j_linkB", "j_fingB"];
    const PARTS = ["Waist:1", "Arm 01:1", "Arm 02 v3:1", "Arm 03:1", "Gripper base:1",
      "gear2:1", "grip link 1:2", "Gripper 1:1", "gear1:1", "grip link 1:1", "Gripper 1 (1):1"];
    const node = n => sceneRef.getTransformNodeByName(n);
    const snap = () => {
      const m = {};
      [...NODES, ...PARTS].forEach(n => { m[n] = Array.from(node(n).getWorldMatrix().asArray(), r6); });
      return { S: { ...S }, world: m };
    };
    const sliderOf = k => inputs[k][0];
    const setSlider = (k, v) => { const i = sliderOf(k); i.value = v; i.dispatchEvent(new Event("input")); };
    const out = { static: {}, poses: {}, ui: {}, demo: {}, mqtt: {}, ik: {}, hands: {} };

    // ---------- Estrutura estática (após um frame: pose(S) já aplicada) ----------
    await frame();
    out.static.J = J;
    out.env = { status: $("st").textContent, secure: window.isSecureContext, xr: !!navigator.xr };
    out.static.K = K;
    out.static.CFG = CFG;
    out.static.hierarchy = Object.fromEntries([...NODES, ...PARTS].map(n => [n, node(n).parent ? node(n).parent.name : null]));
    out.static.localTransforms = Object.fromEntries(NODES.map(n => {
      const t = node(n);
      return [n, { position: t.position.asArray().map(r6), scaling: t.scaling.asArray().map(r6),
        rotationQuaternion: t.rotationQuaternion ? t.rotationQuaternion.asArray().map(r6) : null }];
    }));
    const cam = sceneRef.activeCamera;
    out.static.camera = { name: cam.name, alpha: r6(cam.alpha), beta: r6(cam.beta), radius: r6(cam.radius),
      target: cam.target.asArray().map(r6), lowerRadiusLimit: cam.lowerRadiusLimit, upperRadiusLimit: cam.upperRadiusLimit,
      wheelPrecision: cam.wheelPrecision, minZ: cam.minZ, cameraCount: sceneRef.cameras.length };
    out.static.sliders = Object.fromEntries(J.map(([k]) => { const i = sliderOf(k); return [k, { min: i.min, max: i.max, step: i.step, value: i.value }]; }));

    // ---------- Pose zero (inicial) ----------
    out.poses.zero = snap();

    // ---------- Cada junta nos limites, via slider (UI → S → pose) ----------
    for (const [k, , mn, mx] of J) {
      for (const [tag, v] of [["min", mn], ["mid", (mn + mx) / 4], ["max", mx]]) {
        setSlider(k, v); await frame();
        out.poses[`${k}_${tag}`] = snap();
        out.poses[`${k}_${tag}`].label = inputs[k][1].textContent;
      }
      $("rst").click(); await frame();
    }

    // ---------- Pose combinada + clamp acima do limite ----------
    Object.assign(S, { waist: 33.5, shoulder: -21, elbow: 47.5, pitch: -12, grip: 18 }); await frame();
    out.poses.combined = snap();
    Object.assign(S, { waist: 999, shoulder: 999, elbow: -999, pitch: 999, grip: -5 }); await frame();
    out.poses.overLimit = snap();

    // ---------- Reset ----------
    $("rst").click(); await frame();
    out.ui.afterReset = { S: { ...S }, labels: J.map(([k]) => inputs[k][1].textContent), demoBtn: $("demo").textContent };
    out.ui.resetEqualsZero = JSON.stringify(snap().world) === JSON.stringify(out.poses.zero.world);

    // ---------- Demo (relógio congelado) ----------
    const realNow = performance.now.bind(performance);
    let fixed = null; performance.now = () => (fixed === null ? realNow() : fixed);
    fixed = 100000; $("demo").click();
    out.demo.btnWhileRunning = $("demo").textContent;
    for (const T of [0, 0.5, 1.7, 3.3, 7.1, 12.9]) {
      fixed = 100000 + T * 1000; await frame();
      out.demo["t=" + T] = snap();
    }
    setSlider("waist", 10); await frame();           // slider interrompe o Demo
    out.demo.sliderStopsDemo = { demo, btn: $("demo").textContent, S: { ...S } };
    fixed = null; performance.now = realNow;
    $("rst").click(); await frame();

    // ---------- MQTT (cliente falso; protocolo real do app) ----------
    const log = { connect: null, subscribe: [], publish: [] };
    const handlers = {};
    const realMqtt = window.mqtt;
    window.mqtt = { connect: (url, opts) => {
      log.connect = { url, opts: { ...opts, clientId: opts.clientId.replace(/[0-9a-f]+$/, "<rand>") } };
      return { connected: true, on: (ev, f) => (handlers[ev] = f), subscribe: t => log.subscribe.push(t),
        publish: (t, p, o) => log.publish.push({ t, p, o }), end: () => {} };
    } };
    $("url").value = "wss://test.invalid:8884/mqtt"; $("usr").value = "u"; $("pwd").value = "p"; $("pfx").value = "braco";
    $("con").click(); handlers.connect();
    out.mqtt.connect = log.connect; out.mqtt.subscribe = log.subscribe; out.mqtt.statusText = $("mq").textContent;
    await new Promise(r => setTimeout(r, 300));
    out.mqtt.publishWhileSndOff = log.publish.length;
    Object.assign(S, { waist: 12.34, shoulder: -8.06, elbow: 40.05, pitch: -5.55, grip: 18.26 });
    $("snd").checked = true; $("snd").dispatchEvent(new Event("change"));
    log.publish.length = 0;
    await new Promise(r => setTimeout(r, 1000));
    out.mqtt.publishRatePerSecApprox = Math.round(log.publish.length / 5) * 5;   // ~20 Hz
    out.mqtt.lastPublish = log.publish.at(-1);
    // Espelhamento: marca mir → desmarca snd; mensagem do robô sobrescreve S
    $("mir").checked = true; $("mir").dispatchEvent(new Event("change"));
    out.mqtt.sndAfterMir = $("snd").checked;
    handlers.message("braco/estado", { toString: () => '{"waist":10,"shoulder":-20,"elbow":35.5,"pitch":7,"grip":12}' }); await frame();
    out.mqtt.mirror = { mode, S: { ...S }, labels: J.map(([k]) => inputs[k][1].textContent), world: snap().world };
    handlers.message("braco/estado", { toString: () => '{"shoulder":150,"grip":99}' }); await frame();
    out.mqtt.mirrorPartialAndClamp = { mode, S: { ...S } };
    $("mir").checked = false; $("mir").dispatchEvent(new Event("change"));
    out.mqtt.modeAfterMirOff = mode;
    handlers.message("braco/estado", { toString: () => '{"waist":-60}' }); await frame();
    out.mqtt.ignoredWhenMirOff = { ...S };
    $("snd").checked = false; $("snd").dispatchEvent(new Event("change"));
    window.mqtt = realMqtt; mq = null;
    $("rst").click(); await frame();

    // ---------- IK pura (solveArm) ----------
    const ikIn = [[0.15, 0.05, 30, 0], [0.2, -0.05, -45, 20], [0.1, 0.12, 120, -30], [0.24, 0, 0, 0], [0.05, -0.1, 179, 60]];
    out.ik = ikIn.map(a => ({ in: a, out: Object.fromEntries(Object.entries(solveArm(...a, K)).map(([k, v]) => [k, r6(v)])) }));

    // ---------- Hand tracking (mãos falsas; mapping real do app) ----------
    const V = (x, y, z) => new BABYLON.Vector3(x, y, z);
    const mkHand = pts => ({ getJointMesh: j => (pts[j] ? { getAbsolutePosition: () => pts[j].clone() } : null) });
    const HJ = BABYLON.WebXRHandJoint;
    const fakeCam = { position: V(0, 1.6, 0), getDirection: () => V(1, 0, 0) };
    const right = { [HJ.WRIST]: V(0.25, 1.3, -0.35), [HJ.INDEX_FINGER_TIP]: V(0.27, 1.33, -0.52), [HJ.THUMB_TIP]: V(0.3, 1.3, -0.48) };
    const leftPinch = d => ({ [HJ.THUMB_TIP]: V(-0.2, 1.3, -0.3), [HJ.INDEX_FINGER_TIP]: V(-0.2 + d, 1.3, -0.3) });
    const savedHF = handFeat;
    const runHands = (leftD, steps) => {
      handFeat = { getHandByHandedness: h => mkHand(h === "right" ? right : leftPinch(leftD)) };
      Object.assign(S, { waist: 0, shoulder: 0, elbow: 0, pitch: 0, grip: 0 });
      for (let i = 0; i < steps; i++) handsStep(sceneRef, fakeCam, 1 / 60);
      const res = { follow, S: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, r6(v)])) };
      handFeat = savedHF;
      return res;
    };
    out.hands.pinchOn_1step = runHands(0.02, 1);
    out.hands.pinchOn_converged = runHands(0.02, 600);
    out.hands.pinchJustBelowThreshold = runHands(0.0299, 1);
    out.hands.pinchOff = runHands(0.05, 10);
    Object.assign(S, { waist: 0, shoulder: 0, elbow: 0, pitch: 0, grip: 0 }); syncUI(); await frame();
    return out;
  });
} finally {
  await browser.close();
  server.close();
}

if (pageErrors.length) console.warn("⚠ Erros na página:", pageErrors);

if (RECORD) {
  fs.writeFileSync(GOLDEN, JSON.stringify(result, null, 1));
  console.log("✔ baseline gravado em", path.relative(ROOT, GOLDEN));
  process.exit(0);
}

// ---------- Comparação ----------
const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
const diffs = [];
const cmp = (a, b, p) => {
  if (typeof a === "number" && typeof b === "number") { if (Math.abs(a - b) > TOL) diffs.push(`${p}: ${a} → ${b}`); return; }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) cmp(a[k], b[k], p ? `${p}.${k}` : k);
    return;
  }
  if (a !== b) diffs.push(`${p}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
};
delete golden.env; const env = result.env; delete result.env;
cmp(golden, result, "");
console.log("Ambiente:", JSON.stringify(env));

const groups = [
  ["J1 (waist)", /waist/], ["J2 (shoulder)", /shoulder/], ["J3 (elbow)", /elbow/], ["J4 (pitch)", /pitch/],
  ["Garra", /grip|gear|link|fing|Gripper/], ["Zero/Reset", /^poses\.zero|^ui\./], ["Demo", /^demo\./],
  ["Sliders", /^static\.sliders|_min|_mid|_max/], ["MQTT/Espelhamento", /^mqtt\./], ["IK", /^ik\./],
  ["Hand Tracking", /^hands\./], ["Estrutura (K/CFG/J/hierarquia/câmera)", /^static\./],
];
console.log("\nMOVEMENT REGRESSION TEST\n");
for (const [name, re] of groups) console.log(`${diffs.some(d => re.test(d)) ? "✗" : "✓"} ${name}`);
if (diffs.length) {
  console.log(`\nREPROVADO — ${diffs.length} diferença(s):`);
  diffs.slice(0, 60).forEach(d => console.log("  " + d));
  process.exit(1);
}
console.log("\nAPROVADO — idêntico ao baseline.");
