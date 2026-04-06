'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useBluetoothCube } from '../contexts/BluetoothContext';

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL MOTOR
// ─────────────────────────────────────────────────────────────
const TOTAL_TURNS = 10;
const MAX_TIME_MS = 3000;

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateLevels() {
  // 5 turnos por mano, exactamente balanceado, orden aleatorio
  return shuffleArray(['R', 'R', 'R', 'R', 'R', 'L', 'L', 'L', 'L', 'L']);
}

// ─────────────────────────────────────────────────────────────
// HOOK DE LA LÓGICA CORE V3  (sin closure/race-condition)
// ─────────────────────────────────────────────────────────────
export function useReactionGame() {
  const { subscribeToMoves, subscribeToMoveComplete, broadcastMove, latencyOffset } = useBluetoothCube();

  // ── Estado React (solo para disparar re-renders en la UI) ──
  const [playState, setPlayState]       = useState('idle');
  const [currentTurn, setCurrentTurn]   = useState(0);
  const [lives, setLives]               = useState(3);
  const [gameData, setGameData]         = useState([]);
  const [expectedFace, setExpectedFace] = useState(null);
  const [visualFeedback, setVisualFeedback] = useState(null);
  const [lastMotorExecution, setLastMotorExecution] = useState(null); // { notation, motorExecutionMs }

  // ── Refs VIVOS: se leen en callbacks sin crear dependencias ──
  const sequenceRef       = useRef([]);
  const waitTimeoutRef    = useRef(null);
  const showTimeoutRef    = useRef(null);
  const waitTimeRandomRef = useRef(0);
  const startTimeRef      = useRef(0);

  // Reflejo en ref de los estados que necesitan los callbacks
  const playStateRef      = useRef('idle');
  const currentTurnRef    = useRef(0);
  const expectedFaceRef   = useRef(null);
  const livesRef          = useRef(3);
  const gameDataRef       = useRef([]);
  const isTurnCompleted   = useRef(false);
  const hasFirstMoveError = useRef(false);

  // Helpers que sincronizan estado + ref a la vez
  const setPlayStateBoth = (v) => { playStateRef.current = v; setPlayState(v); };
  const setCurrentTurnBoth = (v) => { currentTurnRef.current = v; setCurrentTurn(v); };
  const setExpectedFaceBoth = (v) => { expectedFaceRef.current = v; setExpectedFace(v); };
  const setLivesBoth = (v) => { livesRef.current = v; setLives(v); };
  const setGameDataBoth = (v) => {
    const next = typeof v === 'function' ? v(gameDataRef.current) : v;
    gameDataRef.current = next;
    setGameData(next);
  };

  // ── Flash de error/éxito visual ──
  const flashError = useCallback(() => {
    setVisualFeedback('error');
    setTimeout(() => setVisualFeedback(null), 300);
  }, []);

  const setVisualFeedbackBoth = useCallback((v) => {
    setVisualFeedback(v);
  }, []);

  // ── Finalizar juego ──
  const finishGame = useCallback((finalData) => {
    setGameDataBoth(finalData);
    setPlayStateBoth('results');
    console.log('✅ Juego terminado. Turnos:', finalData.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Configurar turno (función central del motor) ──
  const processNextTurn = useCallback((nextTurnIdx, currentDataSoFar) => {
    if (nextTurnIdx >= TOTAL_TURNS) {
      finishGame(currentDataSoFar);
      return;
    }

    // Limpiar timers previos SIN tocar la suscripción BLE
    clearTimeout(waitTimeoutRef.current);
    clearTimeout(showTimeoutRef.current);

    const face = sequenceRef.current[nextTurnIdx];

    setCurrentTurnBoth(nextTurnIdx);
    setExpectedFaceBoth(face);
    setPlayStateBoth('waiting');
    isTurnCompleted.current = false;
    hasFirstMoveError.current = false;

    const randomWaitMs = Math.floor(Math.random() * 1500) + 1000;
    waitTimeRandomRef.current = randomWaitMs;

    console.log('Turno', nextTurnIdx + 1, '- Esperando', randomWaitMs, 'ms');

    // ── Timer 1: waiting ──> showing_color ──
    waitTimeoutRef.current = setTimeout(() => {
      setPlayStateBoth('showing_color');
      startTimeRef.current = performance.now();
      console.log('Estímulo mostrado: Cara', face);

      // ── Timer 2: timeout de omisión ──
      showTimeoutRef.current = setTimeout(() => {
        if (isTurnCompleted.current) return;
        isTurnCompleted.current = true;

        setLivesBoth(Math.max(0, livesRef.current - 1));
        flashError();

        const omissionRecord = {
          // ── Campos estándar clínicos ──
          turn: nextTurnIdx + 1,
          expectedFace: face,
          actualFace: null,
          waitTimeMs: randomWaitMs,
          reactionTimeMs: MAX_TIME_MS,
          isCorrect: false,
          isFalseStart: false,
          isOmission: true,
          firstMoveWrong: hasFirstMoveError.current,
          gaveUp: hasFirstMoveError.current,
          corrected: false,
          // ── Campos nuevos nomenclatura ejecutiva ──
          caraObjetivo: face,
          tiempoMilisegundos: MAX_TIME_MS,
          movimientoUsuario: null,
          esCorrecto: false,
        };

        const newData = [...currentDataSoFar, omissionRecord];
        processNextTurn(nextTurnIdx + 1, newData);
      }, MAX_TIME_MS);

    }, randomWaitMs);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishGame, flashError]);

  // ── Iniciar partida ──
  const start = useCallback(() => {
    clearTimeout(waitTimeoutRef.current);
    clearTimeout(showTimeoutRef.current);
    sequenceRef.current = generateLevels();
    setLivesBoth(3);
    setGameDataBoth([]);
    processNextTurn(0, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processNextTurn]);

  // ── Reset ──
  const reset = useCallback(() => {
    clearTimeout(waitTimeoutRef.current);
    clearTimeout(showTimeoutRef.current);
    setPlayStateBoth('idle');
    setCurrentTurnBoth(0);
    setLivesBoth(3);
    setGameDataBoth([]);
    setExpectedFaceBoth(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Captura del movimiento (hardware o teclado) ──
  // CLAVE: lee todo desde refs en vez de estado → sin dependencias → sin re-suscripción BLE
  const registerMove = useCallback((actualFace) => {
    const phase = playStateRef.current;
    const turn  = currentTurnRef.current;
    const face  = expectedFaceRef.current;

    if (isTurnCompleted.current || phase === 'idle' || phase === 'results') return;

    // FALSO ARRANQUE
    if (phase === 'waiting') {
      isTurnCompleted.current = true;
      clearTimeout(waitTimeoutRef.current);

      setLivesBoth(Math.max(0, livesRef.current - 1));
      flashError();

      const record = {
        // ── Campos estándar clínicos ──
        turn: turn + 1,
        expectedFace: face,
        actualFace,
        waitTimeMs: waitTimeRandomRef.current,
        reactionTimeMs: 0,
        isCorrect: false,
        isFalseStart: true,
        isOmission: false,
        firstMoveWrong: true,
        gaveUp: false,
        corrected: false,
        // ── Campos nuevos nomenclatura ejecutiva ──
        caraObjetivo: face,
        tiempoMilisegundos: 0,
        movimientoUsuario: actualFace,
        esCorrecto: false,
      };

      const newData = [...gameDataRef.current, record];
      setGameDataBoth(newData);
      processNextTurn(turn + 1, newData);
      return;
    }

    // RESPUESTA DURANTE ESTÍMULO
    if (phase === 'showing_color') {
        const rawMs = Math.round(performance.now() - startTimeRef.current);
      // Compensar latencia de hardware (BLE RTT/2 + render lag)
      const reactionMs = Math.max(0, rawMs - (latencyOffset || 0));

      if (actualFace === face) {
        // ACIERTO
        isTurnCompleted.current = true;
        clearTimeout(showTimeoutRef.current);

        // Disparar flash de éxito visual para el AnimatedCube
        setVisualFeedbackBoth('success');
        setTimeout(() => setVisualFeedbackBoth(null), 300);

        const record = {
          // ── Campos estándar clínicos ──
          turn: turn + 1,
          expectedFace: face,
          actualFace,
          waitTimeMs: waitTimeRandomRef.current,
          rawReactionTimeMs: rawMs,
          reactionTimeMs: reactionMs,
          latencyDiscount: (latencyOffset || 0),
          isCorrect: true,
          isFalseStart: false,
          isOmission: false,
          firstMoveWrong: hasFirstMoveError.current,
          gaveUp: false,
          corrected: hasFirstMoveError.current,
          // ── Campos nuevos nomenclatura ejecutiva ──
          caraObjetivo: face,
          tiempoMilisegundos: reactionMs,
          movimientoUsuario: actualFace,
          esCorrecto: true,
        };

        const newData = [...gameDataRef.current, record];
        setGameDataBoth(newData);
        processNextTurn(turn + 1, newData);
      } else {
        // EQUIVOCACIÓN: Se guarda el registro del error físico inmediatamente 
        hasFirstMoveError.current = true;
        setLivesBoth(Math.max(0, livesRef.current - 1));
        flashError();

        const errorRecord = {
          // ── Campos estándar clínicos ──
          turn: turn + 1,
          expectedFace: face,
          actualFace,
          waitTimeMs: waitTimeRandomRef.current,
          rawReactionTimeMs: rawMs,
          reactionTimeMs: reactionMs,
          latencyDiscount: (latencyOffset || 0),
          isCorrect: false,
          isFalseStart: false,
          isOmission: false,
          firstMoveWrong: true,
          gaveUp: false,
          corrected: false,
          // ── Campos nuevos nomenclatura ejecutiva ──
          caraObjetivo: face,
          tiempoMilisegundos: reactionMs,
          movimientoUsuario: actualFace,
          esCorrecto: false,
        };

        const newData = [...gameDataRef.current, errorRecord];
        setGameDataBoth(newData);
        // El turno NO se corta aquí; el usuario aún debe corregir.
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashError, processNextTurn]);

  // ── Suscripción BLE: movimientos ─────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToMoves((notation) => {
      const baseFace = notation.charAt(0);
      registerMove(baseFace);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeToMoves]);

  // ── Suscripción TEM: Tiempo de Ejecución Motora ───────────────────
  // Cuando el cubo envía el Paquete 2, actualizamos el último registro del turno
  // con el motorExecutionMs para que quede guardado en el reporte clínico.
  useEffect(() => {
    if (!subscribeToMoveComplete) return;
    const unsub = subscribeToMoveComplete(({ notation, motorExecutionMs }) => {
      // Actualizar estado UI (para mostrar en tiempo real si quisieras)
      setLastMotorExecution({ notation, motorExecutionMs });

      // Parchar el último registro en gameData con el TEM
      setGameDataBoth(prev => {
        if (!prev.length) return prev;
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        // Solo parchamos si la cara coincide (precaución)
        if (last.esCorrecto !== undefined && last.movimientoUsuario === notation.charAt(0)) {
          last.motorExecutionMs = motorExecutionMs;
          last.tiempoEjecucionMotora = motorExecutionMs;
          updated[updated.length - 1] = last;
        }
        return updated;
      });
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeToMoveComplete]);

  return {
    playState,
    currentTurn,
    totalTurns: TOTAL_TURNS,
    lives,
    expectedFace,
    gameData,
    visualFeedback,
    start,
    reset,
    registerMove,
    broadcastMove,
    latencyOffset,
    sessionRecord: null,
  };
}
