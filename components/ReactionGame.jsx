'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { useCubeState } from '../contexts/CubeStateContext';
import { useJoicube } from '../contexts/JoicubeContext';
import Cube3DViewer from './Cube3DViewer';

// ── GENERADOR DE MAZO CLÍNICO ESTRICTO ──
function generateDeck() {
  const NOGO_COLORS = [
    { id: 'NONE', label: 'VERDE', hex: '#22c55e', type: 'NOGO' },
    { id: 'NONE', label: 'AZUL', hex: '#3b82f6', type: 'NOGO' }
  ];

  // Ratio Clínico 80/20 (aprox). 10 GO, 2 o 3 NOGO
  const numNogo = Math.random() > 0.5 ? 2 : 3;
  const TOTAL_ROUNDS = 10 + numNogo;

  let validDeck = false;
  let attempt = [];

  while (!validDeck) {
    attempt = [];
    let counts = { R: 5, L: 5, NOGO: numNogo };
    let failed = false;

    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      let available = [];
      if (counts.R > 0) available.push('R');
      if (counts.L > 0) available.push('L');
      if (counts.NOGO > 0) available.push('NOGO');

      // Regla de Orden: Los primeros 3 deben ser SIEMPRE GO (Respuesta Prepotente)
      if (i < 3) {
        available = available.filter(t => t !== 'NOGO');
      }

      // Regla: No terminar con falso (NOGO)
      if (i === TOTAL_ROUNDS - 1) {
        available = available.filter(t => t !== 'NOGO');
      }

      // Regla Clínica: PROHIBIDO DOS FALSOS SEGUIDOS
      if (i > 0 && attempt[i - 1] === 'NOGO') {
        available = available.filter(t => t !== 'NOGO');
      }

      // Regla: No repetir más de 2 colores seguidos
      if (i >= 2) {
        const prev1 = attempt[i - 1];
        const prev2 = attempt[i - 2];
        if (prev1 === prev2 && prev1 !== 'NOGO') {
          available = available.filter(t => t !== prev1);
        }
      }

      if (available.length === 0) {
        failed = true;
        break; 
      }

      const pick = available[Math.floor(Math.random() * available.length)];
      counts[pick]--;
      attempt.push(pick);
    }

    if (!failed) validDeck = true;
  }

  // Traducción a objetos ricos
  return attempt.map(t => {
    if (t === 'R') return { id: 'R', label: 'NARANJO', hex: '#FF8C00', type: 'GO' };
    if (t === 'L') return { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO' };
    return NOGO_COLORS[Math.floor(Math.random() * NOGO_COLORS.length)];
  });
}

export default function ReactionGame({ onExit, playerName, sessionMeta, sessionStartTime }) {
  const { subscribeToMoves } = useBluetoothCube();
  const { cubeRotation: globalRotation } = useCubeState();
  const { deactivate: deactivateJoicube } = useJoicube();

  // Al montar: desactivar Joicube para que el cubo vuelva a BLE nativo
  useEffect(() => {
    deactivateJoicube();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mazo estático y generado para las 15 rondas
  const deck = useMemo(() => generateDeck(), []);

  const [stage, setStage] = useState('rules'); // rules | waiting | stimulus | finished
  const [round, setRound] = useState(0); 
  const [flash, setFlash] = useState(null); // 'red', 'green', 'black', 'grey'
  const [shake, setShake] = useState(0);

  const [results, setResults] = useState([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [showRachaReset, setShowRachaReset] = useState(false); // Para efecto humo
  
  // Refs para métricas críticas y lógicas temporales
  const timerRef = useRef(0);
  const nogoTimeoutRef = useRef(null);
  const goTimeoutRef = useRef(null);
  const stageRef = useRef('rules');
  const targetRef = useRef(null);
  const moveHistoryRef = useRef([]);

  // Curva de Dificultad
  const baseDelayRef = useRef(1500); // 1.5s inicial

  // Tiempos Maestros
  const gameStartTimeRef = useRef(null);

  // ── CICLO DEL JUEGO ──
  useEffect(() => {
    if (stage === 'waiting' && round < deck.length) {
      // Ritmo Inter-Estímulo (ISI): Aleatorio estricto para crear 'Arousal' (400ms - 800ms)
      const waitTime = 400 + Math.random() * 400; 
      
      const tid = setTimeout(() => {
        const target = deck[round];
        targetRef.current = target;
        
        setStage('stimulus');
        stageRef.current = 'stimulus';
        timerRef.current = performance.now();

        // Si es NOGO, esperamos la ventana de inhibición completa de 800ms
        if (target.type === 'NOGO') {
          nogoTimeoutRef.current = setTimeout(() => {
            // Inhibición Exitosa (No movió)
            setFlash('green');
            setResults(prev => [...prev, { 
              round: round + 1, 
              type: 'NOGO', 
              label: target.label, // Nombre del color distractor
              fail: false, 
              time: null,
              status: 'Ok'
            }]);
            
            // Logica Rachas: Acierto NOGO
            setCurrentStreak(s => {
              const next = s + 1;
              if (next > maxStreak) setMaxStreak(next);
              return next;
            });

            setStage('waiting');
            stageRef.current = 'waiting';
            setRound(r => r + 1);
            setTimeout(() => setFlash(null), 300);
          }, 800); 
        } 
        // Si es GO, le damos un hard timeout de 800ms para responder rápido
        else if (target.type === 'GO') {
          
          goTimeoutRef.current = setTimeout(() => {
            // Límite final excedido (No respondió correctamente a tiempo)
            setFlash('black'); 
            setShake(s => s + 1);
            setCurrentStreak(0);
            setShowRachaReset(true);
            setTimeout(() => setShowRachaReset(false), 600);

            setResults(prev => {
               const existsIdx = prev.findIndex(r => r.round === round + 1);
               if (existsIdx > -1) {
                 const copy = [...prev];
                 copy[existsIdx].timeout = true;
                 copy[existsIdx].status = 'Omisión / Lento';
                 return copy;
               }
               return [...prev, { round: round + 1, type: 'GO', expected: target.id, time: null, errors: 0, timeout: true, status: 'Omisión / Lento' }];
            });

            setStage('waiting');
            stageRef.current = 'waiting';
            setRound(r => r + 1);
            setTimeout(() => setFlash(null), 300);
          }, 1500);
        }

      }, waitTime);
      
      return () => clearTimeout(tid);
    } else if (stage === 'waiting' && round >= deck.length) {
      setStage('finished');
      stageRef.current = 'finished';
      persistData();
    }
  }, [stage, round, deck]);
  
  const persistData = () => {
    const goResults = results.filter(r => r.type === 'GO' && !r.timeout);
    const timeTotal = goResults.reduce((acc, r) => acc + r.time, 0) || 0;
    const gameDuration = gameStartTimeRef.current ? Math.round(performance.now() - gameStartTimeRef.current) : 0;
    const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
    
    // Filtros por mano (Aciertos perfectos -> errors === 0)
    const aciertosRojo = goResults.filter(r => r.expected === 'L' && (r.errors === 0 || r.errors === undefined)).length;
    const aciertosNaranja = goResults.filter(r => r.expected === 'R' && (r.errors === 0 || r.errors === undefined)).length;
    
    // Filtros errados
    const goL = goResults.filter(r => r.expected === 'L');
    const goR = goResults.filter(r => r.expected === 'R');

    const avgL = goL.length ? Math.round(goL.reduce((a, r) => a + r.time, 0) / goL.length) : 0;
    const avgR = goR.length ? Math.round(goR.reduce((a, r) => a + r.time, 0) / goR.length) : 0;
    
    const nogoFails = results.filter(r => r.type === 'NOGO' && r.fail).length;

    const record = {
      id: crypto.randomUUID(),
      playerName: playerName || 'Anónimo',
      date: new Date().toISOString(),
      sessionMeta,
      metrics: { 
        tiempo_total: Math.round(timeTotal),
        aciertos_rojo: aciertosRojo,
        aciertos_naranja: aciertosNaranja,
        errores_falsos: nogoFails,
        tiempo_promedio_por_mano: {
          L: avgL,
          R: avgR
        },
        game_duration_ms: gameDuration,
        session_duration_ms: sessionDuration,
        max_streak: maxStreak
      },
      rawTurnsData: results
    };

    const oldDb = JSON.parse(localStorage.getItem('cogniMirror_DB') || '[]');
    oldDb.push(record);
    localStorage.setItem('cogniMirror_DB', JSON.stringify(oldDb));

    // NUEVO SISTEMA (Storage por Usuario)
    const pName = playerName || 'Anónimo';
    const usersDB = JSON.parse(localStorage.getItem('cogniMirror_Users') || '{}');
    if (!usersDB[pName]) {
      usersDB[pName] = { playerName: pName, history: [] };
    }
    usersDB[pName].history.push(record);
    localStorage.setItem('cogniMirror_Users', JSON.stringify(usersDB));

    if (onExit) onExit(record, usersDB[pName].history);
  };

  // ── BLUETOOTH LISTENER ──
  const handleMove = useCallback((movimiento) => {

    if (stageRef.current === 'rules') {
      const now = Date.now();
      moveHistoryRef.current.push({ m: movimiento, t: now });
      moveHistoryRef.current = moveHistoryRef.current.filter(x => now - x.t < 1200);

      const lMoves = moveHistoryRef.current.filter(x => x.m === 'L').length;
      const lPrimeMoves = moveHistoryRef.current.filter(x => x.m === "L'").length;
      const isL2 = movimiento === 'L2' || lMoves >= 2 || lPrimeMoves >= 2;

      if (isL2) {
        setStage('waiting');
        stageRef.current = 'waiting';
        moveHistoryRef.current = []; // flush
        gameStartTimeRef.current = performance.now();
      }
      return;
    }

    if (stageRef.current !== 'stimulus') return;

    const rt = performance.now() - timerRef.current;
    const target = targetRef.current;
    const currentMove = movimiento.replace("'", ""); // Limpiamos giros antihorarios

    if (target.type === 'NOGO') {
      // FALLLO DE INHIBICIÓN SI SE MUEVE
      clearTimeout(nogoTimeoutRef.current);
      setFlash('black'); // Flash obscuro para fallo grave
      setShake(s => s + 1);
      
      setResults(prev => [...prev, { 
        round: round + 1, 
        type: 'NOGO', 
        label: target.label, 
        fail: true, 
        time: Math.round(rt), // Velocidad de Impulso (Clínico)
        status: 'Fallo de Inhibición'
      }]);
      
      // Reset Racha por fallo No-Go
      setCurrentStreak(0);
      setShowRachaReset(true);
      setTimeout(() => setShowRachaReset(false), 600);

      setStage('waiting');
      stageRef.current = 'waiting';
      setRound(r => r + 1);
      setTimeout(() => setFlash(null), 300);

    } else if (target.type === 'GO') {
      if (currentMove === target.id) {
        // ACIERTO
        clearTimeout(goTimeoutRef.current);
        setFlash('green');

        // Aumenta la velocidad para el siguiente Hit! (x0.9)
        baseDelayRef.current = Math.max(500, baseDelayRef.current * 0.9); 
        
        // Logica Rachas
        setCurrentStreak(s => {
          const next = s + 1;
          if (next > maxStreak) setMaxStreak(next);
          return next;
        });

        setResults(prev => {
          // Si ya hubo un error previo en esta ronda, lo marcamos como Corregido
          const hasError = prev.some(r => r.round === round + 1 && r.status === 'Error de Lado');
          return [...prev, { 
            round: round + 1, 
            type: 'GO', 
            expected: target.id, 
            time: Math.round(rt), 
            errors: hasError ? 1 : 0, 
            status: hasError ? 'Corregido' : 'Ok' 
          }];
        });

        setStage('waiting');
        stageRef.current = 'waiting';
        setRound(r => r + 1);
        setTimeout(() => setFlash(null), 150); // REFINADO: Transición ultra-rápida (150ms)
      } else {
        // ERROR DE LADO EN GO PROSPECT (Se equivocó de mano)
        setFlash('red');
        setShake(s => s + 1);

        setResults(prev => [...prev, { 
          round: round + 1, 
          type: 'GO', 
          expected: target.id, 
          time: Math.round(rt), 
          errors: 1, 
          status: 'Error de Lado' 
        }]);

        // Reset racha por error de mano
        setCurrentStreak(0);
        setShowRachaReset(true);
        setTimeout(() => setShowRachaReset(false), 600);

        // -- NO CAMBIAMOS EL STAGE --
        // Mantenemos el estímulo activo para permitir Redención
        setTimeout(() => setFlash(null), 300);
      }
    }
  }, [round]);

  useEffect(() => {
    const unsub = subscribeToMoves(handleMove);
    return () => {
      unsub();
      clearTimeout(nogoTimeoutRef.current);
      clearTimeout(goTimeoutRef.current);
    };
  }, [subscribeToMoves, handleMove]);

  // Atajos teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') handleMove('R');
      if (e.key === 'ArrowLeft') handleMove('L');
      if (e.key === 'ArrowUp') handleMove('U');
      if (e.key === 'Enter') handleMove('L2');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  // ── RENDER ──
  const activeColor = stage === 'stimulus' ? targetRef.current.hex : 'transparent';
  let bgColorClass = 'bg-[#07080f]';
  if (flash === 'red') bgColorClass = 'bg-[#4a0000]';
  else if (flash === 'green') bgColorClass = 'bg-[#003a00]';
  else if (flash === 'black') bgColorClass = 'bg-stone-900'; // Flash de error NOGO/TimeOut

  return (
    <div className={`relative w-full h-screen overflow-hidden flex items-center justify-center transition-colors duration-[0.1s] ${bgColorClass}`}>
      
      {/* ── FASE: REGLAS ── */}
      <AnimatePresence>
        {stage === 'rules' && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
            className="z-50 absolute inset-0 bg-[#07080f] flex flex-col items-center justify-center p-6"
          >
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-widest text-white mb-8 text-center">
              Reglas del Test
            </h1>

            <div className="flex flex-col gap-4 w-full max-w-lg mb-10">
              <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-[#FF8C00] shadow-[0_0_20px_#FF8C00] shrink-0" />
                <div>
                  <h3 className="text-[#FF8C00] font-bold uppercase tracking-widest">Si es Naranjo</h3>
                  <p className="text-white/60 text-sm">Gira la cara NARANJA (Derecha) lo más rápido posible.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-[#FF0000] shadow-[0_0_20px_#FF0000] shrink-0" />
                <div>
                  <h3 className="text-[#FF0000] font-bold uppercase tracking-widest">Si es Rojo</h3>
                  <p className="text-white/60 text-sm">Gira la cara ROJA (Izquierda) lo más rápido posible.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-white/5 border border-blue-500/20 p-4 rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-white shadow-[0_0_15px_rgba(59,130,246,0.5)] shrink-0" />
                <div>
                  <h3 className="text-blue-400 font-bold uppercase tracking-widest">Si es Otro Color (Azul, Blanco)</h3>
                  <p className="text-white/80 font-black text-sm uppercase">¡No muevas nada! Inhibe tu reacción.</p>
                </div>
              </div>
            </div>

            <div className="px-10 py-5 rounded-2xl bg-white/5 border border-red-500/30 flex flex-col items-center justify-center animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.1)]">
              <span className="text-[12px] font-black uppercase tracking-widest text-red-500 mb-1">Confirmar Lectura</span>
              <span className="text-white font-black text-xl tracking-wide uppercase text-center">
                MUEVE 2 VECES LA CARA ROJA (L2) <br /> PARA COMENZAR
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FASE: JUEGO ── */}
      {stage !== 'rules' && (
        <>
          {/* Estímulo de fondo destellante ultrarrápido */}
          {stage === 'stimulus' && (
            <div 
              className="absolute inset-0 z-0 transition-opacity duration-[0.05s]"
              style={{
                background: `radial-gradient(circle at center, ${activeColor}90 0%, transparent 80%)`
              }}
            />
          )}

          {/* CUBITO VIRTUAL Y TEXTO */}
          <div className="z-10 flex flex-col items-center justify-center w-full max-w-sm gap-8 relative">
            <motion.div 
              animate={{ x: shake ? [-25, 25, -20, 20, -10, 10, 0] : 0 }}
              transition={{ duration: 0.2 }}
              className={`rounded-3xl p-2 transition-all duration-[0.05s] ${stage === 'stimulus' ? 'border-[3px] bg-black/60 backdrop-blur-md' : 'border border-white/5 bg-white/[0.02]'}`}
              style={{ 
                borderColor: stage === 'stimulus' ? activeColor : 'rgba(255,255,255,0.05)',
                boxShadow: stage === 'stimulus' ? `0 0 120px ${activeColor}` : 'none'
              }}
            >
              <Cube3DViewer size={300} status="gyro_active" targetRotation={globalRotation} />
              
              {/* FEEDBACK ON-FIRE */}
              <AnimatePresence>
                {currentStreak > 0 && (
                  <motion.div 
                    initial={{ opacity:0, x: 20 }} animate={{ opacity:1, x: 0 }} exit={{ opacity:0, scale:0.5 }}
                    className="absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                  >
                    <div 
                      className="relative"
                      style={{ transform: `scale(${Math.min(1 + (currentStreak * 0.05), 2.5)})` }} // REFINADO: Escalamiento dinámico
                    >
                      {currentStreak > 5 && (
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0], filter: ['blur(10px)', 'blur(20px)', 'blur(10px)'] }}
                          transition={{ repeat: Infinity, duration: 0.5 }}
                          className="absolute inset-0 bg-orange-600 rounded-full opacity-60 z-0" 
                        />
                      )}
                      <div className="relative z-10 flex flex-col items-center">
                         <span className="text-orange-500 font-extrabold text-xs tracking-tighter uppercase">Streak</span>
                         <span className="text-white font-black text-4xl leading-none">{currentStreak}</span>
                         {currentStreak >= 3 && (
                           <motion.span 
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="bg-orange-500 text-black text-[10px] font-black px-2 py-0.5 rounded mt-1 shadow-[0_0_15px_#f97316]"
                           >
                             x{Math.floor(currentStreak/3) + 1}
                           </motion.span>
                         )}
                         {currentStreak > 5 && <span className="text-2xl mt-1">🔥</span>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* EFECTO HUMO (RESET) */}
              <AnimatePresence>
                {showRachaReset && (
                  <motion.div 
                    initial={{ opacity: 1, scale: 0.5, y: 0 }}
                    animate={{ opacity: 0, scale: 2, y: -50 }}
                    className="absolute inset-0 bg-white/10 rounded-3xl z-40 backdrop-blur-sm pointer-events-none flex items-center justify-center font-black text-white/40 tracking-widest text-lg"
                  >
                    COMBO BREAKER
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Cajas de texto limpias Zero-Scroll */}
            <div className="h-24 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {stage === 'waiting' && round < deck.length && (
                  <motion.p key="wait" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{ duration: 0.1 }} className="text-white/20 uppercase tracking-[0.5em] font-black cursor-default">
                    Atento...
                  </motion.p>
                )}
                {stage === 'stimulus' && (
                  <motion.h1 
                    key="stim" initial={{opacity:0, scale:0.7}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:1.2}}
                    transition={{ duration: 0.05 }}
                    className="text-6xl md:text-8xl font-black uppercase tracking-tighter"
                    style={{ color: activeColor, textShadow: `0 0 50px ${activeColor}` }}
                  >
                    {targetRef.current.label}
                  </motion.h1>
                )}
              </AnimatePresence>
            </div>
            
            <span className="absolute top-4 right-4 text-[10px] font-black tracking-widest text-white/30 uppercase bg-white/5 px-3 py-1 rounded-full border border-white/10">
              Ronda {round + 1} / {deck.length}
            </span>
          </div>
        </>
      )}

    </div>
  );
}
