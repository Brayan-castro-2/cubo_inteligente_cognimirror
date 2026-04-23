import { useState, useRef, useCallback } from 'react';

/**
 * Hook para manejar la lógica de "Modo Armar" (Solve Mode)
 * Calcula latencias reales, TPS, Tiempos de Pausa sin saturar el render de React.
 */
export function useSolveMode() {
  const [isSolveModeActive, setSolveModeActive] = useState(false);
  const [sessionResults, setSessionResults] = useState(null);

  // Usamos Refs para datos mutables de alta frecuencia (evita re-renders)
  const stateRef = useRef({
    isActive: false,
    hasStarted: false,
    startTime: 0,
    endTime: 0,
    lastMoveTime: 0,
    maxPauseMs: 0,
    moves: 0
  });

  // 1. Activar / Desactivar el Modo
  const toggleSolveMode = useCallback(() => {
    setSolveModeActive((prev) => {
      const nextActive = !prev;
      stateRef.current.isActive = nextActive;
      
      // Si estamos activándolo, reseteamos el estado
      if (nextActive) {
        stateRef.current.hasStarted = false;
        stateRef.current.startTime = 0;
        stateRef.current.endTime = 0;
        stateRef.current.lastMoveTime = 0;
        stateRef.current.maxPauseMs = 0;
        stateRef.current.moves = 0;
        setSessionResults(null);
      }
      return nextActive;
    });
  }, []);

  // 2. Formatear la pausa prolongada MMS:SS.mmm
  const formatMs = (ms) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  };

  // 3. Manejador para CADA movimiento físico (onMove)
  const handleMove = useCallback(() => {
    const s = stateRef.current;
    if (!s.isActive) return;

    const now = performance.now();

    // Auto-Start en el primer movimiento
    if (!s.hasStarted) {
      s.hasStarted = true;
      s.startTime = now;
      s.lastMoveTime = now;
      s.moves = 1;
      return;
    }

    // Calcular pausa (tiempo desde el ÚLTIMO movimiento)
    const pause = now - s.lastMoveTime;
    if (pause > s.maxPauseMs) {
      s.maxPauseMs = pause;
    }

    s.lastMoveTime = now;
    s.moves += 1;
  }, []);

  // 4. Auto-Stop (cuando el cubo emite 'isSolved')
  const handleSolved = useCallback(() => {
    const s = stateRef.current;
    if (!s.isActive || !s.hasStarted) return; // Ya terminó o no empezó

    const now = performance.now();
    s.endTime = now;
    s.isActive = false; // Desactivar flag interno
    setSolveModeActive(false); // Reflejar en UI

    const totalTimeMs = s.endTime - s.startTime;
    const totalTimeSeconds = totalTimeMs / 1000;
    const tps = totalTimeSeconds > 0 ? (s.moves / totalTimeSeconds).toFixed(2) : 0;

    // Consolidar feedback final para la UI
    setSessionResults({
      totalTimeFormatted: formatMs(totalTimeMs),
      totalMoves: s.moves,
      tps: tps,
      maxPauseFormatted: formatMs(s.maxPauseMs)
    });

  }, []);

  return {
    isSolveModeActive,
    toggleSolveMode,
    handleMove,
    handleSolved,
    sessionResults
  };
}
