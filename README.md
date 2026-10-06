# Braço Robótico VR + MQTT (Babylon.js + ESP32)

## Arquivos
- `index.html` – app (Babylon.js 7.30, mqtt.js 5.10.1 via jsDelivr). Coloque **`braco.glb` na mesma pasta**.
- `braco.glb` – modelo.
- `esp32_braco/esp32_braco.ino` – firmware (ESP32 + PCA9685, 5 servos).

## 1. Publicar o site (HTTPS obrigatório para WebXR)
GitHub Pages: crie um repositório, envie `index.html` e `braco.glb`, ative *Settings → Pages → Deploy from branch*.
Netlify/Vercel: arraste a pasta. Abra a URL `https://...` no **Meta Quest Browser**.
`file://` não funciona (CORS no .glb e WebXR exige HTTPS).

## 2. Broker MQTT
O navegador só fala **MQTT sobre WebSocket seguro (`wss://`)**; o ESP32 fala MQTT comum. Use um broker com os dois:
- **HiveMQ Cloud / EMQX Cloud** (plano grátis): usa `wss://HOST:8884/mqtt` no site e `HOST:8883` (TLS) ou 1883 no ESP32.
  Se usar 8883 no ESP32, troque `WiFiClient` por `WiFiClientSecure` (+ `setInsecure()` ou o certificado da CA).
- **Mosquitto próprio**: `listener 1883` e `listener 9001` + `protocol websockets`, com TLS (Caddy/nginx/Let's Encrypt) na frente do 9001.
Sempre use usuário/senha e ACL para os tópicos `braco/#`.

## 3. Uso
1. Abra o site → *MQTT / ESP32* → URL `wss://…`, usuário, senha, prefixo → **Conectar**.
2. **Enviar comandos ao robô real** = o gêmeo digital comanda o robô. **Espelhar estado** = o robô real comanda o modelo.
3. **Em VR (hand tracking, sem controles)**: a **mão direita** posiciona o pulso do robô; a abertura entre polegar e indicador controla a **garra**;
   **pinça da mão esquerda = habilita o movimento** (solte para parar). Ative "Enviar comandos" antes de colocar o headset.
   No Quest: Configurações → Movimento e controladores → *Rastreamento de mãos* ligado.

## 4. Calibração (importante)
- O ângulo `0` de cada junta é a **pose do modelo 3D** (ombro ~48° acima da horizontal, cotovelo reto).
  Ponha o braço físico nessa pose e anote o ângulo de cada servo → `OFFSET[]` no `.ino`. Ajuste `SIGN[]` e `SMIN/SMAX`.
- Teste primeiro **sem a garra/braço presos** e com fonte adequada. O ESP32 já limita velocidade (120°/s), faixa e tem watchdog (800 ms).
- Parâmetros do humano/IK no topo do script (`CFG`): `humanReach` (alcance do seu braço, m), `shoulderSide/Down` (posição do ombro em relação à cabeça).
- O modelo tem rotação de pulso fixa (5 servos); a IK a endireita automaticamente (`roll0`).

## Payload
`braco/cmd` e `braco/estado`: `{"waist":12.5,"shoulder":-8,"elbow":40,"pitch":-5,"grip":18}` (graus).

---

# ATLAS — Robotic Digital Twin (interface v10)

Interface refatorada em 10 etapas **sem alterar a lógica de movimentação** (o script principal do `index.html` é idêntico ao original — ver [MOVEMENT_BASELINE.md](MOVEMENT_BASELINE.md) e [CHANGELOG.md](CHANGELOG.md)).

## Navegação
| Aba | Conteúdo |
|---|---|
| **Digital Twin** | leitura J1–J4/Garra, destaque por articulação, marcadores no modelo, aparência (ambiente Digital Twin / laboratório; cores do robô físico / modelo) |
| **Controle** | sliders existentes (limites reais, garra 0 = fechada → 30 = aberta), Demo, Zerar; cartão da articulação selecionada |
| **Telemetria** | MQTT, ESP32 (online pelo `<prefixo>/estado`), comando × robô real por junta, último pacote, taxa |
| **WebXR** | diagnóstico (HTTPS, WebXR, sessão VR, hand tracking), Entrar em VR, legenda dos estados das mãos, pré-visualização do painel do headset |
| **Configurações** | broker MQTT, modo de operação (enviar comandos / espelhar), tópicos |

- **Controle real**: marcar "Enviar comandos ao robô real" pede confirmação; o header mostra `● CONTROLE REAL HABILITADO` enquanto ativo.
- **Clique numa peça** do braço (ou no marcador J1…GARRA) seleciona a articulação e foca o slider; mover um slider destaca a peça.
- **Em VR**: painel compacto ao lado do braço com modo, mãos (procurando → detectadas → controle armado → movimento ativo), articulações, MQTT e ESP32.
- Não existem (não foram inventados): E-STOP, posição Home distinta de Zero, presets, vistas fixas de câmera.

## Testes automatizados (`tests/movement`)
```bash
cd tests/movement
npm install
npm test          # anti-regressão do movimento (golden de 9 626 valores) + verificações de UX — exit 1 se algo mudar
node qa.mjs       # acessibilidade (axe-core WCAG 2.1 AA), teclado, responsividade, contraste → qa-out/
node bench.mjs    # taxa efetiva de publish MQTT e FPS (10 s)
```
Requer Google Chrome instalado (ou `CHROME_PATH`). O teste reprova com qualquer erro de JavaScript na página.

## Validação manual obrigatória (não automatizável)
```text
META QUEST
[ ] Entrar em VR pelo botão do painel WebXR (ou 🥽)
[ ] Painel do headset aparece ao lado do braço, legível
[ ] Sem mãos → "PROCURANDO MÃOS"; mãos → "MÃOS DETECTADAS"
[ ] Pinça esquerda → "CONTROLE ARMADO"; + mão direita → "MOVIMENTO ATIVO" e o braço segue a mão
[ ] Soltar a pinça para o movimento; abertura polegar–indicador controla a garra
[ ] Instruções somem após alguns segundos de uso
HARDWARE (broker + ESP32)
[ ] Conectar → "MQTT ● conectado"; ESP32 publicando → "ESP32 ● online"
[ ] Telemetria: coluna "Robô real" acompanha o comando (rampa 120 °/s)
[ ] Enviar comandos: confirmação → robô físico segue sliders/Demo/Zerar
[ ] Desmarcar "Enviar comandos": robô congela após 800 ms (watchdog do firmware)
[ ] Espelhar estado: o Digital Twin segue o robô físico
```
