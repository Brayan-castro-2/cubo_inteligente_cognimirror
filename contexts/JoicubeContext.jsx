'use client';
/**
 * JoicubeContext — Modo Joystick integrado
 * ══════════════════════════════════════════════════════
 * Arquitectura 0-fricción:
 *
 *   Cubo BLE → Browser (SIEMPRE, sin desconectar)
 *     ├─ Cubo 3D (como siempre)
 *     ├─ Test clínico (como siempre)
 *     └─ [Joicube ON] → WS → cube_keys.py → OS teclas → juego
 *
 * El BLE NUNCA se desconecta.
 * Python solo inyecta teclas. No maneja BLE.
 *
 * Para usar el modo joystick:
 *   1. Ejecuta UNA vez: python scripts/cube_keys.py
 *   2. Conecta el cubo normalmente desde el dashboard
 *   3. Click en Joicube → activo
 */

import React, {
  createContext, useContext, useState, useRef,
  useCallback, useEffect
} from 'react';
import { useBluetoothCube } from './BluetoothContext';

const WS_URL = 'ws://localhost:8765/ws';

const JoicubeContext = createContext(null);

export function JoicubeProvider({ children }) {
  // Solo necesitamos subscribeToMoves — el BLE sigue conectado siempre
  const { subscribeToMoves } = useBluetoothCube();

  // 'idle' | 'connecting' | 'active' | 'no_server'
  const [status, setStatus]   = useState('idle');
  const [errorMsg, setErrorMsg] = useState(null);
  
  // Perfiles multijuego
  const [profiles, setProfiles] = useState(['GEOMETRY_DASH']);
  const [currentProfile, setCurrentProfile] = useState('GEOMETRY_DASH');

  const wsRef       = useRef(null);
  const unsubRef    = useRef(null);  // Para desuscribir BLE cuando se desactiva
  const statusRef   = useRef('idle');

  const _setStatus = useCallback((v) => {
    statusRef.current = v;
    setStatus(v);
  }, []);

  // ── Enviar movimiento al servidor de teclas ──────────────────
  const sendMove = useCallback((notation) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      wsRef.current.send(JSON.stringify({ type: 'move', notation }));
    } catch (e) {
      console.error('🕹️ [Joicube] Error enviando move:', e);
    }
  }, []);

  // ── Desactivar ───────────────────────────────────────────────
  const deactivate = useCallback(() => {
    // Desuscribir del feed BLE de joystick
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    // Decirle a Python que suelte todas las teclas
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'release_all' })); } catch { }
      wsRef.current.close();
    }
    wsRef.current = null;

    _setStatus('idle');
    setErrorMsg(null);
  }, [_setStatus]);

  // ── Activar ──────────────────────────────────────────────────
  const activate = useCallback(() => {
    if (statusRef.current === 'active' || statusRef.current === 'connecting') return;
    _setStatus('connecting');
    setErrorMsg(null);

    // Intentar conectar al servidor de teclas Python
    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      _setStatus('no_server');
      setErrorMsg('Ejecuta: python scripts/cube_keys.py');
      return;
    }

    wsRef.current = ws;

    ws.onopen = async () => {
      _setStatus('active');
      console.log('🕹️ [Joicube] Conectado al servidor de teclas');

      // Obtener lista de perfiles desde el servidor HTTP
      try {
        const res = await fetch('http://localhost:8765/status');
        const data = await res.json();
        if (data.profiles) setProfiles(data.profiles);
        if (data.profile) setCurrentProfile(data.profile);
      } catch (e) {
        console.warn('🕹️ [Joicube] No se pudo obtener perfiles', e);
      }

      // Suscribirse al feed BLE y reenviar cada movimiento al server de teclas
      // (La suscripción es ADICIONAL al pipeline normal — el cubo 3D sigue funcionando)
      unsubRef.current = subscribeToMoves((notation) => {
        sendMove(notation);
      });
    };

    ws.onerror = () => {
      _setStatus('no_server');
      setErrorMsg('Ejecuta: python scripts/cube_keys.py');
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      wsRef.current = null;
    };

    ws.onclose = () => {
      if (statusRef.current === 'active') {
        // Cierre inesperado
        if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
        _setStatus('idle');
        console.warn('🕹️ [Joicube] Conexión perdida');
      }
    };
  }, [_setStatus, subscribeToMoves, sendMove]);

  // ── Toggle ───────────────────────────────────────────────────
  const toggle = useCallback(() => {
    if (statusRef.current === 'active') {
      deactivate();
    } else {
      activate();
    }
  }, [activate, deactivate]);

  // ── Cambiar Perfil ───────────────────────────────────────────
  const changeProfile = useCallback(async (newProfile) => {
    setCurrentProfile(newProfile);
    try {
      await fetch('http://localhost:8765/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: newProfile })
      });
    } catch (e) {
      console.error('Error cambiando perfil de Joicube:', e);
    }
  }, []);

  // Auto-cleanup
  useEffect(() => () => { deactivate(); }, [deactivate]);

  return (
    <JoicubeContext.Provider value={{
      status, errorMsg, toggle, activate, deactivate,
      profiles, currentProfile, changeProfile
    }}>
      {children}
    </JoicubeContext.Provider>
  );
}

export function useJoicube() {
  const ctx = useContext(JoicubeContext);
  if (!ctx) throw new Error('useJoicube debe usarse dentro de JoicubeProvider');
  return ctx;
}
