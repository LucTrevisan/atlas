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
page.on("pageerror", e => pageErrors.push(String(e.stack || e)));

let result, uxChecks = [];
try {
  // registra os intervalos agendados pelo app (medição determinística da taxa MQTT)
  await page.evaluateOnNewDocument(() => {
    const si = window.setInterval; window.__intervals = [];
    window.setInterval = function (fn, ms, ...r) { window.__intervals.push({ src: String(fn), ms }); return si.call(this, fn, ms, ...r); };
  });
  await page.goto(URL_, { waitUntil: "load", timeout: 120000 });
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
    // como no mqtt.js real, vários listeners por evento; handlers.X(...) emite para todos
    const lst = {}; const handlers = new Proxy({}, { get: (_, ev) => (...a) => (lst[ev] || []).forEach(f => f(...a)) });
    const realMqtt = window.mqtt;
    window.mqtt = { connect: (url, opts) => {
      log.connect = { url, opts: { ...opts, clientId: opts.clientId.replace(/[0-9a-f]+$/, "<rand>") } };
      return { connected: true, on: (ev, f) => (lst[ev] ||= []).push(f), subscribe: t => log.subscribe.push(t),
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
    // taxa = 1000 / intervalo agendado pelo loop de publish (independe da carga da máquina)
    const pubIv = window.__intervals.filter(x => /publish\(/.test(x.src) && /\/cmd/.test(x.src));
    out.mqtt.publishRatePerSecApprox = pubIv.length === 1 ? Math.round(1000 / pubIv[0].ms) : `intervalos de publish: ${pubIv.length}`;
    out.mqtt_info = { publishesIn1s: log.publish.length };
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
  // ---------- UX (ETAPA 3+): confirmação do controle real com cliques reais ----------
  uxChecks = await (async () => {
    const out = [];
    const ok = (cond, msg) => out.push((cond ? "✓ " : "✗ ") + msg);
    const st = () => page.evaluate(() => ({ snd: $("snd").checked, mir: $("mir").checked, dlg: !!document.getElementById("dlg-real")?.open }));
    if (!(await page.$("#dlg-real"))) return ["(diálogo de confirmação ausente — verificação ignorada)"];
    await page.evaluate(() => { document.getElementById("t-cfg").click(); if (document.getElementById("p-cfg").hidden) document.getElementById("t-cfg").click(); });
    await page.evaluate(() => { $("mir").checked = true; $("mir").dispatchEvent(new Event("change")); });
    await page.click("#snd"); let s = await st();
    ok(s.dlg && !s.snd && s.mir, "clique em Enviar comandos abre confirmação e não marca a caixa");
    await page.click("#dlg-real-no"); s = await st();
    ok(!s.dlg && !s.snd && s.mir, "Cancelar mantém envio desligado");
    await page.keyboard.press("Space"); s = await st();   // foco volta à caixa
    ok(s.dlg && !s.snd, "teclado (Espaço) também pede confirmação");
    await page.keyboard.press("Escape"); s = await st();
    ok(!s.dlg && !s.snd, "Esc cancela");
    await page.click("#snd"); await page.click("#dlg-real-yes"); s = await st();
    ok(!s.dlg && s.snd && !s.mir, "Confirmar marca a caixa e executa o onchange original (desmarca espelho)");
    await page.click("#snd"); s = await st();
    ok(!s.dlg && !s.snd, "desmarcar não pede confirmação");
    // trilho dos sliders acompanha o Demo (loop rAF sob demanda)
    const fill = () => page.evaluate(() => inputs.waist[0].style.getPropertyValue("--b") + "|" + inputs.waist[1].textContent);
    await page.evaluate(() => { document.getElementById("t-ctrl").click(); if (document.getElementById("p-ctrl").hidden) document.getElementById("t-ctrl").click(); $("demo").click(); });
    // aguarda mudança (robusto a frames lentos no Chrome headless com GPU por software)
    await new Promise(r => setTimeout(r, 800)); const f1 = await fill(); let f2 = f1;
    for (let t = 0; t < 60 && f2 === f1; t++) { await new Promise(r => setTimeout(r, 250)); f2 = await fill(); }
    await page.evaluate(() => { $("demo").click(); $("rst").click(); });
    ok(f1 !== f2, "trilho e valor do slider acompanham o Demo");
    // ETAPA 4: seleção / destaque (não destrutivo)
    if (await page.$("#hotspots")) {
      await page.waitForFunction(() => sceneRef.effectLayers && sceneRef.effectLayers.some(l => l.name === "atlas-hl"), { timeout: 30000 }).catch(() => {});
      const r4 = await page.evaluate(async () => {
        const hl = sceneRef.effectLayers.find(l => l.name === "atlas-hl");
        const meshesOf = n => sceneRef.getTransformNodeByName(n).getChildMeshes(false).filter(m => m.getTotalVertices() > 0);
        const arm = meshesOf("Arm 01:1"), all = sceneRef.meshes.filter(m => m.getTotalVertices() > 0);
        const mats = all.map(m => m.material && m.material.uniqueId);
        const hs = [...document.querySelectorAll("#hotspots .hs")].find(b => b.textContent === "J2");
        hs.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const res = {
          ctrlOpen: !document.getElementById("p-ctrl").hidden,
          rowSel: inputs.shoulder[0].parentElement.classList.contains("is-sel"),
          focused: document.activeElement === inputs.shoulder[0],
          hlArm: !!hl && arm.every(m => hl.hasMesh(m)),
          hlOnlyArm: !!hl && all.filter(m => hl.hasMesh(m)).length === arm.length,
          card: document.getElementById("sel-title").textContent,
        };
        inputs.shoulder[0].value = 70; inputs.shoulder[0].dispatchEvent(new Event("input"));
        res.limit = document.getElementById("sel-state").textContent;
        inputs.elbow[0].focus(); await new Promise(r => setTimeout(r, 50));
        res.focusSelects = document.querySelector('#hotspots .hs[aria-pressed="true"]')?.textContent;
        res.hlElbow = !!hl && meshesOf("Arm 02 v3:1").every(m => hl.hasMesh(m)) && !arm.some(m => hl.hasMesh(m));
        document.getElementById("sel-close").click();
        res.cleared = !!hl && all.every(m => !hl.hasMesh(m)) && document.getElementById("sel-card").hidden;
        res.matsSame = JSON.stringify(mats) === JSON.stringify(all.map(m => m.material && m.material.uniqueId));
        $("rst").click();
        return res;
      });
      ok(r4.ctrlOpen && r4.rowSel && r4.focused, "marcador J2 abre Controle, marca e foca o slider existente");
      ok(r4.hlArm && r4.hlOnlyArm, "destaque contém exatamente as peças do ombro");
      ok(r4.card.includes("J2") && r4.limit === "NO LIMITE", "cartão mostra J2 e estado NO LIMITE em +70°");
      ok(r4.focusSelects === "J3" && r4.hlElbow, "focar o slider do cotovelo seleciona J3 no modelo");
      ok(r4.cleared, "limpar seleção remove o destaque");
      ok(r4.matsSame, "materiais das malhas inalterados");
      const g = await page.evaluate(() => {
        [...document.querySelectorAll("#hotspots .hs")].find(b => b.textContent === "GARRA").click();
        const hl = sceneRef.effectLayers.find(l => l.name === "atlas-hl");
        const n = sceneRef.meshes.filter(m => hl.hasMesh(m)).length;
        document.getElementById("sel-close").click(); $("rst").click(); return n;
      });
      ok(g >= 5, "garra destacada (peça instanciada via malha-fonte, sem erro)");
    }
    // ETAPA 5: escuta somente leitura de <pfx>/estado
    if (await page.$("#tele-rows")) {
      const r5 = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const lst = {}, real = window.mqtt;
        window.mqtt = { connect: () => ({ connected: true, on: (ev, f) => (lst[ev] ||= []).push(f), subscribe() {}, publish() {}, end() {} }) };
        const emit = (ev, ...a) => (lst[ev] || []).forEach(f => f(...a));
        $("url").value = "wss://test.invalid:8884/mqtt"; $("con").click(); emit("connect");
        if (document.getElementById("p-tele").hidden) document.getElementById("t-tele").click();
        await wait(400);
        const before = JSON.stringify(S);
        for (let i = 0; i < 5; i++) { emit("message", "braco/estado", { toString: () => '{"waist":12.5,"shoulder":-8,"elbow":40,"pitch":-5,"grip":18}' }); await wait(100); }
        await wait(300);
        const res = { chip: document.querySelector("#chip-esp .v").textContent, fb: [...document.querySelectorAll("#tele-rows .fb")].map(td => td.textContent),
          sUnchanged: JSON.stringify(S) === before, listeners: (lst.message || []).length, conn: document.getElementById("conn-t").textContent };
        await wait(1800);
        res.stale = document.querySelector("#chip-esp .v").textContent;
        window.mqtt = real; mq = null;
        return res;
      });
      ok(r5.chip === "● online" && r5.fb[0] === "12.5°" && r5.fb[4] === "18.0°", "ESP32 online e feedback por junta a partir de /estado");
      ok(r5.sUnchanged, "com espelho desligado, /estado não altera S (handler original preservado)");
      ok(r5.listeners === 2, "listener adicional não substitui o handler original (2 listeners)");
      ok(r5.stale === "◐ sem dados", "sem pacotes por >1,5 s → ESP32 sem dados");
      ok(r5.conn.startsWith("Conectado"), "status de conexão em Configurações");
    }
    // ETAPA 7: WebXR — diagnóstico e painel do headset
    if (await page.$("#xr-box")) {
      const r7 = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        if (document.getElementById("p-xr").hidden) document.getElementById("t-xr").click();
        await wait(600);
        const res = { verdict: document.getElementById("xr-t").textContent, why: document.getElementById("xr-why").textContent,
          chip: document.querySelector("#chip-xr .v").textContent, sess: document.getElementById("xr-sess").textContent,
          enterDisabled: document.getElementById("xr-enter").disabled };
        const bx = document.getElementById("xr-preview"); bx.checked = true; bx.dispatchEvent(new Event("change"));
        await wait(500);
        const pm = sceneRef.getMeshByName("atlas-xr-panel");
        res.preview = ATLAS_UI.xrPanel(); res.pickable = pm && pm.isPickable; res.parent = pm && pm.parent && pm.parent.name;
        bx.checked = false; bx.dispatchEvent(new Event("change")); await wait(300);
        res.after = ATLAS_UI.xrPanel().enabled;
        return res;
      });
      ok(/VR|WebXR|HTTPS/.test(r7.verdict) && r7.why.length > 10 && r7.sess !== "verificando", "WebXR: veredito e motivo claros (" + r7.verdict + ")");
      ok(r7.enterDisabled === (r7.verdict !== "Pronto para VR"), "botão Entrar em VR só habilitado quando pronto");
      ok(r7.preview.enabled && r7.preview.content && r7.preview.content.joints.length === 5, "painel do headset: pré-visualização com 5 articulações");
      ok(r7.pickable === false && !r7.parent, "painel do headset não é pickable e não tem parent no rig");
      ok(r7.after === false, "painel some ao desligar a pré-visualização");
    }
    // ETAPA 8: feedback de hand tracking (sessão XR simulada; mapping executado pelo handsStep ORIGINAL)
    if (await page.evaluate(() => !!(window.ATLAS_UI && ATLAS_UI.hands))) {
      const r8 = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const V = (x, y, z) => new BABYLON.Vector3(x, y, z), HJ = BABYLON.WebXRHandJoint;
        const mk = pts => ({ getJointMesh: j => (pts[j] ? { getAbsolutePosition: () => pts[j].clone() } : null) });
        const right = { [HJ.WRIST]: V(0.25, 1.3, -0.35), [HJ.INDEX_FINGER_TIP]: V(0.27, 1.33, -0.52), [HJ.THUMB_TIP]: V(0.3, 1.3, -0.48) };
        const left = d => ({ [HJ.THUMB_TIP]: V(-0.2, 1.3, -0.3), [HJ.INDEX_FINGER_TIP]: V(-0.2 + d, 1.3, -0.3) });
        const saved = { hf: handFeat, cam: xrCamRef }; let Lp = null, Rp = null;
        handFeat = { getHandByHandedness: h => (h === "left" ? (Lp && mk(Lp)) : (Rp && mk(Rp))) };
        xrCamRef = { position: V(0, 1.6, 0), getDirection: () => V(1, 0, 0) };
        $("rst").click(); inXR = true; await wait(400);
        const st = () => ATLAS_UI.hands().state, pc = () => ATLAS_UI.xrPanel().content.hands, res = {};
        // espera por condição (o estado é amostrado a 100 ms e `follow` muda no frame seguinte)
        const until = async (fn, ms = 3000) => { const t = performance.now(); while (!fn() && performance.now() - t < ms) await wait(50); return fn(); };
        const frames = n => new Promise(r => { let k = 0; const o = sceneRef.onAfterRenderObservable.add(() => { if (++k >= n) { sceneRef.onAfterRenderObservable.remove(o); r(); } }); });
        await until(() => ATLAS_UI.xrPanel().enabled && pc() && st() === "searching");
        res.searching = st(); res.panelOn = ATLAS_UI.xrPanel().enabled;
        Lp = left(0.06); Rp = right; await until(() => st() === "detected" && pc().state === "detected");
        res.detected = st(); res.bar = pc().bar; res.instrDetected = pc().instr;
        Lp = left(0.02); Rp = null; await until(() => st() === "armed" && pc().state === "armed"); res.armed = st(); res.armedSub = pc().sub;
        Rp = right; const s0 = JSON.stringify(S); await until(() => st() === "active"); await frames(3); res.active = st(); res.moved = JSON.stringify(S) !== s0;
        await until(() => ATLAS_UI.hands().learned, 6000); await until(() => pc().instr === null); res.learned = ATLAS_UI.hands().learned; res.instrAfter = pc().instr;
        Lp = left(0.05); await until(() => st() === "detected"); res.release = st(); await frames(2);
        const s1 = JSON.stringify(S); await frames(5); res.stopped = JSON.stringify(S) === s1;
        inXR = false; handFeat = saved.hf; xrCamRef = saved.cam; await wait(300); res.panelOff = !ATLAS_UI.xrPanel().enabled;
        $("rst").click(); return res;
      });
      ok(r8.searching === "searching" && r8.panelOn, "em VR sem mãos: ○ PROCURANDO MÃOS e painel do headset ativo");
      ok(r8.detected === "detected" && r8.bar > 0 && r8.bar < 1 && /mão esquerda/.test(r8.instrDetected), "mãos sem pinça: MÃOS DETECTADAS + medidor de pinça + instrução da mão esquerda");
      ok(r8.armed === "armed" && /pinça esquerda/.test(r8.armedSub), "pinça esquerda sem mão direita: CONTROLE ARMADO");
      ok(r8.active === "active" && r8.moved, "pinça + mão direita: MOVIMENTO ATIVO (braço movido pelo handsStep original)");
      ok(r8.learned && r8.instrAfter === null, "após 3 s de uso as instruções somem");
      ok(r8.release === "detected" && r8.stopped, "soltar a pinça: movimento para (comportamento original)");
      ok(r8.panelOff, "ao sair de VR o painel do headset é desativado");
    }
    // ETAPA 9: performance só em elementos não cinemáticos
    if (await page.evaluate(() => !!(window.ATLAS_UI && ATLAS_UI.perf))) {
      await page.evaluate(() => { const p = document.getElementById("panel"); if (!p.hidden) document.getElementById("panel-close").click(); document.getElementById("sel-close").click();
        const h = document.getElementById("hs-toggle"); h.checked = false; h.dispatchEvent(new Event("change")); }); // clique direto na peça, sem marcador por cima
      const pre = await page.evaluate(() => {
        const sc = sceneRef, stage = sc.getTransformNodeByName("stage");
        const robot = [stage, ...stage.getDescendants(false)];
        window.__picks = 0; const orig = sc.pick.bind(sc); sc.__origPick = orig; sc.pick = (...a) => { window.__picks++; return orig(...a); };
        // ponto de tela do centro do braço 1 (ombro) para um clique real
        const m = sc.getTransformNodeByName("Arm 01:1").getChildMeshes(false).find(x => x.getTotalVertices() > 0);
        const c = m.getBoundingInfo().boundingSphere.centerWorld, eng = sc.getEngine(), cam = sc.activeCamera;
        const pp = BABYLON.Vector3.Project(c, BABYLON.Matrix.IdentityReadOnly, sc.getTransformMatrix(), cam.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
        const r = eng.getRenderingCanvas().getBoundingClientRect();
        return { robotFrozen: robot.filter(n => n.isWorldMatrixFrozen).map(n => n.name), report: ATLAS_UI.perf(),
          x: r.left + pp.x / eng.getRenderWidth() * r.width, y: r.top + pp.y / eng.getRenderHeight() * r.height };
      });
      for (let i = 0; i < 25; i++) await page.mouse.move(300 + i * 30, 300 + (i % 5) * 20);
      await new Promise(r => setTimeout(r, 300));
      const movePicks = await page.evaluate(() => window.__picks);
      await page.mouse.click(pre.x, pre.y);
      await page.waitForFunction(() => document.getElementById("sel-title").textContent.length > 0, { timeout: 8000 }).catch(() => {});
      const r9 = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const sel = document.getElementById("sel-title").textContent, picks = window.__picks;
        sceneRef.pick = sceneRef.__origPick; document.getElementById("sel-close").click();
        const fm = sceneRef.getMeshByName("floor").material, before = fm.diffuseColor.toHexString();
        const t = document.getElementById("th-scene"); t.checked = false; t.dispatchEvent(new Event("change")); await wait(100);
        const off = fm.diffuseColor.toHexString(); t.checked = true; t.dispatchEvent(new Event("change")); await wait(100);
        for (let k = 0; k < 80 && !fm.isFrozen; k++) await wait(100); // congela 2 frames depois (frames lentos no headless)
        const h = document.getElementById("hs-toggle"); h.checked = true; h.dispatchEvent(new Event("change"));
        return { sel, picks, before, off, after: fm.diffuseColor.toHexString(), frozenMat: fm.isFrozen };
      });
      ok(movePicks === 0, "mover o mouse não dispara picking (" + movePicks + " picks)");
      ok(/ombro/i.test(r9.sel), "clique real na peça do ombro ainda seleciona J2 (pick no toque)");
      ok(pre.robotFrozen.length === 0 && pre.report.frozen > 20 && pre.report.skipped.length === 0, "só o ambiente é congelado (" + pre.report.frozen + " malhas); nenhum nó do robô");
      // pixel REAL do piso na tela (captura do canvas dentro do frame renderizado)
      const px = await page.evaluate(async () => {
        const sc = sceneRef, eng = sc.getEngine(), cam = sc.activeCamera, cv = eng.getRenderingCanvas();
        const sample = () => new Promise(res => { let k = 0; const o = sc.onAfterRenderObservable.add(() => { if (++k < 3) return; sc.onAfterRenderObservable.remove(o);
          const w = eng.getRenderWidth(), h = eng.getRenderHeight(), floor = sc.getMeshByName("floor");
          // ponto de tela que comprovadamente atinge o piso (pick com predicado; o piso não é "pickable")
          let p = null; for (const [fx, fy] of [[.85, .8], [.9, .9], [.75, .85], [.6, .92], [.15, .9]]) if (sc.pick(w * fx, h * fy, m => m === floor).hit) { p = { x: w * fx, y: h * fy }; break; }
          if (!p) return res(null);
          // lê o framebuffer dentro do frame (antes de apresentar); origem do WebGL é embaixo
          eng.readPixels(Math.round(p.x), h - Math.round(p.y), 1, 1).then(d => res([d[0], d[1], d[2]])); }); });
        const t = document.getElementById("th-scene"), atlas = await sample();
        t.checked = false; t.dispatchEvent(new Event("change")); const lab = await sample();
        t.checked = true; t.dispatchEvent(new Event("change")); const back = await sample();
        return { atlas, lab, back };
      });
      const avg = c => (c[0] + c[1] + c[2]) / 3;
      const navy = c => !!c && c[2] > c[0] + 30 && avg(c) < 110, light = c => !!c && avg(c) > 80 && c[2] - c[0] < 40; // laboratório: cinza claro
      ok(r9.before !== r9.off && r9.after === r9.before && r9.frozenMat, "troca de tema funciona com materiais congelados");
      ok(navy(px.atlas) && light(px.lab) && navy(px.back), "pixel renderizado do piso: tema ATLAS " + px.atlas + " · laboratório " + px.lab + " · ATLAS de novo " + px.back);
    }
    return out;
  })();
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
delete golden.env; const env = result.env; delete result.env; delete golden.mqtt_info; const mqInfo = result.mqtt_info; delete result.mqtt_info;
// ETAPA 3 (autorizado): o número exibido ao lado do slider passou a acompanhar o arraste.
// É só exibição; o baseline original registrava o rótulo travado. Em vez de comparar,
// verifica-se que o rótulo agora corresponde ao valor do slider.
const labelIssues = [];
for (const [name, pose] of Object.entries(result.poses)) {
  if (!("label" in pose)) continue;
  const k = name.replace(/_(min|mid|max)$/, "");
  const want = Math.round(pose.S[k]) + "°";
  if (pose.label !== want) labelIssues.push(`poses.${name}.label: esperado ${want}, obtido ${pose.label}`);
  delete pose.label; if (golden.poses[name]) delete golden.poses[name].label;
}
diffs.push(...labelIssues);
cmp(golden, result, "");
console.log("Ambiente:", JSON.stringify(env), "| publishes medidos em 1 s:", mqInfo && mqInfo.publishesIn1s);

const groups = [
  ["J1 (waist)", /waist/], ["J2 (shoulder)", /shoulder/], ["J3 (elbow)", /elbow/], ["J4 (pitch)", /pitch/],
  ["Garra", /grip|gear|link|fing|Gripper/], ["Zero/Reset", /^poses\.zero|^ui\./], ["Demo", /^demo\./],
  ["Sliders", /^static\.sliders|_min|_mid|_max/], ["MQTT/Espelhamento", /^mqtt\./], ["IK", /^ik\./],
  ["Hand Tracking", /^hands\./], ["Estrutura (K/CFG/J/hierarquia/câmera)", /^static\./],
];
if (uxChecks.length) {
  console.log("\nUX CHECKS");
  uxChecks.forEach(l => console.log(l));
  if (uxChecks.some(l => l.startsWith("✗"))) diffs.push("ux: verificação de UX falhou");
}
if (pageErrors.length) diffs.push(`página: ${pageErrors.length} erro(s) de JavaScript`);
console.log("\nMOVEMENT REGRESSION TEST\n");
for (const [name, re] of groups) console.log(`${diffs.some(d => re.test(d)) ? "✗" : "✓"} ${name}`);
if (diffs.length) {
  console.log(`\nREPROVADO — ${diffs.length} diferença(s):`);
  diffs.slice(0, 60).forEach(d => console.log("  " + d));
  process.exit(1);
}
console.log("\nAPROVADO — idêntico ao baseline.");
