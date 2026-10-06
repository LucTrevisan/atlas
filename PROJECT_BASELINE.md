# ATLAS — PROJECT BASELINE (estado antes da refatoração de UX)

> Commit de referência: `117bc18` — *baseline: ATLAS before UX refactor* (2026-10-06).
> Detalhes da cinemática: [MOVEMENT_BASELINE.md](MOVEMENT_BASELINE.md).

## 1. Arquivos

| Arquivo | Tamanho | sha256 | Papel |
|---|---|---|---|
| `index.html` | 21 554 B | `a0dd8575a6ca9456acb63dabad0e31cc2519a56bf0d52952ea41ea06e324df50` | App inteiro: CSS + HTML + JS (300 linhas) |
| `braco.glb` | 6,19 MB | `f12fa035c11c3ca066ad24eb0c515f23c519d2a5c8f4f8b63d16958aed3c3c49` | Modelo 3D (peças soltas, re-parentadas em runtime) |
| `esp32_braco.ino` | 4 640 B | `35f331bac75e3a7b8bba840f461645781a6ce559d4a27cc89ded2fca7d025f42` | Firmware ESP32 + PCA9685 |
| `README.md` | 2 548 B | — | Instruções (cita `esp32_braco/esp32_braco.ino`, mas o arquivo está na raiz) |

Dependências (CDN jsDelivr, versões fixas): `babylonjs@7.30.0`, `babylonjs-loaders@7.30.0`, `mqtt@5.10.1`.
Sem build, sem bundler, sem framework. Deve ser servido por HTTP(S) (`file://` falha no carregamento do GLB).

## 2. Estrutura do `index.html`

| Linhas | Bloco |
|---|---|
| 7–24 | CSS (tema claro/escuro por `prefers-color-scheme`, acento laranja `#e8590c`) |
| 27–43 | HTML: `canvas#c` + painel flutuante `#ui` |
| 48–50 | Constantes `K` (geometria do modelo) e `CFG` (parâmetros) |
| 51–54 | Utilitários: `$`, `say`, handlers globais de erro, `D2R/R2D/clamp` |
| 56–70 | Tabela `J`, estado `S`, geração dos sliders, Demo, Reset |
| 72–87 | `solveArm` (IK) |
| 89–147 | `buildRig` (rig + garra 4 barras) → retorna `pose(S)` |
| 149–173 | MQTT |
| 175–197 | Hand tracking |
| 199–207 | `tick(dt)` |
| 209–297 | Bootstrap: engine, câmera, luzes, laboratório procedural, carga do GLB, WebXR |

## 3. Interface atual (DOM)

```text
canvas#c (tela cheia)
div#ui  (canto inferior esquerdo, 250 px, rolável)
  h1   "🦾 Braço Robótico"
  div#sl          ← 5 linhas geradas por JS: <span>rótulo</span><input range><output>
  button#demo     "▶ Demo" / "⏸ Parar"
  button#rst      "Reset"
  details  "MQTT / ESP32"
    input#url  input#usr  input#pwd  input#pfx (padrão "braco")
    checkbox#snd  "Enviar comandos ao robô real"
    checkbox#mir  "Espelhar estado do robô real"
    button#con    "Conectar"
    div#mq        status MQTT
  div#st          status geral / erros
```

**IDs usados pela lógica (não renomear):** `c, ui, sl, demo, rst, url, usr, pwd, pfx, snd, mir, con, mq, st`.
`#ui` é ocultado por código ao entrar em VR (`style.display="none"`).

Variáveis globais acessíveis (escopo de script) que a nova UI pode **ler** e o adapter pode usar:
`S, J, K, CFG, inputs, demo, mode, mq, pose, sceneRef, xrCamRef, inXR, handFeat, follow, syncUI, clampS, solveArm, handsStep, tick`.

## 4. Cena 3D

- Engine `antialias=true`, `adaptToDeviceRatio=true`; `clearColor (0,05, 0,06, 0,08)`.
- `createDefaultEnvironment({createSkybox:false, createGround:false})`; neblina linear 6–15 m.
- Luzes: hemisférica 0,75; direcional 0,9; 3 PointLights 0,5 (luminárias).
- Laboratório SENAI procedural: piso, faixas de segurança, paredes com barrado azul, teto, 3 luminárias, janela,
  banner `DynamicTexture` "SENAI / CURSO DE MECATRÔNICA", painel de ferramentas, bancada, morsa, estante com 9 caixas, CNC, pedestal.
- Sem sombras, sem post-processing, sem GlowLayer/HighlightLayer.
- Materiais: `StandardMaterial` criados um por mesh (`flat()` gera nome aleatório) — candidatos a otimização na ETAPA 9 (não-cinemáticos).

## 5. Estados operacionais existentes

| Variável | Valores | Quem altera |
|---|---|---|
| `mode` | `manual` · `mirror` · `hands` | mensagem MQTT com `#mir`; checkboxes; entrada/saída de VR |
| `demo` | bool | botão Demo, slider, Reset, entrada em VR |
| `inXR` | bool | `onStateChangedObservable` |
| `#snd.checked` | bool | usuário (desmarcado ao marcar `#mir`) |
| `#mir.checked` | bool | usuário (desmarcado ao marcar `#snd`) |
| `mq.connected` | bool | mqtt.js |

Não há estado explícito "simulação" × "controle real": hoje ele é implícito em `mq.connected && #snd.checked`.
Não há sinal de "ESP32 online" — o firmware publica `<pfx>/estado` a 10 Hz, mas o site só lê essas mensagens com `#mir` marcado.

## 6. Funcionalidades pedidas no prompt × estado real

| Funcionalidade | Situação | Implicação para as etapas |
|---|---|---|
| J1–J4 + garra | ✔ existe (J4 = `pitch`; há um roll fixo extra) | UI deve consumir `S`/sliders existentes |
| Sliders | ✔ existe | Adapter: `inputs[k][0].value = v; dispatchEvent(new Event("input"))` |
| Zero | ✔ (botão "Reset") | Adapter: `$("rst").click()` |
| Home | ✘ | Zero = Home; não inventar |
| Presets | ✘ | Não inventar sem autorização |
| Demo | ✔ contínuo senoidal | Narrativa "01/07" só pode ser camada de texto temporizada; não há passos |
| E-STOP | ✘ **não existe** | Ver decisão pendente abaixo |
| Tecla E | ✘ | Nenhum atalho de teclado existe |
| 4 vistas de câmera | ✘ (1 ArcRotateCamera livre) | Criar vistas seria funcionalidade nova (não cinemática) |
| MQTT config / status | ✔ | Mover para CONFIGURAÇÕES mantendo IDs |
| Enviar ao robô real | ✔ `#snd` | Só UX + confirmação; lógica inalterada |
| Espelhamento | ✔ `#mir` | idem |
| Telemetria comando × feedback | parcial | Comando = `S`; feedback só existe via `<pfx>/estado`; latência não existe (só pode ser medida no cliente) |
| Status ESP32 | ✘ | Possível inferir por chegada de `<pfx>/estado` (listener somente leitura) |
| WebXR | ✔ | Sem checagem explícita de `isSecureContext`/`isSessionSupported` |
| Hand tracking | ✔ | Estados internos (`follow`, mãos presentes) já existem e podem ser lidos para feedback |
| UI no headset | ✘ | `#ui` é ocultado; nada é mostrado em VR |

### Decisões que dependem de você

1. **E-STOP**: o prompt manda "preservar a lógica atual do E-STOP", mas ela não existe. Opções: (a) não criar; (b) criar um E-STOP *de software* novo — p.ex. desmarca `#snd`, para Demo, bloqueia publicação — o que é **lógica nova** e precisa de autorização; uma parada real exigiria também mudança no firmware.
2. **Vistas de câmera**: criar FRONTAL/LATERAL/SUPERIOR/DETALHE é funcionalidade nova (não toca na cinemática).
3. **Home/Presets**: manter inexistentes ou criar (lógica nova de comando).
4. **Rótulo do slider que não atualiza** (MOVEMENT_BASELINE §10.1): corrigir apenas a exibição na ETAPA 3?

## 7. Riscos observados (não corrigidos — somente registro)

- Senha MQTT em `localStorage` em texto puro.
- Demo e Reset são transmitidos ao robô real se `#snd` estiver marcado.
- Faixas da UI (cintura ±180°, cotovelo ±120°) maiores que as faixas físicas (±80°) — o firmware limita.
- Firmware usa MQTT sem TLS por padrão (`WiFiClient`, porta 1883).
