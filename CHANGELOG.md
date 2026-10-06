# CHANGELOG — ATLAS (branch main)

## Port da interface ATLAS v10 (2026-10-06)

Origem: refatoração UX/UI em 10 etapas feita na branch `master` (tags `v0-atlas-baseline` … `v10-atlas-final`), portada para o `index.html` desta branch — que tem recursos ausentes na `master`: **E-STOP, 4 vistas de câmera, demonstração guiada, modo apresentação, ajuda, log MQTT, confirmação nativa e tratamento de reconexão**. Todos preservados.

### Alterado (somente apresentação)
- Tema ATLAS (tokens `--atlas-*`, azul-marinho/ciano, cantos chanfrados); layout com cabeçalho, abas e um painel contextual; responsivo (desktop, tablet, celular com bottom sheet).
- Cabeçalho = `#bar` da lógica: E-STOP (`#estop`), apresentação (`#presb`) e ajuda (`#helpb`) restilizados e sempre visíveis; `#badge`/`#modetag` substituídos visualmente por chips (continuam atualizados pela lógica).
- E-STOP: banner "⛔ PARADA DE EMERGÊNCIA — comandos físicos bloqueados" + **Rearmar sistema** (aciona o mesmo `#estop`); chip "⛔ E-STOP ativo"; painel do headset mostra o estado.
- Demonstração guiada: legenda `#cap` em estilo HUD ("MODO DEMONSTRAÇÃO") e destaque da articulação da etapa (leitura da legenda).
- Vistas (`[data-v]`) no painel Digital Twin; log MQTT acessível em Configurações; tópico `/estop` listado.
- Camada ATLAS da v10: sliders com limites e número ao vivo, marcadores/seleção/HighlightLayer, telemetria comando × estado real (listener somente leitura de `/estado`), diagnóstico WebXR + painel no headset, feedback de hand tracking, cores do robô físico (vermelho/amarelo) e ambiente com grade ciano, otimizações em elementos estáticos.
- O diálogo customizado de confirmação da v10 **não** foi portado: esta versão já confirma com `confirm()` nativo (evita confirmação dupla).

### Preservado
- **Movement logic: PRESERVED.** CDNs + script principal byte a byte idênticos ao commit `ba4919b` (inclui `setEstop`, `demoStep`, `initViews`, `setPres`, MQTT/`setConn`, atalhos E/Espaço/P/F/H/Esc).

### Testado
- `npm test`: APROVADO — golden gravado do `index.html` original desta branch + 39 verificações de UX (confirmação nativa, E-STOP pela tecla E com 0 comandos e `/estop=1`, envio bloqueado no E-STOP, rearme `/estop=0`, vistas, seleção/destaque, telemetria, WebXR, mãos, performance, pixel do tema).
- O `index.html` original desta branch também passa na mesma suíte (todas as verificações aplicáveis).
- `qa.mjs`: axe-core WCAG 2.1 AA sem violações (5 abas, E-STOP, ajuda, apresentação), teclado, responsividade (sem sobreposição no cabeçalho de 1100 a 1920 px), contraste.
- Benchmark: original 19,0/19,8 pub/s · 2,1–2,2 fps × port 19,8/19,5 pub/s · 2,1–2,2 fps.
