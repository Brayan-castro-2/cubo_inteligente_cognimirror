/*
 * CogniMirror Cube v3.0 - BLE + MPU6050 (Sin librería Adafruit)
 * Usa Wire.h directamente para evitar problemas de inicialización
 */

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Wire.h>


// Pines I2C
#define SDA_PIN 21
#define SCL_PIN 22
#define LED_PIN 2
#define MPU_ADDR 0x68

// UUIDs BLE
#define SERVICE_UUID "12345678-1234-5678-1234-56789abcdef0"
#define CHARACTERISTIC_LED_UUID "12345678-1234-5678-1234-56789abcdef1"
#define CHARACTERISTIC_GYRO_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a9"

// Objetos BLE
BLEServer *pServer = NULL;
BLECharacteristic *pLedCharacteristic = NULL;
BLECharacteristic *pGyroCharacteristic = NULL;

// Variables de estado
bool deviceConnected = false;
bool oldDeviceConnected = false;
bool mpuReady = false;

// Timer para envío de datos
unsigned long lastSendTime = 0;
const int SEND_INTERVAL = 50; // 50ms = 20Hz

// Datos del giroscopio
float gyroX, gyroY, gyroZ;

// Callback para conexiones BLE
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true;
    Serial.println("[BLE] ✓ CLIENTE CONECTADO!");
  };

  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
    Serial.println("[BLE] Cliente desconectado");
    delay(500);
    pServer->startAdvertising();
  }
};

// Callback para control del LED
class LedCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    std::string value = pCharacteristic->getValue();
    if (value.length() > 0) {
      if (value[0] == '1') {
        digitalWrite(LED_PIN, HIGH);
        Serial.println("  LED: ENCENDIDO");
      } else if (value[0] == '0') {
        digitalWrite(LED_PIN, LOW);
        Serial.println("  LED: APAGADO");
      }
    }
  }
};

// Verificar si MPU6050 responde
bool checkMPU() {
  Wire.beginTransmission(MPU_ADDR);
  return (Wire.endTransmission() == 0);
}

// Inicializar MPU6050 manualmente (sin Adafruit)
bool initMPU() {
  // Wake up MPU6050 (salir de modo sleep)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0x00); // Wake up
  byte error = Wire.endTransmission();

  if (error != 0)
    return false;

  // Configurar giroscopio a ±500°/s
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1B); // GYRO_CONFIG register
  Wire.write(0x08); // ±500°/s
  Wire.endTransmission();

  // Configurar acelerómetro a ±8g
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C); // ACCEL_CONFIG register
  Wire.write(0x10); // ±8g
  Wire.endTransmission();

  return true;
}

// Leer datos del giroscopio
void readGyro() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x43); // GYRO_XOUT_H register
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  int16_t rawX = Wire.read() << 8 | Wire.read();
  int16_t rawY = Wire.read() << 8 | Wire.read();
  int16_t rawZ = Wire.read() << 8 | Wire.read();

  // Convertir a rad/s (±500°/s = escala 65.5 LSB/°/s)
  gyroX = rawX / 65.5 * (3.14159 / 180.0);
  gyroY = rawY / 65.5 * (3.14159 / 180.0);
  gyroZ = rawZ / 65.5 * (3.14159 / 180.0);
}

// Inicializar BLE
void initBLE() {
  BLEDevice::init("CogniMirror_Cube");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Característica para LED
  pLedCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_LED_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  pLedCharacteristic->setCallbacks(new LedCallbacks());
  pLedCharacteristic->setValue("0");

  // Característica para Gyro (Notify)
  pGyroCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_GYRO_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pGyroCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("[BLE] ✓ Servidor iniciado: CogniMirror_Cube");
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.println("");
  Serial.println("==========================================");
  Serial.println("  CogniMirror Cube v3.0 - BLE + MPU6050");
  Serial.println("  (Sin librería Adafruit - Wire.h directo)");
  Serial.println("==========================================");

  // Inicializar I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);

  // Verificar MPU6050
  Serial.println("[MPU] Buscando sensor...");
  if (checkMPU()) {
    if (initMPU()) {
      mpuReady = true;
      Serial.println("[MPU] ✓ SENSOR CONECTADO Y CONFIGURADO!");
    } else {
      Serial.println("[MPU] Error al configurar sensor");
    }
  } else {
    Serial.println("[MPU] Sensor no encontrado, intentando en loop...");
  }

  // Inicializar BLE
  initBLE();

  Serial.println("");
  Serial.println("Esperando conexion BLE...");
}

void loop() {
  // Si MPU no está listo, intentar reconectar
  if (!mpuReady) {
    static unsigned long lastTry = 0;
    if (millis() - lastTry >= 1000) {
      lastTry = millis();
      if (checkMPU()) {
        if (initMPU()) {
          mpuReady = true;
          Serial.println("[MPU] ✓ SENSOR CONECTADO!");
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
        }
      }
    }
  }

  // Enviar datos si hay cliente BLE conectado y sensor listo
  if (deviceConnected && mpuReady) {
    if (millis() - lastSendTime >= SEND_INTERVAL) {
      lastSendTime = millis();

      // Leer giroscopio
      readGyro();

      // Crear JSON
      char jsonBuffer[100];
      snprintf(jsonBuffer, sizeof(jsonBuffer),
               "{\"x\":%.2f,\"y\":%.2f,\"z\":%.2f}", gyroX, gyroY, gyroZ);

      // Enviar por BLE
      pGyroCharacteristic->setValue(jsonBuffer);
      pGyroCharacteristic->notify();
    }
  }

  // Reconexión BLE
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  delay(10);
}
