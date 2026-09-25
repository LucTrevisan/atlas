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
