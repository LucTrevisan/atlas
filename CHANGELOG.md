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
