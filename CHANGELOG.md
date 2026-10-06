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
