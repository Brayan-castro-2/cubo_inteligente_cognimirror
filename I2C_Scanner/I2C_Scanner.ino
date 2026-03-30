/*
 * Detector de Conexión I2C en Tiempo Real
 * ¡ESCANEA MUY RÁPIDO para encontrar la posición correcta!
 * Cuando veas "✓✓✓ CONECTADO ✓✓✓" - ¡ESA ES LA POSICIÓN PARA SOLDAR!
 */

#include <Wire.h>

#define SDA_PIN 21
#define SCL_PIN 22
#define LED_PIN 2

unsigned long scanCount = 0;
unsigned long foundCount = 0;
unsigned long lastFoundTime = 0;
bool wasConnected = false;

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.println("");
  Serial.println("=====================================================");
  Serial.println("   DETECTOR DE CONEXION I2C EN TIEMPO REAL");
  Serial.println("=====================================================");
  Serial.println("   SDA: P21  |  SCL: P22");
  Serial.println("   Mueve los cables hasta ver ✓✓✓ CONECTADO ✓✓✓");
  Serial.println("   El LED se ENCENDERA cuando detecte el sensor");
  Serial.println("=====================================================");
  Serial.println("");
}

void loop() {
  scanCount++;

  // Escanear dirección 0x68 (MPU6050)
  Wire.beginTransmission(0x68);
  byte error = Wire.endTransmission();

  bool isConnected = (error == 0);

  if (isConnected) {
    foundCount++;
    lastFoundTime = millis();
    digitalWrite(LED_PIN, HIGH); // LED ENCENDIDO

    if (!wasConnected) {
      // ¡ACABA DE CONECTARSE!
      Serial.println("");
      Serial.println("╔═══════════════════════════════════════════════════╗");
      Serial.println("║  ✓✓✓ CONECTADO ✓✓✓  ¡MANTÉN ESA POSICIÓN!        ║");
      Serial.println("╚═══════════════════════════════════════════════════╝");
    }

    // Mostrar cada 100ms mientras está conectado
    Serial.print("✓ SENSOR OK  |  Tiempo conectado: ");
    Serial.print((millis() - lastFoundTime) / 1000.0, 1);
    Serial.print("s  |  Escaneos: ");
    Serial.print(scanCount);
    Serial.print("  |  Éxitos: ");
    Serial.println(foundCount);

    wasConnected = true;
  } else {
    digitalWrite(LED_PIN, LOW); // LED APAGADO

    if (wasConnected) {
      // ¡SE DESCONECTÓ!
      Serial.println("");
      Serial.println("╔═══════════════════════════════════════════════════╗");
      Serial.println("║  ✗✗✗ DESCONECTADO ✗✗✗  ¡SE PERDIÓ LA CONEXIÓN!   ║");
      Serial.println("╚═══════════════════════════════════════════════════╝");
      Serial.println("");
    }

    // Mostrar cada 500ms mientras está desconectado
    if (scanCount % 5 == 0) {
      Serial.print("... buscando sensor (escaneo #");
      Serial.print(scanCount);
      Serial.println(")");
    }

    wasConnected = false;
  }

  // Escanear cada 100ms para respuesta rápida
  delay(100);
}
