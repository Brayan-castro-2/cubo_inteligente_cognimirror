'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const SERVICE_UUID    = '12345678-1234-5678-1234-56789abcdef0';
// const CHAR_LED_UUID   = '12345678-1234-5678-1234-56789abcdef1';
const CHAR_GYRO_UUID  = 'beb5483e-36e1-4688-b7f5-ea07361b26a9';

// Creamos el contexto
const BluetoothContext = createContext(null);

export function BluetoothProvider({ children }) {
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [latencyOffset, setLatencyOffset] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState(null); // { ble, render, total }
  
  // --- EXPERT GYRO STATES ---
  const [gyroOffset, setGyroOffset] = useState({ x: 0, y: 0, z: 0 });
  const [gyroConfig, setGyroConfig] = useState({
    invertX: true, 
    invertY: true, 
    invertZ: false,
    swapXY: true,
    swapYZ: true,
    swapXZ: false
  });
  const currentRawGyro = useRef({ x: 0, y: 0, z: 0 });
  
  // Refs para evitar el problema de 'stale closure' en el listener de Bluetooth
  const gyroConfigRef = useRef(gyroConfig);
  const gyroOffsetRef = useRef(gyroOffset);

  useEffect(() => { gyroConfigRef.current = gyroConfig; }, [gyroConfig]);
  useEffect(() => { gyroOffsetRef.current = gyroOffset; }, [gyroOffset]);

  // Cargar offset guardado al montar
  useEffect(() => {
    const saved = parseInt(localStorage.getItem('SYSTEM_LATENCY_OFFSET') || '0', 10);
    if (saved > 0) setLatencyOffset(saved);
  }, []);
  
  // Guardamos las referencias al servidor BLE internamente
  const serverRef = useRef(null);
  const batIntervalRef = useRef(null);

  // Almacena callbacks de los componentes hijos que quieren enterarse de los movimientos
  const moveListenersRef = useRef(new Set());
  const lastPacketFingerprint = useRef(""); // Para deduplicación por huella digital bit-a-bit
  const gyroListenersRef = useRef(new Set());
  const moveCompleteListenersRef = useRef(new Set()); // Paquete 2: ejecución motora completa

  // ─── Protocolo de Doble Paquete del Rubik's Connected ───────────────────
  // Paquete 1: cara comienza a girar (primer umbral de rotación detectado)
  // Paquete 2: cara encaja en posición final (segundo umbral)
  // Delta = Tiempo de Ejecución Motora (TEM) → métrica clínica nueva
  const pendingMoveRef = useRef({ moveId: -1, notation: null, ts: 0 });
  const BLE_MOTOR_WINDOW_MS = 120; // Ajustado: Ventana justa para cazar el encaje mecánico sin comerse giros rápidos consecutivos (speedcubing)

  const subscribeToMoves = useCallback((callback) => {
    moveListenersRef.current.add(callback);
    return () => moveListenersRef.current.delete(callback);
  }, []);

  // subscribeToMoveComplete: recibe { notation, motorExecutionMs } cuando la cara termina de girar
  const subscribeToMoveComplete = useCallback((callback) => {
    moveCompleteListenersRef.current.add(callback);
    return () => moveCompleteListenersRef.current.delete(callback);
  }, []);

  const subscribeToGyro = useCallback((callback) => {
    gyroListenersRef.current.add(callback);
    return () => gyroListenersRef.current.delete(callback);
  }, []);

  // Emisores internos
  const broadcastMove = (notation) => {
    moveListenersRef.current.forEach(cb => cb(notation));
  };
  const broadcastMoveComplete = (notation, motorExecutionMs) => {
    moveCompleteListenersRef.current.forEach(cb => cb({ notation, motorExecutionMs }));
  };
  const broadcastGyro = (data) => {
    gyroListenersRef.current.forEach(cb => cb(data));
  };

  // Handler para giroscopio (ESP32 / CogniMirror Custom HW)
  const handleGyroData = (event) => {
    try {
      const b = event.target.value;
      const str = new TextDecoder().decode(b);
      // El sensor envía JSON: {"x": 0.0, "y": 0.0, "z": 0.0}
      const rawData = JSON.parse(str);
      
      if (rawData && typeof rawData.x === 'number') {
        // 1. Guardar en Ref para calibración instantánea
        currentRawGyro.current = rawData;

        // 2. Aplicar Offset para 'Punto Cero' (Usando ref para tiempo real)
        const xWithOffset = rawData.x - gyroOffsetRef.current.x;
        const yWithOffset = rawData.y - gyroOffsetRef.current.y;
        const zWithOffset = rawData.z - gyroOffsetRef.current.z;

        // 3. --- ZONA DE MAPEO DINÁMICA (CONTROLADA DESDE UI) ---
        let rx = xWithOffset;
        let ry = yWithOffset;
        let rz = zWithOffset;

        const config = gyroConfigRef.current;

        // Swapping (Permutaciones)
        if (config.swapXY) [rx, ry] = [ry, rx];
        if (config.swapYZ) [ry, rz] = [rz, ry];
        if (config.swapXZ) [rx, rz] = [rz, rx];
        
        // Inversiones
        const finalX = rx * (config.invertX ? -1 : 1);
        const finalY = ry * (config.invertY ? -1 : 1);
        const finalZ = rz * (config.invertZ ? -1 : 1);
        // -----------------------------------------------------

        broadcastGyro({ x: finalX, y: finalY, z: finalZ });
      }
    } catch(e) {
      // Ignorar basura serial/BLE parcial
    }
  };

  const calibrateGyro = useCallback(() => {
    console.log("⚓ Calibrando punto cero con:", currentRawGyro.current);
    setGyroOffset({ ...currentRawGyro.current });
  }, []);

  // Handler para movimientos físicos del cubo
  const processValidatedMove = (moveId, subBuffer) => {
    // DEDUPLICACIÓN POR HUELLA DIGITAL (Bit-level fingerprinting)
    // El búfer contiene un timer/contador. Si el paquete es idéntico al anterior, 
    // es una retransmisión de Bluetooth. Si cambia un bit, es un nuevo giro (ej. U2).
    const fingerprint = Array.from(subBuffer).join(',');
    if (lastPacketFingerprint.current === fingerprint) {
      // Ignorar duplicado idéntico de red
      return;
    }
    lastPacketFingerprint.current = fingerprint;

    const faces = ["B", "F", "U", "D", "R", "L"];
    const faceName = faces[Math.floor(moveId / 2)];
    if (faceName) {
      const modifier = (moveId % 2 !== 0) ? "'" : "";
      const finalMove = faceName + modifier;
      console.log(`[⚡ SPEEDCUBE MOVE]: ${finalMove} (ID: ${moveId})`);
      broadcastMove(finalMove);
    }
  };

  const handleRubiksData = (event) => {
    const dv = event.target.value;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x2a) { // Start '*' (42)
        const type = bytes[i + 1];
        
        if (type === 6) {
          const sub = bytes.slice(i, i + 8);
          if (sub.length >= 4) {
            processValidatedMove(sub[3], sub);
          }
          i += 7;
        } else if (type === 8) {
          if (bytes[i + 2] === 1) { // Multi-move pulse
            const sub = bytes.slice(i, i + 10);
            processValidatedMove(sub[3], sub); // Primer giro de la ráfaga
            if (sub[5] >= 0 && sub[5] <= 11 && sub[5] !== sub[3]) {
              processValidatedMove(sub[5], sub); // Segundo giro (si existe)
            }
          }
          i += 9;
        }
      }
    }
  };

  const onDisconnected = useCallback(() => {
    setIsConnected(false);
    setDevice(null);
    setBatteryLevel(null);
    serverRef.current = null;
    if (batIntervalRef.current) clearInterval(batIntervalRef.current);
    console.log("Cubo desconectado.");
  }, []);

  const connectBLE = async () => {
    if (isConnected) return;
    setIsConnecting(true);

    try {
      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'CogniMirror' },
          { namePrefix: 'Rubiks' },
          { namePrefix: 'GoCube' }
        ],
        optionalServices: [
          SERVICE_UUID,
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
          '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
        ]
      });

      const bleServer = await bleDevice.gatt.connect();
      serverRef.current = bleServer;

      // Dependiendo de la marca del cubo abrimos los servicios
      if (bleDevice.name.includes('CogniMirror')) {
        const svc = await bleServer.getPrimaryService(SERVICE_UUID);
        const gyroChar = await svc.getCharacteristic(CHAR_GYRO_UUID);
        await gyroChar.startNotifications();
        gyroChar.addEventListener('characteristicvaluechanged', handleGyroData);
      } else {
        // Rubik's Connected / GoCube
        const svc = await bleServer.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
        const notifyChar = await svc.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e');
        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', handleRubiksData);
      }

      // Servicio estándar de batería
      try {
        const batSvc = await bleServer.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
        const batChar = await batSvc.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
        const updateBatteryLevel = async () => {
          try {
            const v = await batChar.readValue();
            setBatteryLevel(v.getUint8(0));
          } catch(e){}
        };
        await updateBatteryLevel();
        if (batIntervalRef.current) clearInterval(batIntervalRef.current);
        batIntervalRef.current = setInterval(updateBatteryLevel, 30000);
      } catch(e) {
        // El cubo no soporta polling de batería (ignorar)
      }

      bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
      
      setDevice(bleDevice.name);
      setIsConnected(true);

    } catch (e) {
      console.warn("Error en conexión BLE:", e);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectBLE = () => {
    if (serverRef.current) {
      serverRef.current.device.gatt.disconnect();
    }
  };

  // ── Calibración de Latencia de Hardware ─────────────────────
  const measureHardwareLatency = useCallback(async () => {
    setIsCalibrating(true);
    setCalibrationResult(null);

    // 1) BLE Ping: leer batería como operación de referencia
    let bleRtt = 60; // fallback si no hay servicio de batería
    if (serverRef.current) {
      try {
        const t0 = performance.now();
        const batSvc = await serverRef.current.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
        const batChar = await batSvc.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
        await batChar.readValue();
        bleRtt = performance.now() - t0;
      } catch (e) {
        console.warn('BLE ping sin servicio batería, usando fallback de 60ms RTT');
      }
    }
    const bleLatency = Math.round(bleRtt / 2);

    // 2) Render Lag: doble RAF = tiempo de un ciclo de pintado completo
    const renderLatency = await new Promise((resolve) => {
      const t0 = performance.now();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(Math.round(performance.now() - t0));
        });
      });
    });

    const total = bleLatency + renderLatency;
    localStorage.setItem('SYSTEM_LATENCY_OFFSET', String(total));
    setLatencyOffset(total);
    const result = { ble: bleLatency, render: renderLatency, total };
    setCalibrationResult(result);
    setIsCalibrating(false);
    console.log('✅ Calibración completada:', result);
    return result;
  }, []);

  const value = {
    connectBLE,
    disconnectBLE,
    isConnected,
    isConnecting,
    device,
    batteryLevel,
    subscribeToMoves,
    subscribeToMoveComplete, // ⏱ Nueva API: TEM (Tiempo de Ejecución Motora)
    subscribeToGyro,
    broadcastMove,
    // Calibración de latencia
    measureHardwareLatency,
    latencyOffset,
    isCalibrating,
    calibrationResult,
    // Calibración de Hardware (Giroscopio)
    calibrateGyro,
    gyroOffset,
    gyroConfig,
    setGyroConfig,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
}

// Hook personalizado para consumir la API fácilmente
export function useBluetoothCube() {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetoothCube debe ser usado dentro de un BluetoothProvider');
  }
  return context;
}
