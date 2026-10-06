# ATLAS — MOVEMENT BASELINE (referência anti-regressão)

> Estado documentado: commit `117bc18` — *baseline: ATLAS before UX refactor*.
> Arquivo de lógica: `index.html` (sha256 `a0dd8575…df50`). Firmware: `esp32_braco.ino` (sha256 `35f331ba…5f23`).
> Golden snapshot numérico: [`tests/movement/baseline.json`](tests/movement/baseline.json) — gerado executando o `index.html` original.
>
> **Regra:** nada descrito neste documento pode mudar durante a refatoração de UX. Se `npm test` (em `tests/movement`) acusar diferença, a etapa está **REPROVADA**.

---

## 0. Cadeia completa de movimentação

```text
INTERFACE  (slider #sl input  |  ▶ Demo  |  Reset  |  mão direita/esquerda em VR  |  MQTT <pfx>/estado)
    ↓  escreve no objeto de estado global  S = {waist, shoulder, elbow, pitch, grip}   (graus, relativos à pose do modelo)
COMANDO    tick(dt) — chamado a cada frame por engine.runRenderLoop
    ↓  1) se demo: S ← fórmulas senoidais     2) senão, se inXR: handsStep() → solveArm() → S (suavizado)
    ↓  3) clampS() — limita S aos limites da tabela J
ARTICULAÇÃO  pose(S)  (closure retornada por buildRig)
    ↓
TRANSFORMAÇÃO  rotationQuaternion = Quaternion.RotationAxis(eixo, graus·D2R) em TransformNodes j_*
    ↓  (garra: mecanismo de 4 barras resolvido em 2D por solve2/applySide)
DIGITAL TWIN   peças do GLB re-parentadas (setParent) aos TransformNodes j_*  →  scene.render()
    ↓
MQTT (quando "Enviar comandos ao robô real" marcado)   setInterval 50 ms (20 Hz)
    ↓  publish  <pfx>/cmd   {"waist":…, "shoulder":…, "elbow":…, "pitch":…, "grip":…}  (arredondado a 0,1°)  QoS 0
ESP32 (esp32_braco.ino)   onMsg → target = constrain(OFFSET + SIGN·ângulo, SMIN, SMAX)
    ↓  loop: rampa 120 °/s, watchdog 800 ms, PCA9685 50 Hz, 500–2500 µs
ROBÔ FÍSICO   5 servos (canais 0–4)
    ↓  publish  <pfx>/estado  a 10 Hz:  SIGN·(cur − OFFSET)  arredondado a 0,1°
ESPELHAMENTO (quando "Espelhar estado do robô real" marcado)   S[k] ← estado[k]; mode = "mirror"
```

Pontos de entrada que escrevem em `S` (únicos):

| Origem | Código | Efeito colateral |
|---|---|---|
| Slider | `i.oninput` (linha 65) | `demo=false`, botão volta a "▶ Demo", `S[k]=+i.value` |
| Demo | `tick()` (linhas 202–204) | sobrescreve as 5 juntas a cada frame |
| Reset | `$("rst").onclick` (linha 70) | `demo=false`, todas as juntas = 0, `syncUI()` |
| Hand tracking | `handsStep()` (linhas 177–197) | só em VR e com pinça esquerda ativa |
| MQTT espelho | `mq.on("message")` (linhas 164–165) | só se `#mir` marcado; `mode="mirror"` |

---

## 1. Rig cinemático (`buildRig`, linhas 90–147)

- Cada articulação é um `TransformNode` criado por `mk(name, pos, parent)`:
  `n._p = pos` (ponto do pivô em coordenadas do modelo), `n.position = pos − parent._p`, `rotationQuaternion = Identity`.
  **O pivô é a posição do TransformNode** — não há `setPivotPoint`.
- Rotação **exclusivamente** por `rotationQuaternion` (o Euler `rotation` não é usado).
- Função de rotação: `q(ax, deg) = Quaternion.RotationAxis(normalize(ax), deg·π/180)`.
- Peças do GLB são re-parentadas com `setParent` (preserva a pose do mundo) após `computeWorldMatrix(true)`.
- Nó raiz `stage`: `scaling = 1 / maior dimensão do modelo`; `position = (−k·W.x, 0,7 − k·min.y, −1,3 − k·W.z)` → base da cintura no topo do pedestal (altura 0,7 m, centro em x=0, z=−1,3).
- Sistema de coordenadas: `scene.useRightHandedSystem = true`.

### Hierarquia (verificada em runtime)

```text
stage
└─ j_waist            ← Waist:1
   └─ j_shoulder      ← Arm 01:1
      └─ j_elbow      ← Arm 02 v3:1
         └─ j_roll    ← Arm 03:1            (FIXO: K.roll0)
            └─ j_pitch ← Gripper base:1
               ├─ j_gearA ← gear2:1          ├─ j_gearB ← gear1:1
               ├─ j_linkA ← grip link 1:2    ├─ j_linkB ← grip link 1:1
               └─ j_fingA ← Gripper 1:1      └─ j_fingB ← Gripper 1 (1):1
```

> Observação: o modelo tem 6 nós de articulação de braço, mas o robô físico tem **5 servos**. `j_roll` é uma rotação fixa
> (`K.roll0 = 58.264463883196576°` em torno de `K.A`) que apenas endireita o pulso. Ela **não** é controlável e **não** vai para o MQTT.

---

## 2. Articulações

Tabela de origem: `const J` (linha 57) — `[chave, rótulo, mín, máx]`. Sliders: `step="0.5"`, `value="0"`.
Mapeamento ESP32: `KEYS = {"waist","shoulder","elbow","pitch","grip"}`, `CH = {0,1,2,3,4}`, `OFFSET = 90` (todas), `SIGN = +1` (todas).
Fórmula no firmware: `servo_graus = constrain(OFFSET + SIGN·ângulo, SMIN, SMAX)`.

### J1 — BASE (cintura)

| Item | Valor |
|---|---|
| Chave de estado / MQTT | `waist` |
| Rótulo atual na UI | "Cintura" |
| TransformNode | `j_waist` (pai: `stage`) |
| Pivô (coord. modelo) | `K.W = [0.3554, 0.0565, 0.18927]` |
| Eixo | `[0, 1, 0]` (Y do `stage`) |
| Sentido | positivo = rotação anti-horária em torno de +Y (mão direita) |
| Limite mínimo / máximo (app) | **−180° / +180°** |
| Valor inicial | 0° |
| Controle associado | slider "Cintura" (1º de `#sl`) |
| Tópico MQTT | `<pfx>/cmd` e `<pfx>/estado`, campo `waist` |
| ESP32 | canal 0, SMIN 10 / SMAX 170 → faixa física efetiva **−80° / +80°** |
| IK | caminho mais curto: `w = ((w+540)%360)−180` |

### J2 — OMBRO

| Item | Valor |
|---|---|
| Chave | `shoulder` · rótulo "Ombro" |
| TransformNode | `j_shoulder` (pai: `j_waist`) |
| Pivô | `K.S = [0.35292577566560457, 0.09682742678627118, 0.18292994423007594]` |
| Eixo | `K.N = [0.68647, -1e-05, -0.72715]` |
| Limites (app) | **−70° / +70°** |
| Valor inicial | 0° (pose do modelo: braço ~48° acima da horizontal, `K.e0 = 48.044°`) |
| Controle | slider "Ombro" |
| MQTT | campo `shoulder` |
| ESP32 | canal 1, SMIN 20 / SMAX 160 → efetivo −70° / +70° |

### J3 — COTOVELO

| Item | Valor |
|---|---|
| Chave | `elbow` · rótulo "Cotovelo" |
| TransformNode | `j_elbow` (pai: `j_shoulder`) |
| Pivô | `K.El = [0.4023, 0.1847, 0.2383]` |
| Eixo | `K.N` (mesmo eixo do ombro) |
| Limites (app) | **−120° / +120°** |
| Valor inicial | 0° (cotovelo reto na pose do modelo) |
| Controle | slider "Cotovelo" |
| MQTT | campo `elbow` |
| ESP32 | canal 2, SMIN 10 / SMAX 170 → efetivo −80° / +80° |

### (fixo) — ROLL DO PULSO

| Item | Valor |
|---|---|
| TransformNode | `j_roll` (pai: `j_elbow`) |
| Pivô | `K.O3 = [0.43602, 0.25325, 0.28705]` |
| Eixo | `K.A = [0.48615, 0.74366, 0.45894]` |
| Ângulo | **constante** `K.roll0 = 58.264463883196576°` |
| Controle / MQTT | nenhum |

### J4 — PUNHO (pitch)

| Item | Valor |
|---|---|
| Chave | `pitch` · rótulo "Pulso" |
| TransformNode | `j_pitch` (pai: `j_roll`) |
| Pivô | `K.P = [0.45147, 0.27709, 0.30396]` |
| Eixo | `K.E = [-0.82099, 0.5686, -0.0517]` |
| Limites (app) | **−80° / +80°** |
| Valor inicial | 0° |
| Controle | slider "Pulso" |
| MQTT | campo `pitch` |
| ESP32 | canal 3, SMIN 10 / SMAX 170 → efetivo −80° / +80° |

### GARRA

| Item | Valor |
|---|---|
| Chave | `grip` · rótulo "Garra" |
| Limites (app) | **0 / 30** |
| Semântica | **0 = FECHADA**, **30 = ABERTA** (medido: distância entre dedos 0,1266 → 0,1866 un. de mundo) |
| Valor inicial | 0 (fechada) |
| Mecanismo | paralelogramo de 4 barras real, 2 lados (A e B), em plano normal a `K.ng = [0.29645, 0.50191, 0.81252]` |
| Lado A | `dθ_A = +grip·D2R` (sA = +1), fase 0° — nós `j_gearA`, `j_linkA`, `j_fingA` |
| Lado B | `dθ_B = −K.gearRatio·dθ_A` (`gearRatio = 0.9991905192159031`), fase 30° — nós `j_gearB`, `j_linkB`, `j_fingB` |
| Solver | `solve2(g, dθ)` (interseção de círculos, escolhe a solução mais próxima de `P4r`) → `applySide()` define `rotationQuaternion` de gear/link/dedo **e `position` do dedo** |
| Geometria | `K.G4.A` / `K.G4.B` (P1, P3, Ld, Ll, Lf, Lb, th0, P2r, P4r, phase) — copiados integralmente em `baseline.json → static.K` |
| Controle | slider "Garra" |
| MQTT | campo `grip` |
| ESP32 | canal 4, SMIN 30 / SMAX 150 → efetivo 0 … 30 (servo 90°–120°) |
| Hand tracking | `grip = 30·clamp((dist(indicador, polegar) − 0,02) / (0,09 − 0,02), 0, 1)` |

> ⚠ A UI pedida no prompt mostra `ABERTA ───●──── FECHADA`. No código atual o mínimo (esquerda) é **fechada**.
> A nova UI deve rotular as extremidades de acordo com o valor real, sem inverter o slider.

---

## 3. Posições de referência

| Nome no prompt | Existe? | Implementação real |
|---|---|---|
| **Zero** | ✔ como "Reset" | Botão `#rst`: `demo=false`, todas as juntas = 0, `syncUI()`. Pose zero = pose original do GLB. |
| **Home** | ✘ | Não existe posição Home distinta. Zero = Home. |
| **Presets** | ✘ | Não existem presets. |

---

## 4. Demonstração (`tick`, linhas 202–204)

- Botão `#demo` alterna `demo`; ao ligar grava `t0 = performance.now()/1000`. Texto: "▶ Demo" ↔ "⏸ Parar".
- **Movimento contínuo e senoidal** (não é uma sequência de passos), com `t = agora − t0` em segundos:

```text
waist    = 70 · sin(0,5 t)
shoulder = 35 · sin(0,8 t) + 5
elbow    = 55 · sin(1,1 t + 1)
pitch    = 40 · sin(1,3 t)
grip     = 15 + 15 · sin(2,2 t)
```

- Interrompido por: clique em "⏸ Parar", qualquer `input` em slider, Reset, ou entrada em VR.
- ⚠ Se "Enviar comandos ao robô real" estiver marcado, **o Demo é transmitido ao robô físico** (o loop de 20 Hz publica `S` independentemente da origem).
- Valores de referência em `baseline.json → demo["t=…"]` (t = 0; 0,5; 1,7; 3,3; 7,1; 12,9 s).

---

## 5. MQTT (linhas 149–173)

| Item | Valor |
|---|---|
| Biblioteca | `mqtt@5.10.1` (jsDelivr) |
| Conexão | `mqtt.connect(url, {username, password, clientId:"vr-"+6 hex aleatórios, reconnectPeriod:3000})` |
| Configuração persistida | `localStorage`: `braco_url`, `braco_usr`, `braco_pwd`, `braco_pfx` (salvos ao clicar Conectar) |
| Prefixo | `#pfx`, padrão `braco` |
| Subscribe | `<pfx>/estado` no evento `connect` (QoS padrão 0) |
| Publish | `<pfx>/cmd` a **20 Hz** (`1000/CFG.sendHz`), **QoS 0**, só se `mq.connected && #snd.checked` |
| Payload | `{"waist":12.3,"shoulder":-8.1,"elbow":40.1,"pitch":-5.5,"grip":18.3}` — `Math.round(S[k]·10)/10` |
| Espelhamento | mensagem só é aplicada se `#mir.checked`; campos numéricos presentes sobrescrevem `S` (parciais permitidos); `mode="mirror"`; clamp aplicado no próximo `tick` |
| Exclusão mútua | marcar `#mir` desmarca `#snd`; marcar `#snd` desmarca `#mir` e sai de `mirror` |
| Status | `#mq`: "conectando…", "✔ conectado", "desconectado", "erro: …", "informe a URL wss://" |
| Reconexão | ao clicar Conectar de novo: `mq.end(true)` e nova conexão |

**Acoplamento ao DOM (crítico para o redesign):** a lógica lê diretamente `$("snd").checked` (loop de envio), `$("mir").checked` (handler de mensagem) e `$("pfx").value` (tópico de publish). Esses elementos — e `#url #usr #pwd #con #mq` — **devem continuar existindo com os mesmos IDs**; a nova UI pode estilizá-los/movê-los, ou acioná-los via adapter (`el.checked = …; el.dispatchEvent(new Event("change"))`).

### ESP32 (`esp32_braco.ino`)

| Item | Valor |
|---|---|
| Broker | TCP `MQTT_HOST:1883` (sem TLS por padrão) |
| Subscribe | `<PREFIX>/cmd` |
| Publish | `<PREFIX>/estado` a 10 Hz (`now − lastPub > 100`) |
| Conversão | `target = constrain(OFFSET + SIGN·a, SMIN, SMAX)`; estado = `round(SIGN·(cur − OFFSET)·10)/10` |
| Velocidade | `MAX_SPEED = 120 °/s` (rampa por eixo) |
| Watchdog | `WATCHDOG_MS = 800` — sem comando por 800 ms ⇒ **congela na posição atual** (não desliga torque) |
| Pose inicial | `cur = target = OFFSET` (= pose do modelo, ângulo 0) |
| PWM | PCA9685, 50 Hz, 500–2500 µs, I²C SDA 21 / SCL 22 |

---

## 6. WebXR (linhas 287–295)

- `scene.createDefaultXRExperienceAsync({uiOptions:{sessionMode:"immersive-vr"}, optionalFeatures:true})`.
- Não há verificação explícita de `window.isSecureContext`, `navigator.xr` ou `isSessionSupported`; a disponibilidade é inferida pelo sucesso/falha da chamada.
  - Sucesso: "✔ Pronto. Botão 🥽 para VR. Em VR: mão direita move o robô; PINÇA da mão esquerda = habilita."
  - Falha: "⚠️ VR indisponível (precisa de HTTPS + navegador WebXR). A pré-visualização 3D funciona."
- Ao entrar em VR (`WebXRState.IN_XR`): `#ui` oculto, `demo=false`, `mode="hands"`. Ao sair: `#ui` visível, `mode` volta a `manual` se estava em `hands`.
- Não existe UI dentro do headset (nenhum Babylon GUI).

## 7. Hand tracking (`handsStep`, linhas 176–197)

| Item | Valor |
|---|---|
| Feature | `WebXRFeatureName.HAND_TRACKING`, `"latest"`, `disableDefaultHandMesh:true`, `jointMeshes:{enablePhysics:false}` |
| Quando roda | todo frame, se `inXR && !demo` |
| **Mão esquerda — habilitar** | `follow = dist(THUMB_TIP, INDEX_FINGER_TIP) < CFG.pinchOn (0,03 m)`; soltar a pinça ⇒ `S` fica parado |
| **Mão direita — posicionar** | `WRIST` relativo ao ombro virtual `sh = cabeça + direita_horizontal·0,17 − (0, 0,25, 0)` |
| Escala | `f = (K.L1 + K.L2) / CFG.humanReach (0,6 m)`; `dh = dist_horizontal·f`, `hh = v.y·f`, `phi = atan2(v.z, v.x)` |
| Elevação da garra | `eg = atan2(dir.y, projeção horizontal de (INDEX_TIP − WRIST) na direção ombro→mão)` |
| Garra | abertura polegar–indicador (ver §2 Garra) |
| IK | `solveArm(dh, hh, phi, eg, K)` — 2 elos planares (`L1=0.11500107…`, `L2=0.12355094…`) + cintura + pulso |
| Suavização | `k = 1 − (1 − 0,25)^(dt·60)`; `S += (alvo − S)·k`; cintura pelo caminho mais curto |
| Valores de referência | `baseline.json → ik[]` e `hands.*` |

## 8. Câmera

Uma única `ArcRotateCamera "cam"`: `alpha = −π/2,6`, `beta = 1,15`, `radius = 2,6`, `target = (0, 1,15, −1,3)`,
`lowerRadiusLimit = 0,6`, `upperRadiusLimit = 9`, `wheelPrecision = 60`, `minZ = 0,01`, controle por arrasto.
**Não existem as quatro vistas** (frontal/lateral/superior/detalhe).

## 9. E-STOP

**NÃO EXISTE** no código atual: não há botão, não há tecla `E`, não há lógica de interrupção nem de rearme.
Nenhum `keydown`/`keyup` é registrado (os únicos listeners são `error`, `unhandledrejection` e `resize`).
O mais próximo de uma parada hoje é: desmarcar "Enviar comandos" ⇒ o site para de publicar ⇒ o ESP32 congela após 800 ms (watchdog).

---

## 10. Comportamentos peculiares — PRESERVAR até autorização explícita

1. O rótulo numérico ao lado do slider (`<output>`) **não atualiza** ao arrastar no modo manual — só via `syncUI()` (Demo, VR, espelho, Reset).
2. Slider da cintura vai a ±180°, mas o servo físico só alcança ±80° (clamp no firmware).
3. Slider do cotovelo vai a ±120°, servo físico ±80°.
4. O Demo é enviado ao robô real se "Enviar comandos" estiver marcado.
5. Reset não desliga o envio — envia zeros ao robô.
6. Mensagem de espelho só é processada com `#mir` marcado; sem ele, o ESP32 pode estar online sem nenhum sinal na UI.
7. Senha MQTT salva em texto puro no `localStorage` (`braco_pwd`).
8. Erros globais de JS são escritos em `#st`.

---

## 11. Teste automatizado

```bash
cd tests/movement
npm install          # uma vez (puppeteer-core; usa o Chrome instalado)
npm test             # compara com baseline.json — exit 1 se qualquer valor mudar
```

Cobertura (≈ 2 500 valores comparados com tolerância 1e-6):

| Item do checklist | Como é verificado |
|---|---|
| J1–J4, Garra | matrizes de mundo dos 12 nós `j_*`/`stage` + 11 peças do GLB em mín / ¼ / máx de cada junta, pose combinada e acima do limite |
| Sliders | atributos min/max/step e caminho `input → S → pose` |
| Zero / Reset | pose zero inicial = pose após Reset; estado da UI |
| Demo | relógio congelado em 6 instantes; botão; slider interrompe Demo |
| MQTT | opções de conexão, tópico de subscribe, taxa 20 Hz, tópico/payload/QoS do publish, nenhum publish com `#snd` desmarcado |
| Espelhamento | mensagem completa, parcial, fora do limite, ignorada com `#mir` desmarcado, exclusão mútua snd/mir |
| IK | `solveArm` em 5 entradas fixas |
| Hand tracking | `handsStep` com mãos sintéticas: pinça ativa (1 passo e convergido), logo abaixo do limiar, pinça solta |
| Estrutura | `J`, `K`, `CFG`, hierarquia parent/child, transformações locais, parâmetros da câmera |

Validação do próprio teste: uma cópia com o sinal do ombro invertido foi **reprovada** (2 549 diferenças); o original é aprovado de forma reprodutível.

**Não coberto pelo teste automatizado (verificação manual obrigatória):** sessão WebXR real no Meta Quest, rastreamento de mãos real, broker real, ESP32/servos físicos.

## 12. Checklist manual (executar após cada etapa)

```text
MOVEMENT REGRESSION TEST                         auto  manual
[ ] J1 movimenta corretamente                     ✔     visual
[ ] J2 movimenta corretamente                     ✔     visual
[ ] J3 movimenta corretamente                     ✔     visual
[ ] J4 movimenta corretamente                     ✔     visual
[ ] Garra abre (→ 30)                             ✔     visual
[ ] Garra fecha (→ 0)                             ✔     visual
[ ] Zero (Reset) funciona                         ✔     visual
[ ] Home funciona                                 n/a — não existe
[ ] Demo funciona                                 ✔     visual
[ ] E-STOP interrompe comando                     n/a — não existe
[ ] Sliders funcionam                             ✔     visual
[ ] MQTT mantém mapping                           ✔     broker real + ESP32
[ ] Espelhamento                                  ✔     ESP32 real
[ ] WebXR mantém mapping                          —     Meta Quest
[ ] Hand Tracking mantém mapping                  ✔     Meta Quest
```
