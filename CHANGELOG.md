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
