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
