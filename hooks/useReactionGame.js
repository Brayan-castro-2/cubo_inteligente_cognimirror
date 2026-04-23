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

function generateClinicalDeck(numNoGo = 5, mode = 'ESTANDAR') {
  const goFaces = mode === 'FLEXIBILIDAD' ? ['U', 'D'] : ['R', 'L'];
  const noGoPool = ['R', 'L', 'F', 'B', 'U', 'D'].filter(f => !goFaces.includes(f));

  // 1. Reservar dos cartas GO para inicio y fin
  const firstGo = goFaces[Math.floor(Math.random() * goFaces.length)];
  const lastGo = goFaces[Math.floor(Math.random() * goFaces.length)];

  // 2. Pool intermedio (el resto de los 10 GOs + los No-Gos)
  const remainingGo = [
    ...Array(5).fill(goFaces[0]),
    ...Array(5).fill(goFaces[1])
  ];
  
  // Quitar los dos usados
  const idx1 = remainingGo.indexOf(firstGo);
  if (idx1 > -1) remainingGo.splice(idx1, 1);
  const idx2 = remainingGo.indexOf(lastGo);
  if (idx2 > -1) remainingGo.splice(idx2, 1);

  let middle = [
    ...remainingGo,
    ...Array(numNoGo).fill(null).map(() => noGoPool[Math.floor(Math.random() * noGoPool.length)])
  ];
  
  middle = shuffleArray(middle);
  
  // 3. Regla Anti-Repetición (No 2 No-Go seguidos)
  const isNoGoTag = (tag) => !goFaces.includes(tag);
  
  return deck;
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
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [feedbackMsg, setFeedbackMsg] = useState(null); // { text: string, type: 'success' | 'error' | 'rayo' }
  const [lastMotorExecution, setLastMotorExecution] = useState(null); // { notation, motorExecutionMs }

  // ── Refs VIVOS: se leen en callbacks sin crear dependencias ──
  const deckRef         = useRef([]);
  const deckIdxRef      = useRef(0);


  const waitTimeoutRef    = useRef(null);
  const showTimeoutRef    = useRef(null);
  const waitTimeRandomRef = useRef(0);
  const startTimeRef      = useRef(0);
  const inhibitionTimeoutRef = useRef(null);

  // Reflejo en ref de los estados que necesitan los callbacks
  const playStateRef      = useRef('idle');
  const currentTurnRef    = useRef(0);
  const expectedFaceRef   = useRef(null);
  const livesRef          = useRef(3);
  const gameDataRef       = useRef([]);
  const isTurnCompleted   = useRef(false);
  const hasFirstMoveError = useRef(false);
  const lastTurnEndTimeRef = useRef(Date.now());
  const currentWaitTimeRef = useRef(1200); // Para telemetría persistente
  const gameModeRef = useRef('ESTANDAR');


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


  const getColorName = (tag) => {
    const names = {
      'R': 'ROJO',
      'L': 'NARANJO',
      'U': 'BLANCO',
      'D': 'AMARILLO',
      'F': 'AZUL',
      'B': 'VERDE'
    };
    return names[tag] || tag;
  };

  // ── Configurar turno (función central del motor) ──

  const processNextTurn = useCallback((nextIdx, currentDataSoFar) => {
    if (nextIdx >= deckRef.current.length) {
      finishGame(currentDataSoFar);
      return;
    }

    // ── Limpieza de estado para evitar spoilers ──
    setExpectedFaceBoth(null);
    setPlayStateBoth('waiting');

    // Limpiar timers previos SIN tocar la suscripción BLE
    clearTimeout(waitTimeoutRef.current);
    clearTimeout(showTimeoutRef.current);
    clearTimeout(inhibitionTimeoutRef.current);

    let face = deckRef.current[nextIdx];
    deckIdxRef.current = nextIdx;

    // ── TRAMPA DE IMPULSIVIDAD (Combo >= 4) ──
    const isGoColor = gameModeRef.current === 'FLEXIBILIDAD' ? (face === 'U' || face === 'D') : (face === 'R' || face === 'L');
    if (combo >= 4 && isGoColor) {
      // Si el combo es alto y viene un GO, intentar forzar un NO-GO sorpresa
      let trapIdx = -1;
      for (let k = nextIdx + 1; k < deckRef.current.length; k++) {
        const isNextGo = gameModeRef.current === 'FLEXIBILIDAD' ? (deckRef.current[k] === 'U' || deckRef.current[k] === 'D') : (deckRef.current[k] === 'R' || deckRef.current[k] === 'L');
        if (!isNextGo) {
          trapIdx = k;
          break;
        }
      }
      if (trapIdx !== -1) {
        // Swap actual por trampa
        [deckRef.current[nextIdx], deckRef.current[trapIdx]] = [deckRef.current[trapIdx], deckRef.current[nextIdx]];
        face = deckRef.current[nextIdx];
        console.log('⚠️ TRAMPA DE IMPULSIVIDAD: NO-GO INYECTADO POR VELOCIDAD');
      }
    }

    setCurrentTurnBoth(nextIdx);

    setExpectedFaceBoth(null); // Aseguramos reset al inicio de espera

    isTurnCompleted.current = false;
    hasFirstMoveError.current = false;

    // ── DIFICULTAD DINÁMICA (Tiempo de espera inverso al combo) ──
    const dynamicWaitMs = Math.max(300, 1200 - (combo * 100));
    currentWaitTimeRef.current = dynamicWaitMs;
    
    inhibitionTimeoutRef.current = setTimeout(() => {
      const isi = Date.now() - lastTurnEndTimeRef.current;
      setExpectedFaceBoth(face); // Solo revelamos el color aquí
      setPlayStateBoth('showing_color');
      startTimeRef.current = performance.now();
      console.log('Estímulo mostrado: Cara', face, 'ISI:', isi);

      // ── Caso NO-GO ──
      const isNoGo = !(gameModeRef.current === 'FLEXIBILIDAD' ? (face === 'U' || face === 'D') : (face === 'R' || face === 'L'));

      if (isNoGo) {

        // En NO-GO, el usuario debe esperar sin moverse
        inhibitionTimeoutRef.current = setTimeout(() => {
          if (isTurnCompleted.current) return;
          isTurnCompleted.current = true;

          setVisualFeedbackBoth('success');
          setTimeout(() => setVisualFeedbackBoth(null), 300);

          const points = 150;
          setScore(s => s + points);
          setCombo(c => c + 1);
          setFeedbackMsg({ text: `¡Autocontrol! 🧠 +${points}`, type: 'success' });
          setTimeout(() => setFeedbackMsg(null), 1000);

          const successRecord = {
            turn: nextIdx + 1,
            expectedFace: face,
            colorName: getColorName(face),
            actualFace: null,
            waitTimeMs: dynamicWaitMs,
            isiMs: Date.now() - lastTurnEndTimeRef.current,
            reactionTimeMs: 0,
            isCorrect: true,
            isFalseStart: false,
            isOmission: false,
            isInhibitionSuccess: true,
            caraObjetivo: getColorName(face),
            tiempoMilisegundos: 0,
            movimientoUsuario: 'NONE',
            esCorrecto: true,
          };

          lastTurnEndTimeRef.current = Date.now();
          const newData = [...currentDataSoFar, successRecord];
          setGameDataBoth(newData);

          processNextTurn(nextIdx + 1, newData);
        }, 1500); // 1.5s de ventana de inhibición clínica


      } else {
        // ── Caso GO: Timer de omisión estándar ──
        showTimeoutRef.current = setTimeout(() => {
          if (isTurnCompleted.current) return;
          isTurnCompleted.current = true;

          setLivesBoth(Math.max(0, livesRef.current - 1));
          setCombo(1);
          flashError();
          setFeedbackMsg({ text: '¡Omisión!', type: 'error' });
          setTimeout(() => setFeedbackMsg(null), 1000);

          const omissionRecord = {
            turn: nextIdx + 1,
            expectedFace: face,
            colorName: getColorName(face),
            actualFace: null,
            waitTimeMs: dynamicWaitMs,
            isiMs: isi,
            reactionTimeMs: MAX_TIME_MS,
            isCorrect: false,
            isFalseStart: false,
            isOmission: true,
            caraObjetivo: getColorName(face),
            tiempoMilisegundos: MAX_TIME_MS,
            movimientoUsuario: null,
            esCorrecto: false,
          };


          lastTurnEndTimeRef.current = Date.now();
          const newData = [...currentDataSoFar, omissionRecord];
          setGameDataBoth(newData);
          processNextTurn(nextIdx + 1, newData);
        }, MAX_TIME_MS);


      }

    }, dynamicWaitMs);


  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishGame, flashError]);

  // ── Iniciar partida ──
  const start = useCallback((mode = 'ESTANDAR') => {
    clearTimeout(waitTimeoutRef.current);
    clearTimeout(showTimeoutRef.current);
    gameModeRef.current = mode;
    const numNoGo = 3 + Math.floor(Math.random() * 5); 
    deckRef.current = generateClinicalDeck(numNoGo, mode);
    setLivesBoth(3);
    setGameDataBoth([]);
    lastTurnEndTimeRef.current = Date.now();
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
    deckIdxRef.current = 0;


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
      setCombo(1);
      flashError();
      setFeedbackMsg({ text: '¡Falsa Alarma!', type: 'error' });
      setTimeout(() => setFeedbackMsg(null), 1000);

      const record = {
        // ── Campos estándar clínicos ──
        turn: turn + 1,
        expectedFace: face,
        colorName: getColorName(face),
        actualFace,
        waitTimeMs: currentWaitTimeRef.current,
        isiMs: Date.now() - lastTurnEndTimeRef.current,
        reactionTimeMs: 0,
        isCorrect: false,
        isFalseStart: true,
        isOmission: false,
        firstMoveWrong: true,
        gaveUp: false,
        corrected: false,
        // ── Campos nuevos nomenclatura ejecutiva ──
        caraObjetivo: getColorName(face),
        tiempoMilisegundos: 0,
        movimientoUsuario: actualFace,
        esCorrecto: false,
      };

      lastTurnEndTimeRef.current = Date.now();
      const newData = [...gameDataRef.current, record];
      setGameDataBoth(newData);

      processNextTurn(deckIdxRef.current + 1, newData);
      return;
    }



    // RESPUESTA DURANTE ESTÍMULO
    if (phase === 'showing_color') {
        const rawMs = Math.round(performance.now() - startTimeRef.current);
      // Compensar latencia de hardware (BLE RTT/2 + render lag)
      const reactionMs = Math.max(0, rawMs - (latencyOffset || 0));

        // Disparar flash de éxito visual para el AnimatedCube
        setVisualFeedbackBoth('success');
        setTimeout(() => setVisualFeedbackBoth(null), 300);

        // Si era un NO-GO y el usuario se movió -> ERROR POR IMPULSIVIDAD
        const isGoColor = gameModeRef.current === 'FLEXIBILIDAD' 
          ? (face === 'U' || face === 'D')
          : (face === 'R' || face === 'L');

        if (!isGoColor) {
          isTurnCompleted.current = true;
          clearTimeout(inhibitionTimeoutRef.current);

          const rawMs = Math.round(performance.now() - startTimeRef.current);

          const reactionMs = Math.max(0, rawMs - (latencyOffset || 0));

          setCombo(1);
          flashError();
          setFeedbackMsg({ text: '¡Impulsividad!', type: 'error' });
          setTimeout(() => setFeedbackMsg(null), 1000);

          const errorRecord = {
            turn: turn + 1,
            expectedFace: face,
            colorName: getColorName(face),
            actualFace,
            waitTimeMs: dynamicWaitMs,
            isiMs: Date.now() - lastTurnEndTimeRef.current,
            reactionTimeMs: reactionMs,
            isCorrect: false,
            isImpulsivityError: true,
            caraObjetivo: getColorName(face),
            tiempoMilisegundos: reactionMs,
            movimientoUsuario: actualFace,
            esCorrecto: false,
          };

          lastTurnEndTimeRef.current = Date.now();
          const newData = [...gameDataRef.current, errorRecord];
          setGameDataBoth(newData);

          processNextTurn(deckIdxRef.current + 1, newData);
          return;
        }



        if (actualFace === face) {
          // ACIERTO (GO)
          isTurnCompleted.current = true;
          clearTimeout(showTimeoutRef.current);

          // Cálculo de puntuación y feedback dinámico
          let points = 100;
          let text = '¡Bien! 👍';
          let type = 'success';
          
          if (reactionMs < 600) {
            points = 200;
            text = '¡Rayo! ⚡';
            type = 'rayo';
          }

          const earned = points * combo;
          setScore(s => s + earned);
          setCombo(c => c + 1);
          setFeedbackMsg({ text: `${text} +${earned}`, type });
          setTimeout(() => setFeedbackMsg(null), 1000);

          setVisualFeedbackBoth('success');
          setTimeout(() => setVisualFeedbackBoth(null), 300);

          const record = {
            // ── Campos estándar clínicos ──
            turn: turn + 1,
            expectedFace: face,
            colorName: getColorName(face),
            actualFace,
            waitTimeMs: dynamicWaitMs,
            isiMs: Date.now() - lastTurnEndTimeRef.current,
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
            caraObjetivo: getColorName(face),
            tiempoMilisegundos: reactionMs,
            movimientoUsuario: actualFace,
            esCorrecto: true,
          };

          lastTurnEndTimeRef.current = Date.now();
          const newData = [...gameDataRef.current, record];
          setGameDataBoth(newData);

          processNextTurn(deckIdxRef.current + 1, newData);
        } else {


          // EQUIVOCACIÓN (GO)
          hasFirstMoveError.current = true;
          setCombo(1);
          setLivesBoth(Math.max(0, livesRef.current - 1));
          flashError();
          setFeedbackMsg({ text: '¡Lado equivocado!', type: 'error' });
          setTimeout(() => setFeedbackMsg(null), 1000);

          const errorRecord = {
          // ── Campos estándar clínicos ──
          turn: turn + 1,
          expectedFace: face,
          colorName: getColorName(face),
          actualFace,
          waitTimeMs: dynamicWaitMs,
          isiMs: Date.now() - lastTurnEndTimeRef.current,
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
          caraObjetivo: getColorName(face),
          tiempoMilisegundos: reactionMs,
          movimientoUsuario: actualFace,
          esCorrecto: false,
        };

        lastTurnEndTimeRef.current = Date.now();
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
    currentTurn: deckIdxRef.current,
    totalTurns: deckRef.current.length,


    lives,
    expectedFace,
    gameData,
    visualFeedback,
    score,
    combo,
    feedbackMsg,
    start,
    reset,
    registerMove,
    broadcastMove,
    latencyOffset,
    sessionRecord: null,
  };
}
