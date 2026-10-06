# CHANGELOG — ATLAS UX/UI Refactor

## ETAPA 0 — BASELINE (2026-10-06)

### Alterado
- Nenhum arquivo do aplicativo (`index.html`, `braco.glb`, `esp32_braco.ino`, `README.md`).
- Repositório git inicializado; commit `117bc18` com o estado original intocado.

### Adicionado
- `MOVEMENT_BASELINE.md` — cadeia completa de movimentação, articulações, eixos, pivôs, limites, MQTT, WebXR, hand tracking.
- `PROJECT_BASELINE.md` — estrutura do projeto, DOM, cena, estados, lacunas entre o prompt e o código.
- `tests/movement/` — teste anti-regressão automatizado (Chrome headless) + `baseline.json` (golden snapshot gerado do original).
- `.gitignore` (`node_modules/`).

### Preservado
- **Movement logic: PRESERVED** (nenhuma linha de lógica alterada).

### Testado
- `npm test` em `tests/movement`: APROVADO, reprodutível em execuções repetidas.
- Teste de mutação (sinal do ombro invertido numa cópia fora do projeto): REPROVADO como esperado.

### Regressões
- Nenhuma.

### Arquivos modificados
- Nenhum arquivo existente. Novos: `MOVEMENT_BASELINE.md`, `PROJECT_BASELINE.md`, `CHANGELOG.md`, `.gitignore`, `tests/movement/{package.json,package-lock.json,run.mjs,baseline.json}`.

## ETAPA 1 — CORES / TEMA (2026-10-06) — `v1-atlas-theme`

### Alterado
- Bloco `<style>` do `index.html` substituído pelo tema ATLAS:
  - Design tokens `--atlas-*` centralizados em `:root` (paleta do prompt + `--atlas-border-soft`, `--atlas-track`, `--atlas-glow`, `--atlas-chamfer`, fontes).
  - Tema escuro fixo (`color-scheme: dark`); removidos o tema claro e a cor de acento laranja `#e8590c`.
  - Painel `#ui`: vidro azul-marinho, borda ciano, cantos chanfrados (`clip-path`), cantoneiras HUD, `backdrop-filter`.
  - Tipografia: rótulos em caixa-alta com espaçamento; valores numéricos em fonte mono tabular.
  - Botões azul elétrico chanfrados; botão secundário (Reset) em contorno ciano.
  - Inputs com fundo `--atlas-bg-secondary`, foco com brilho ciano; `:focus-visible` em botões, inputs e summary.
  - `prefers-reduced-motion` desativa transições.
- Posição, tamanho e grid do painel mantidos (layout é a ETAPA 2).

### Preservado
- **Movement logic: PRESERVED.** Zero alteração de HTML e JavaScript (verificado: conteúdo fora de `<style>` idêntico ao commit anterior).
- Cores da cena 3D (definidas em JS) inalteradas.
- Vermelho não usado (sem estado de erro/E-STOP estilizável apenas por CSS).

### Testado
- `npm test` (tests/movement): APROVADO — 12/12 grupos idênticos ao baseline.
- Inspeção visual por screenshot headless (1280×760).

### Regressões
- Nenhuma.

### Arquivos modificados
- `index.html` (somente `<style>`), `CHANGELOG.md`.

## ETAPA 2 — LAYOUT (2026-10-06) — `v2-atlas-layout`

### Alterado
- `#ui` passou a ser o contêiner de toda a interface (header + painel + barra inferior), com `pointer-events` só nos elementos visíveis. O código existente que oculta `#ui` em VR continua ocultando tudo.
- **Header** compacto: marca ATLAS · Robotic Digital Twin · stack; abas; chips de estado.
- **Navegação** por abas (`role=tablist`): DIGITAL TWIN · CONTROLE · TELEMETRIA · WEBXR · CONFIGURAÇÕES. Um único painel contextual por vez; clicar na aba ativa, `×` ou `Esc` recolhe o painel (Digital Twin livre). Setas/Home/End navegam entre abas. Aba lembrada em `localStorage` (`atlas_tab`, com try/catch).
- **Painéis**:
  - Digital Twin: cadeia Virtual ⇄ Twin ⇄ MQTT ⇄ ESP32 ⇄ Robô e leitura J1–J4/Garra (somente leitura de `S`).
  - Controle: `#sl`, `#demo`, `#rst` (os mesmos elementos, só realocados).
  - Telemetria: estado MQTT/envio; ângulos com selo **DADOS SIMULADOS** (ou "Estado do robô real" em espelho); latência/último pacote como "não medido" — nada inventado.
  - WebXR: `isSecureContext` e presença de `navigator.xr` (somente leitura) + instruções existentes do README.
  - Configurações: formulário MQTT com `<label for>`; mesmos IDs.
- **Chips de estado** (derivados, somente leitura, a cada 250 ms): `● SIMULAÇÃO` · `● ESPELHANDO ROBÔ REAL` · `◐ ENVIO ARMADO · MQTT OFFLINE` · `● CONTROLE REAL HABILITADO` (âmbar sólido); `▶ DEMO`; MQTT offline/conectando/conectado/erro; ESP32 "sem telemetria" (o app não lê `/estado` fora do espelho).
- **Barra inferior**: `#st` + cadeia de integração.
- **Responsivo**: ≤1180 px compacta; ≤980 px abas em segunda linha; ≤640 px painel vira bottom sheet (≤52vh), Digital Twin dominante, painel inicia recolhido.
- Botão 🥽 do Babylon mantido acima da interface (`.xr-button-overlay` z-index).
- `<title>`: "ATLAS — Robotic Digital Twin".

### Preservado
- **Movement logic: PRESERVED.** Script principal e CDNs byte a byte idênticos ao baseline (verificado).
- Todos os IDs usados pela lógica presentes uma única vez: `c ui sl demo rst url usr pwd pfx snd mir con mq st`.
- O novo script de UI não atribui a `S`, `mode`, `demo` nem `mq` (verificado por análise).
- Não foi criado E-STOP (não existe lógica; aguardando decisão). Cores da cena 3D inalteradas.

### Testado
- `npm test`: APROVADO (12/12).
- Screenshots headless: desktop 1440×860 (5 abas + painel recolhido + estado "controle real" com cliente MQTT falso), tablet 900×1100, mobile 390×844. Nenhum erro de JS.

### Regressões
- Nenhuma.

### Arquivos modificados
- `index.html` (head/style, HTML do `#ui`, novo `<script>` de UI ao final), `CHANGELOG.md`.

## ETAPA 3 — CONTROLES (2026-10-06) — `v3-atlas-controls`

Decisões autorizadas: (1) número do slider acompanha o arraste (somente exibição); (2) garra mantém a ordem real FECHADA (0) → ABERTA (30); (3) confirmação antes de habilitar o envio ao robô real.

### Alterado
- **Linhas de junta** sobre os sliders EXISTENTES (mesmos `<input>`, mesmo `oninput`): `J1 BASE · J2 OMBRO · J3 COTOVELO · J4 PUNHO · GARRA`, valor atual em destaque, limites reais lidos de `min/max` (−180°/+180°, −70°/+70°, −120°/+120°, −80°/+80°, Fechada/Aberta).
- **Trilho** customizado (WebKit/Firefox) preenchido a partir do zero até o valor; thumb ciano com brilho; altura de toque 44 px; colunas de limite fixas (trilhos de mesmo comprimento).
- **Número exibido** atualiza durante o arraste (listener adicional de exibição, mesmo formato de `syncUI()`: `Math.round(v)+"°"`).
- **Acessibilidade**: `aria-labelledby` (J + nome) e `aria-valuetext` ("−21 graus"; garra "18 de 30 (0 fechada, 30 aberta)"); `role=group` em `#sl`; `aria-label` em Demo/Zerar; botões e caixas ≥ 44 px.
- **Reset** agora rotulado "⟲ Zerar" (mesmo botão `#rst`, mesmo handler).
- **Confirmação de controle real**: diálogo modal (`<dialog>`) ao MARCAR "Enviar comandos ao robô real" — por clique, rótulo ou teclado. Cancelar/Esc mantém desligado; Confirmar marca a caixa e dispara o mesmo `change` de um clique comum (o `onchange` original roda inalterado). Desmarcar nunca pede confirmação. Diálogo fecha se o usuário entrar em VR.
- **Aviso persistente** "● CONTROLE REAL HABILITADO" no painel Controle enquanto o envio está ativo e o MQTT conectado (lembrando que Demo/Zerar/hand tracking também vão ao robô).
- Loop rAF de repintura dos trilhos só roda com a aba Controle aberta **e** Demo/espelho/VR ativos (um loop contínuo reduzia a taxa efetiva do `setInterval` de publish no Chrome headless; corrigido e medido: 20/s, igual à v2).

### Preservado
- **Movement logic: PRESERVED.** Script principal byte a byte idêntico ao baseline; nenhum novo caminho escreve em `S`.
- Valores, limites, passos (0,5) e direção de todos os sliders; ordem da garra.

### Testado
- `npm test`: APROVADO (12/12) + 7 verificações de UX com cliques reais (confirmação, cancelar, teclado, Esc, confirmar → onchange original, desmarcar sem confirmação, trilho acompanha Demo).
- Teste ajustado: (a) o rótulo do slider agora é verificado como "igual ao valor do slider" em vez do valor travado do baseline (mudança autorizada); (b) taxa MQTT medida pelo intervalo agendado (determinística) em vez do relógio.
- Screenshots: painel, diálogo, aviso de controle real, mobile.

### Regressões
- Detectada e corrigida durante a etapa: queda da taxa efetiva de publish (16–17/s) causada pelo loop rAF contínuo. Após correção: 20/s em 3 medições alternadas v2/v3.

### Arquivos modificados
- `index.html` (CSS, HTML do painel Controle + diálogo, script de UI), `tests/movement/run.mjs`, `MOVEMENT_BASELINE.md` (nota §10.1), `CHANGELOG.md`.

## ETAPA 4 — DIGITAL TWIN UX (2026-10-06) — `v4-atlas-twin`

### Alterado
- **Marcadores** J1 · J2 · J3 · J4 · GARRA sobre o modelo (botões HTML acessíveis), posicionados a cada frame pela projeção da posição absoluta dos TransformNodes existentes (`j_waist`, `j_shoulder`, `j_elbow`, `j_pitch`, média de `j_fingA/j_fingB`). Ocultos fora da tela/atrás da câmera; opção "Mostrar marcadores no modelo" (lembrada em `localStorage`, `atlas_hs`).
- **Destaque** com `BABYLON.HighlightLayer` ("atlas-hl") nas peças que cada junta move: J1 `Waist:1`; J2 `Arm 01:1`; J3 `Arm 02 v3:1` + `Arm 03:1`; J4 `Gripper base:1`; Garra engrenagens/elos/dedos. `grip link 1:2` é `InstancedMesh` (não suportado pelo HighlightLayer) → destaca-se a malha-fonte `grip link 1:1`, também da garra.
- **Seleção bidirecional**:
  - Twin → slider: clique no marcador ou toque (não arraste) na peça → abre CONTROLE, marca a linha, foca o slider EXISTENTE (marcador) e mostra o cartão.
  - Slider → Twin: focar ou mover um slider seleciona e destaca a junta.
  - Toque em área vazia, `×` do cartão ou novo clique no marcador limpam a seleção.
- **Cartão de seleção** (painel Controle): `J2 — OMBRO` · Atual · Limites · Estado (`NORMAL`, `NO LIMITE`, `ALÉM DA FAIXA DO SERVO (±80°)` para cintura/cotovelo com a calibração padrão do firmware; garra `FECHADA`/`ABERTA` nos extremos).
- **Painel Digital Twin**: botões J1…GARRA para destacar sem sair do painel; linha selecionada realçada na leitura.
- HighlightLayer com texturas a 1/4 da resolução e **desligado em VR**.

### Preservado
- **Movement logic: PRESERVED.** Script principal idêntico ao baseline. A camada nova não atribui `rotation`, `rotationQuaternion`, `position`, `scaling`, `material`, `parent`, nem usa `setParent`/`setPivotPoint`/`freeze*` (verificado por análise) e não escreve em `S`.
- Materiais das malhas inalterados (verificado por `uniqueId` antes/depois).

### Testado
- `npm test`: APROVADO (12/12) + UX: marcador J2 → Controle/linha/foco; destaque contém exatamente as peças do ombro; cartão e estado NO LIMITE; foco no slider do cotovelo seleciona J3; limpar remove destaque; materiais inalterados; garra destacada sem erro.
- O teste agora **reprova se houver qualquer erro de JavaScript na página** (stack trace registrado).
- Screenshots: seleção J2 e Garra com glow.

### Regressões
- Detectada e corrigida: `HighlightLayer.addMesh` lançava erro com a peça instanciada da garra (o handler de UI falhava; o movimento não era afetado porque o `oninput` original roda antes). Corrigido usando a malha-fonte + `try/catch` no destaque.
- Observação de desempenho (não é regressão de movimento): no Chrome headless com GPU por software, enquanto uma junta está destacada a taxa efetiva medida de publish ficou em 17–19/s contra 19–20/s na v3 (o intervalo agendado continua 50 ms = 20 Hz). Mitigado com texturas a 1/4 e destaque desligado em VR; reavaliar em GPU real na ETAPA 9.

### Arquivos modificados
- `index.html` (CSS, HTML de marcadores/cartão/seleção, script de UI), `tests/movement/run.mjs`, `CHANGELOG.md`.

## ETAPA 5 — MQTT UX (2026-10-06) — `v5-atlas-mqtt`

### Alterado
- **Configurações → MQTT**: bloco de status (Desconectado / Conectando… / Conectado · host / Erro) com o `#mq` original dentro; rótulos e dica de URL (aviso se não começar com `wss://` ou se `ws://` em página HTTPS); botão Mostrar/Ocultar senha (só troca o `type` do campo); seção **Modo de operação** com descrição dos dois modos; resumo de **tópicos** derivado do prefixo (`<pfx>/cmd` 20 Hz · QoS 0; `<pfx>/estado` 10 Hz; payload); ajuda sobre broker/ESP32 e aviso de que as credenciais ficam no navegador.
- **ESP32 real**: listener **adicional e somente leitura** em `message` do cliente mqtt.js (o app já assina `<pfx>/estado`; mqtt.js aceita vários listeners). Registra horário e último JSON de `/estado`. Não escreve em `S`, não publica, não assina, não altera tópicos/QoS/payload/handler original.
- **Header**: chip ESP32 = `● online` (pacote < 1,5 s), `◐ sem dados` (já houve pacote, parou), `○ sem telemetria`.
- **Telemetria**: tabela Junta | Comando (`S`) | Robô real (`/estado`); selo "Dados simulados" / "Comando × estado real" / "Espelhando robô real"; último pacote (ms), taxa de `/estado` medida (Hz), envio "20 Hz · QoS 0 (configurado)" ou "parado"; latência "não medida" (payload sem carimbo de tempo — nada inventado).

### Preservado
- **Movement logic: PRESERVED.** Script principal idêntico ao baseline; IDs mantidos; a camada nova não chama `publish/subscribe/unsubscribe/end/mqtt.connect` nem escreve em `S`/`mode`/`demo`/`mq` (verificado por análise).
- Broker, tópicos, QoS, payload, parsing, reconnect e espelhamento inalterados (golden MQTT idêntico).

### Testado
- `npm test`: APROVADO (12/12) + UX: ESP32 online e feedback por junta; `/estado` com espelho desligado não altera `S`; 2 listeners (o original não é substituído); `◐ sem dados` após 1,5 s; status em Configurações.
- Cliente MQTT falso do teste passou a aceitar vários listeners por evento (fiel ao mqtt.js); o golden de MQTT/espelhamento continua idêntico.
- Desempenho (novo `tests/movement/bench.mjs`, 10 s): v0 original 18,2 / 19,9 pub/s × v5 18,6 / 19,9 pub/s; v4 × v5 empatados. (Janelas de 1 s mostraram ruído de até ±4 pub/s no Chrome headless com GPU por software.)
- Screenshots: Configurações (desconectado/conectado), Telemetria com ESP32 simulado.

### Regressões
- Nenhuma.

### Arquivos modificados
- `index.html` (CSS, HTML Telemetria/Configurações, script de UI), `tests/movement/run.mjs`, `tests/movement/bench.mjs` (novo), `CHANGELOG.md`.

## ETAPA 7 — WEBXR UX (2026-10-06) — `v7-atlas-webxr`

> A ETAPA 6 (Demonstração) não foi executada nesta rodada, por escolha do usuário (aguarda decisões "PARAR × PAUSAR" e narrativa por tempo).

### Alterado
- **Diagnóstico WebXR** (somente leitura): `window.isSecureContext`, `navigator.xr`, `navigator.xr.isSessionSupported("immersive-vr")`, recurso de hand tracking (`handFeat`) e estado do envio ao robô real.
- **Veredito único com motivo**: "VR indisponível — página não está em HTTPS", "Navegador sem WebXR — use o Meta Quest Browser", "Sem sessão VR disponível", "Preparando VR…", "Pronto para VR".
- **Botão "🥽 Entrar em VR"** no painel, habilitado só quando pronto; aciona o próprio botão VR do Babylon (mesmo caminho do usuário).
- **Chip VR** no header (`● pronto` / `○ indisponível` / `○ verificando`).
- **Painel compacto no headset**: plano 3D (0,9 m) com `DynamicTexture` (sem biblioteca extra), ao lado do braço, `BILLBOARDMODE_Y`, não "pickable", sem parent no rig, sem iluminação/neblina. Mostra ATLAS · modo (Simulação/Controle real…) · hand tracking · J1–J4/Garra · MQTT · ESP32. Criado só na 1ª entrada em VR; redesenhado no máximo a cada 100 ms e só quando o conteúdo muda. Textura desespelhada (`uScale=-1`, cena em sistema destro). Fontes ≥ 30 px (legibilidade no Quest).
- **Pré-visualização** do painel do headset na tela (checkbox no painel WebXR).
- Diagnóstico com rótulos sem quebra (`.readout.wide`).

### Preservado
- **Movement logic: PRESERVED.** Script principal idêntico; `createDefaultXRExperienceAsync`, feature de hand tracking, `onStateChangedObservable`, ocultação do `#ui` em VR e mensagens de `#st` inalterados.
- A camada nova não escreve em `S`, `mode`, `demo`, `mq`, `follow`, `handFeat`, `inXR`, `xrCamRef`; atribui material apenas ao próprio painel.

### Testado
- `npm test`: APROVADO (12/12) + UX: veredito e motivo; botão Entrar só quando pronto; pré-visualização com 5 articulações; painel não pickable e sem parent; painel some ao desligar.
- Screenshots: aba WebXR e painel do headset (pré-visualização).
- **Não testável aqui:** sessão imersiva real no Meta Quest (validar posição/legibilidade do painel no headset).

### Regressões
- Nenhuma.

### Arquivos modificados
- `index.html`, `tests/movement/run.mjs`, `CHANGELOG.md`.

## ETAPA 8 — HAND TRACKING UX (2026-10-06) — `v8-atlas-hands`

### Alterado
- **Estados de hand tracking** (somente leitura; mesmas consultas do código original — `getHandByHandedness`, `getJointMesh` — e a variável `follow` que `handsStep()` já calcula):
  - `HAND TRACKING INDISPONÍVEL` (feature não habilitada) → instrução para ativar no Quest;
  - `○ PROCURANDO MÃOS` → "Mostre as mãos à frente do headset.";
  - `● MÃOS DETECTADAS` + presença ESQ/DIR + **medidor de aproximação da pinça** (exibição; o limiar real continua `CFG.pinchOn`) → "Use a mão esquerda para habilitar o controle…";
  - `● CONTROLE ARMADO` (pinça esquerda detectada, sem mão direita) → "Controle habilitado. Use a mão direita para movimentar o braço.";
  - `● MOVIMENTO ATIVO` (pinça + mão direita; borda do painel verde) → "Solte a pinça esquerda para parar.".
- **Instruções que somem após compreensão**: depois de 3 s acumulados em movimento ativo, só o estado é mostrado (lembrado em `localStorage`, `atlas_hands_learned`).
- Painel do headset: coluna "MÃOS" com estado, subestado/presença, medidor e instrução com quebra de linha.
- Painel WebXR (desktop): legenda dos estados e linha "Mãos (em VR)".
- `window.ATLAS_UI.hands()` (somente leitura) para testes/diagnóstico.

### Preservado
- **Movement logic: PRESERVED.** Mão utilizada, gesto, mapping, transformação, articulações, cálculo, thresholds (`pinchOn`, `gripOpenDist`, `humanReach`, `smooth`) e direção intactos. Script principal idêntico; a camada nova não escreve em `S`, `follow`, `handFeat`, `inXR`, `xrCamRef` nem `CFG`.

### Testado
- `npm test`: APROVADO (12/12; inclui os casos de hand tracking do baseline) + UX com sessão XR simulada e mãos sintéticas: procurando → detectadas (medidor + instrução) → armado → movimento ativo (braço movido pelo `handsStep` original) → instruções somem após 3 s → soltar a pinça para o movimento → painel desativado ao sair de VR.
- Benchmark 10 s: v5 19,8 / 19,8 pub/s × v8 19,8 / 20,0 pub/s.
- Screenshots do painel do headset nos estados "mãos detectadas" e "movimento ativo".
- **Não testável aqui:** rastreamento real no Meta Quest.

### Regressões
- Nenhuma.

### Arquivos modificados
- `index.html`, `tests/movement/run.mjs`, `CHANGELOG.md`.

## CORES DA CENA conforme imagem de referência (2026-10-06) — `v8b-atlas-cores`

### Alterado
- **Robô** com as cores do protótipo físico (PLA): peças azuis do modelo → vermelho `#D62718`; peças claras → amarelo `#F2B705`; garra/engrenagens/elos/dedos → vermelho; servos/pés pretos e logo mantidos. Albedo PBR convertido para espaço linear; `metallic 0`, `roughness 0.6` (plástico fosco).
- **Ambiente Digital Twin**: fundo `#020B18`, neblina `#061426`, piso azul-marinho com **grade ciano** (textura emissiva, célula 0,5 m), paredes azul-marinho com faixa azul, teto escuro, luminárias ciano-claro, CNC azul, bancada/estante em tons de azul-acinzentado, pedestal azul escuro. Banner SENAI e faixas de segurança amarelas mantidos.
- Painel Digital Twin → **Aparência**: alternar "Ambiente Digital Twin" e "Cores do robô físico" (restaura exatamente as cores originais; lembrado em `localStorage`).

### Preservado
- **Movement logic: PRESERVED.** Script principal idêntico. Somente cores/brilho de materiais **existentes** são alterados (mesmos objetos — `uniqueId` inalterado; nenhum material trocado; geometria, hierarquia e transformações intactas).

### Testado
- `npm test`: APROVADO + todas as verificações de UX (inclui "materiais das malhas inalterados").
- Screenshots: tema ATLAS × laboratório/modelo originais.

### Arquivos modificados
- `index.html`, `CHANGELOG.md`.

## ETAPA 9 — PERFORMANCE (2026-10-06) — `v9-atlas-performance`

### Alterado (somente elementos não cinemáticos)
- **Ambiente estático** (piso, faixas, paredes, teto, luminárias, janela, banner, painel de ferramentas, bancada, morsa, estante, caixas, CNC, pedestal — 32 malhas): `freezeWorldMatrix()`, `doNotSyncBoundingInfo = true`, `isPickable = false`. Salvaguardas em runtime: só congela malhas sem parent, sem filhos e fora da hierarquia `stage → j_* → peças`.
- `scene.skipPointerMovePicking = true`: nenhum raycast a cada movimento do mouse (antes: 1 pick por evento, ~1–5 ms nesta máquina contra a malha de 6 MB). O toque/clique continua fazendo pick e selecionando juntas.
- Malhas clicáveis 53 → 21 (só o braço), o que barateia o pick do toque.
- Materiais do ambiente congelados (`freeze()`), descongelados apenas durante a troca de tema.
- Telas com `devicePixelRatio > 2` renderizam no máximo a 2x (celulares); VR não é afetado.
- CSS: removido o `backdrop-filter` do painel lateral (recomposição a cada frame sobre o WebGL; o painel já é 88% opaco).

### NÃO alterado (por segurança)
- Nenhum nó do robô (`stage`, `j_*`, peças do GLB) congelado; `freezeActiveMeshes()` **não** usado; lógica de render loop, luzes, ambiente PBR e cinemática intactas.

### Preservado
- **Movement logic: PRESERVED.** Script principal idêntico ao baseline.

### Testado
- `npm test`: APROVADO (2 execuções) + UX: mover o mouse gera 0 picks; clique real na peça do ombro seleciona J2; só o ambiente congelado (32 malhas), nenhum nó do robô; troca de tema funciona com materiais congelados.
- Benchmark 10 s (Chrome headless + SwiftShader, máquina carregada): v8b 17,0/17,5 pub/s · 1,1–1,2 fps × v9 17,4/16,6 pub/s · 1,2–1,3 fps — equivalentes. O ganho de FPS precisa ser medido em GPU real (desktop/Quest); aqui a renderização por software domina e mascara diferenças.

### Regressões
- Nenhuma.

### Observação de processo
- Os commits `1f1bdbe` ("Camada IoT…") e `d267d88` ("Adiciona o código de teste do MPU6050"), feitos por `Luciano <luciano.trevisan@docente.senai.br>` fora desta sessão, contêm na verdade as correções do teste desta refatoração (verificações por condição e FPS no `bench.mjs`). Histórico mantido como está.
- O commit `v8b-atlas-cores` foi criado com uma execução de teste instável (timing); corrigido em seguida tornando as verificações de UX baseadas em condição.

### Arquivos modificados
- `index.html`, `tests/movement/run.mjs`, `CHANGELOG.md`.
