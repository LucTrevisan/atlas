/*
 * Braço robótico 5 servos — ESP32 + PCA9685 + MQTT
 * Bibliotecas (Gerenciador do Arduino): PubSubClient, ArduinoJson (v7), Adafruit PWM Servo Driver.
 * Placa: ESP32 Dev Module. I2C: SDA=21, SCL=22. Alimente os servos com fonte 5–6 V externa (GND comum!).
 *
 * Tópicos:  <PREFIX>/cmd     (site → ESP32)  {"waist":..,"shoulder":..,"elbow":..,"pitch":..,"grip":..}  em graus
 *           <PREFIX>/estado  (ESP32 → site)  mesmo JSON, com a posição atual dos servos (ângulos do modelo)
 * Ângulo 0 = pose original do modelo 3D (braço inclinado ~48°). Calibre OFFSET/SIGN na bancada.
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ---------- CONFIGURE ----------
const char* WIFI_SSID = "SUA_REDE";
const char* WIFI_PASS = "SUA_SENHA";
const char* MQTT_HOST = "192.168.0.10";   // IP/host do broker (porta TCP 1883)
const int   MQTT_PORT = 1883;
const char* MQTT_USER = "";               // vazio = sem autenticação
const char* MQTT_PASS = "";
const char* PREFIX    = "braco";

const int   N = 5;
const char* KEYS[N]   = {"waist","shoulder","elbow","pitch","grip"};
const int   CH[N]     = {0, 1, 2, 3, 4};          // canal do PCA9685 de cada servo
// servo_graus = OFFSET + SIGN * angulo_do_modelo   (CALIBRE: OFFSET = ângulo do servo quando o braço real está na pose do modelo)
float OFFSET[N]       = {90, 90, 90, 90, 90};
float SIGN[N]         = { 1,  1,  1,  1,  1};     // troque para -1 se o servo girar ao contrário
float SMIN[N]         = {10, 20, 10, 10, 30};     // limites MECÂNICOS do servo (graus) — ajuste para não forçar
float SMAX[N]         = {170,160,170,170,150};
const float MAX_SPEED = 120.0;                    // graus/segundo (suaviza o movimento)
const unsigned long WATCHDOG_MS = 800;            // sem comando por este tempo => segura a posição
const int   US_MIN = 500, US_MAX = 2500;          // largura de pulso (SG90/MG996R: 500–2500 µs)
// --------------------------------

Adafruit_PWMServoDriver pwm;
WiFiClient net; PubSubClient mq(net);
float target[N], cur[N];        // graus do SERVO
float model[N] = {0};           // ângulos do modelo (para publicar)
unsigned long lastCmd = 0, lastPub = 0, lastLoop = 0, lastRetry = 0;

void writeServo(int i, float deg) {
  deg = constrain(deg, SMIN[i], SMAX[i]);
  float us = US_MIN + (US_MAX - US_MIN) * deg / 180.0;
  pwm.setPWM(CH[i], 0, (uint16_t)(us * 4096.0 / 20000.0));   // 50 Hz => período 20000 µs
}

void onMsg(char*, byte* p, unsigned n) {
  JsonDocument d;
  if (deserializeJson(d, p, n)) return;
  for (int i = 0; i < N; i++) {
    if (d[KEYS[i]].is<float>()) {
      float a = d[KEYS[i]];
      model[i] = a;
      target[i] = constrain(OFFSET[i] + SIGN[i] * a, SMIN[i], SMAX[i]);
    }
  }
  lastCmd = millis();
}

void connectMqtt() {
  if (mq.connected() || millis() - lastRetry < 3000) return;
  lastRetry = millis();
  String id = "esp32-braco-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  bool ok = strlen(MQTT_USER) ? mq.connect(id.c_str(), MQTT_USER, MQTT_PASS) : mq.connect(id.c_str());
  if (ok) { mq.subscribe((String(PREFIX) + "/cmd").c_str()); Serial.println("MQTT ok"); }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  pwm.begin(); pwm.setOscillatorFrequency(27000000); pwm.setPWMFreq(50);
  for (int i = 0; i < N; i++) { cur[i] = target[i] = OFFSET[i]; writeServo(i, cur[i]); }  // começa na pose de calibração
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println(WiFi.localIP());
  mq.setServer(MQTT_HOST, MQTT_PORT); mq.setCallback(onMsg); mq.setBufferSize(512);
  lastLoop = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); delay(500); return; }
  connectMqtt(); mq.loop();

  unsigned long now = millis(); float dt = (now - lastLoop) / 1000.0; lastLoop = now;
  bool alive = (now - lastCmd) < WATCHDOG_MS;            // watchdog: sem comando => não move
  for (int i = 0; i < N; i++) {
    if (alive) {
      float step = MAX_SPEED * dt, diff = target[i] - cur[i];
      cur[i] += constrain(diff, -step, step);            // limita velocidade
    }
    writeServo(i, cur[i]);
  }
  if (mq.connected() && now - lastPub > 100) {           // publica estado a 10 Hz
    lastPub = now;
    JsonDocument d;
    for (int i = 0; i < N; i++) d[KEYS[i]] = round((SIGN[i] * (cur[i] - OFFSET[i])) * 10) / 10.0;
    char buf[192]; size_t n = serializeJson(d, buf);
    mq.publish((String(PREFIX) + "/estado").c_str(), (const uint8_t*)buf, n);
  }
  delay(5);
}
