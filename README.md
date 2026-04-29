# 🧊 CogniMirror Cube — Smart Rubik's Tracker

> **Plataforma de evaluación neuropsicológica basada en el Cubo de Rubik inteligente**  
> Integración BLE en tiempo real · Análisis cognitivo · Biomarcadores ejecutivos

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Web%20BLE-brightgreen)
![Cube](https://img.shields.io/badge/hardware-Rubik's%20Connected%20%7C%20ESP32-orange)

---

## 📌 ¿Qué es CogniMirror Cube?

CogniMirror transforma el Cubo de Rubik inteligente en una **herramienta de evaluación de funciones ejecutivas**. Mientras la app oficial mide solo velocidad, CogniMirror mide **cómo piensa el usuario** durante el solve.

Las métricas están correlacionadas con la **evaluación de la Función Ejecutiva (Cardoso et al., 2025)**, usando la Fluidez Motora como proxy de Eficiencia Neuronal.

---

## ✨ Características principales

### 🔵 Conectividad BLE
- Conexión directa vía **Web Bluetooth API** (sin instalar apps)
- Compatible con **Rubik's Connected** (`RubiksX_*`)
- Compatible con **prototipo ESP32 + MPU6050**
- Decodificación del protocolo propietario del cubo comercial
- Indicador de **batería BLE** en tiempo real

### ⏱ Cronómetro de solve
- Inicio automático al primer movimiento
- **Auto-pausa** al detectar cubo resuelto
- Tiempo de inactividad acumulado (gaps > 1s)
- Overlay de celebración con tiempo, rotaciones y TPS finales

### 🔀 Scramble Guiado
- Genera una secuencia de 20 movimientos aleatorios
- Guía paso a paso con **letra gigante** indicando cada giro
- Hint de color y dirección (horario / antihorario)
- Avance automático cuando el cubo físico detecta el movimiento correcto
- Navegación manual (Anterior / Siguiente / Cancelar)

### 📊 Estadísticas de sesión
| Métrica | Descripción |
|---|---|
| TPS promedio | Giros por segundo durante el solve |
| TPS máximo | Pico de velocidad puntual |
| Distribución por cara | Gráfica de barras U/D/R/L/F/B |
| Tiempo inactivo | Segundos sin mover el cubo |
| % de inactividad | Proporción del tiempo total parado |

### 🧠 Biomarcadores Cognitivos (Panel Cognitivo)

> *Métricas correlacionadas con la evaluación de la Función Ejecutiva (Cardoso et al., 2025). Análisis de Fluidez Motora como proxy de Eficiencia Neuronal.*

#### 1. Proxy de Eficiencia Neuronal — Jitter de Latencia
- Calcula la **Desviación Estándar** de los tiempos entre movimientos (Inter-Move Latency)
- 🟢 SD baja → flujo automático, bajo ratio Theta/Alpha prefrontal
- 🔴 SD alta → ráfagas erráticas, alta carga cognitiva

#### 2. Flexibilidad Cognitiva — Phase Shifts
- Detecta pausas > 1.5s entre ráfagas de movimientos
- Cada pausa = **Costo de Cambio de Estrategia** en la memoria de trabajo
- Indica cuánto tarda la corteza prefrontal en cambiar de set cognitivo

#### 3. Control Inhibitorio — Taxonomía de Errores
| Tipo | Tiempo | Interpretación |
|---|---|---|
| **Fallo Inhibitorio** | < 400ms | Impulsividad motora: señal prefrontal no alcanzó a inhibir |
| **Fallo Memoria de Trabajo** | 400ms–2000ms | Error detectado tarde tras evaluar el resultado visual |

#### 4. Perfil Ejecutivo Generado
Al finalizar el solve, el sistema clasifica automáticamente al usuario en uno de estos perfiles:
- 🏆 **Ejecutor Automático** — Alta eficiencia sináptica
- 🎯 **Apresurado Inhibido** — Ansiedad de rendimiento
- 🧩 **Estratega Flexible** — Buena memoria de trabajo
- 🔄 **Alto Costo de Cambio** — Déficit de flexibilidad cognitiva
- ⚡ **Patrón Variable** — Alta carga cognitiva espacial

---

## 🚀 Cómo usar

### Requisitos
- Navegador **Google Chrome** o Edge (Web Bluetooth)
- Cubo **Rubik's Connected** (`RubiksX_*`) **O** placa ESP32 con MPU6050
- Bluetooth activado en el sistema

### Pasos
1. Abrir `cube_ble_control.html` en Chrome
2. Click en **"Conectar cubo"** (esquina superior derecha)
3. Seleccionar el dispositivo `RubiksX_*` o `CogniMirror_Cube`
4. *(Opcional)* Usar **Scramble Guiado** para mezclar el cubo
5. ¡Resolver! Las métricas se registran en tiempo real
6. Al terminar, ver el **Panel 🧠 Cognitivo** para el análisis

---

## 📁 Estructura del proyecto

```
cubo_inteligente_cognimirror/
│
├── cube_ble_control.html        # App principal (UI + BLE + análisis)
├── esp32_serial_monitor.html    # Monitor serial para prototipo ESP32
│
├── CogniMirror_Cubo/
│   └── CogniMirror_Cubo.ino    # Firmware ESP32 (Arduino)
│
├── esp32_ble_project/           # Proyecto PlatformIO alternativo
│   └── platformio.ini
│
└── I2C_Scanner/
    └── I2C_Scanner.ino          # Utilidad para verificar MPU6050
```

---

## 🔬 Base científica

Este proyecto implementa métricas basadas en:

- **Cardoso et al. (2025)** — Evaluación de Funciones Ejecutivas mediante tareas de resolución espacial
- **Control Inhibitorio** — Medición de tiempos de reacción motora (< 400ms) como indicador de fallos prefrontales
- **Memoria de Trabajo** — Análisis de latencias de corrección como proxy de actualización del buffer fonológico-espacial
- **Flexibilidad Cognitiva** — Phase Transitions como indicador del Set-Shifting Cost

---

## 🛠 Hardware ESP32 (opcional)

Si no tienes el cubo comercial, puedes usar un ESP32 con MPU6050:

| Pin ESP32 | Conexión |
|---|---|
| GPIO 21 | SDA del MPU6050 |
| GPIO 22 | SCL del MPU6050 |
| GPIO 2  | LED indicador |
| 3.3V / GND | Alimentación MPU6050 |

Flashing del firmware con Arduino IDE o PlatformIO.

---

## 🗺 Roadmap

- [ ] Exportar sesión completa a PDF/JSON
- [ ] Comparativa entre sesiones (progresión cognitiva)
- [ ] Modo evaluador con perfil de paciente
- [ ] Integración con plataforma web CogniMirror (Supabase)
- [ ] Soporte para más cubos inteligentes (GoCube, GAN Smart)

---

## 📄 Licencia

MIT License — Ver `LICENSE.txt`

---

*Desarrollado por el equipo **CogniMirror** como herramienta de evaluación neuropsicológica basada en Cubo de Rubik inteligente.*
https://ko-fi.com/joicube
