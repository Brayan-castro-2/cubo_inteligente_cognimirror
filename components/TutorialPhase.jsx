'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { useCubeState } from '../contexts/CubeStateContext';
import Cube3DViewer from './Cube3DViewer';

// ═══════════════════════════════════════════
//  CONSTANTE FUERA DEL COMPONENTE
//  (evita re-creación por render y closures stale)
// ═══════════════════════════════════════════
const PHASES = {
  1: { text: 'Coloca el Amarillo hacia abajo y confirma' },
  2: {
    type: 'mirror',
    face: 'R',               // R = Right = Naranja en el cubo estándar
    expectedBLE: ['R'],       // El sensor envía 'R' al girar la cara derecha
    demoMoves: ['R'],         // Demo: gira R 90° fluido
    label: 'DERECHA (Naranja)',
  },
  3: {
    type: 'mirror',
    face: 'L',               // L = Left = Rojo en el cubo estándar
    expectedBLE: ['L'],       // El sensor envía 'L' al girar la cara izquierda
    demoMoves: ['L'],         // Demo: gira L 90° fluido
    label: 'IZQUIERDA (Rojo)',
  },
  4: { text: 'Si ves VERDE o AZUL, 🛑 NO MUEVAS NADA', type: 'info', duration: 2500 },
  5: { text: '¡Calibración Completa!', type: 'final' },
};

export default function TutorialPhase({ onCompleteTutorial }) {
  const { subscribeToMoves } = useBluetoothCube();
  const { cubeRotation: globalRotation } = useCubeState();

  const [stage, setStage] = useState('dual');
  const [fase, setFase] = useState(1);
  const [subFase, setSubFase] = useState(null);
  const [isAligned, setIsAligned] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [autoProgressing, setAutoProgressing] = useState(false);
  const [isAnimatingDemo, setIsAnimatingDemo] = useState(false);
  const [currentDemoMoves, setCurrentDemoMoves] = useState(null);
  const [demoKey, setDemoKey] = useState(0);

  // Refs para acceder al valor actual dentro de closures
  const faseRef = useRef(fase);
  const subFaseRef = useRef(subFase);
  const ignoreInputRef = useRef(false);

  // Mantener refs sincronizados con state
  useEffect(() => { faseRef.current = fase; }, [fase]);
  useEffect(() => { subFaseRef.current = subFase; }, [subFase]);

  // ── Flash verde + avanzar ──
  const advanceWithFlash = useCallback((nextFase) => {
    setFlashSuccess(true);
    setCurrentDemoMoves(null);
    ignoreInputRef.current = true;
    setTimeout(() => {
      setFlashSuccess(false);
      setFase(nextFase);
      setSubFase(null);
      setIsAnimatingDemo(false);
      ignoreInputRef.current = false;
    }, 500); // REFINADO: Transición acelerada a 500ms
  }, []);

  // ═══════════════════════════════════════════
  //  MAESTRO-APRENDIZ / INFO: Demo → Acción
  // ═══════════════════════════════════════════
  useEffect(() => {
    const p = PHASES[fase];
    if (!p) return;

    if (p.type === 'info') {
       ignoreInputRef.current = true;
       const infoTimer = setTimeout(() => {
          advanceWithFlash(fase + 1);
       }, p.duration || 2000);
       return () => clearTimeout(infoTimer);
    }

    if (p.type !== 'mirror') return;

    ignoreInputRef.current = true;
    let actionTimer;

    console.log(`[MAESTRO] Fase ${fase}: Entrando, esperando centrado...`);
    setSubFase('demo'); // Iniciamos en estado demo pero sin mover aún el cubo

    const startTimer = setTimeout(() => {
      // PASO A: DEMO
      console.log(`[MAESTRO] Fase ${fase}: DEMO → ${p.label} (moves: ${p.demoMoves.join(',')})`);
      setIsAnimatingDemo(true);
      setCurrentDemoMoves([...p.demoMoves]);
      setDemoKey(k => k + 1);

      // PASO B: ACCIÓN (después de 1.8s desde que empieza la demo para hacerlo fast-track)
      actionTimer = setTimeout(() => {
        console.log(`[MAESTRO] Fase ${fase}: ACCIÓN → esperando BLE: ${p.expectedBLE.join(',')}`);
        setSubFase('action');
        setIsAnimatingDemo(false);
        setCurrentDemoMoves(null);
        ignoreInputRef.current = false;
      }, 1800);

    }, 800); // 0.8s delay para acelerar el tutorial

    return () => {
      clearTimeout(startTimer);
      clearTimeout(actionTimer);
    };
  }, [fase]);

  const handleDemoComplete = useCallback(() => {
    console.log('[CUBE3D] Demo animation done');
  }, []);

  // ═══════════════════════════════════════════
  //  VALIDACIÓN BLE (usa refs para evitar closures stale)
  // ═══════════════════════════════════════════
  useEffect(() => {
    const unsub = subscribeToMoves((move) => {
      // Leer valores ACTUALES desde refs, no desde el closure
      const currentFase = faseRef.current;
      const currentSub = subFaseRef.current;
      const p = PHASES[currentFase];
      const letter = move.charAt(0);

      console.log(`[BLE IN] "${move}" | fase=${currentFase} sub=${currentSub} expected=${p?.expectedBLE?.join(',') || '-'} blocked=${ignoreInputRef.current}`);

      if (ignoreInputRef.current) return;

      if (p?.type === 'mirror' && currentSub === 'action') {
        const isCorrect = p.expectedBLE.includes(letter);
        console.log(`[BLE CHECK] got="${letter}" want="${p.expectedBLE}" → ${isCorrect ? '✅ MATCH' : '❌ NO MATCH'}`);

        if (isCorrect) {
          ignoreInputRef.current = true;
          setIsAligned(true);
          setTimeout(() => {
            setIsAligned(false);
            advanceWithFlash(currentFase + 1);
          }, 400); // Acelerado éxito
        }
      }
    });
    return () => unsub();
  }, [subscribeToMoves, advanceWithFlash]);

  // ═══════════════════════════════════════════
  //  CONFIRMACIÓN MANUAL (FASE 1)
  // ═══════════════════════════════════════════
  const handleConfirmPosition = () => {
    setAutoProgressing(true);
    setIsAligned(true);
    setTimeout(() => {
      setStage('centered');
      setIsAligned(false);
      setAutoProgressing(false);
      advanceWithFlash(2);
    }, 600); // Acelerado confirm
  };

  // Texto dinámico
  const getDisplayText = () => {
    const p = PHASES[fase];
    if (!p) return '';
    if (p.type === 'mirror') {
      return subFase === 'demo'
        ? `Observa el movimiento: ${p.label}`
        : `¡Tu turno! Gira la cara ${p.label}`;
    }
    return p.text;
  };

  // ═══════════════════════════════════════════
  //  RENDER (Zero-scroll HUD)
  // ═══════════════════════════════════════════
  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col justify-between items-center bg-[#08090c] text-white relative py-8">

      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[140px] transition-colors duration-700 opacity-15 ${
          flashSuccess ? 'bg-green-400' : isAligned ? 'bg-green-500' : 'bg-blue-700'
        }`} />
      </div>

      {/* Header */}
      <div className="z-10 text-center shrink-0">
        <h1 className="text-xl font-black tracking-widest uppercase text-white/85">Calibración Inteligente</h1>
        <div className="flex items-center justify-center gap-2 mt-0.5">
          <div className="h-px w-8 bg-blue-600" />
          <span className="text-[8px] font-black text-blue-500 uppercase tracking-[0.4em]">CogniMirror Engine</span>
          <div className="h-px w-8 bg-blue-600" />
        </div>
      </div>

      {/* Viewport (ARRIBA) */}
      <div className="z-20 w-full max-w-5xl flex items-center justify-center gap-6 px-4 shrink-0 my-4">

        <motion.div
          animate={{ flex: stage === 'centered' ? 1 : 0.5 }}
          transition={{ type: 'spring', stiffness: 100, damping: 18 }}
          className="flex flex-col items-center gap-2 min-h-0"
        >
          <span className={`px-3 py-0.5 border rounded-full text-[8px] font-black tracking-[0.2em] uppercase shrink-0 transition-colors duration-500 ${
            subFase === 'demo' ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400 animate-pulse' :
            subFase === 'action' ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' :
            'bg-blue-600/10 border-blue-500/25 text-blue-400'
          }`}>
            {subFase === 'demo' ? 'MIRA LA DEMOSTRACIÓN...' : subFase === 'action' ? '¡TU TURNO!' : 'CUBO ESPEJO · LIVE'}
          </span>
          <div className={`rounded-2xl border p-1 relative shrink-0 transition-all duration-500 ${
            subFase === 'demo' ? 'border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_40px_rgba(234,179,8,0.15)]' :
            subFase === 'action' ? 'border-cyan-500/40 bg-cyan-500/5 shadow-[0_0_40px_rgba(6,182,212,0.15)]' :
            'border-white/5 bg-white/[0.02]'
          }`}>
            <Cube3DViewer
              size={stage === 'centered' ? 340 : 300}
              status="gyro_active"
              targetRotation={globalRotation}
              ignoreSensor={isAnimatingDemo}
              demoMoves={currentDemoMoves}
              demoKey={demoKey}
              onDemoComplete={handleDemoComplete}
            />
            <AnimatePresence>
              {isAligned && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-2xl border-[3px] border-green-500/50 pointer-events-none flex items-start justify-end p-2"
                >
                  <div className="flex items-center gap-1 bg-green-500/20 backdrop-blur-sm rounded-full px-2 py-0.5">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-1.5 h-1.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-[8px] font-black text-green-400 uppercase">OK</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="text-[8px] text-white/20 font-medium tracking-wide text-center max-w-[300px] leading-relaxed shrink-0">
            Sincronización de caras y giros mecánicos vía Bluetooth.
          </p>
        </motion.div>

        <AnimatePresence>
          {stage === 'dual' && (
            <motion.div
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 100, damping: 18 }}
              className="flex flex-col items-center gap-2 min-h-0"
            >
              <span className="px-3 py-0.5 bg-white/5 border border-white/10 rounded-full text-[8px] font-black tracking-[0.2em] text-white/35 uppercase shrink-0">
                Estado Objetivo
              </span>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-1 relative shrink-0">
                <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-between py-4 px-2">
                  <div className="flex flex-col items-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_6px_white]" />
                    <span className="text-[6px] font-black text-white/50 uppercase tracking-wider">Blanco</span>
                  </div>
                  <div className="w-full flex justify-between items-center px-4">
                    <div className="flex flex-col items-center">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_6px_#ef4444]" />
                      <span className="text-[6px] font-black text-red-500/60 uppercase">Rojo</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full shadow-[0_0_6px_#f97316]" />
                      <span className="text-[6px] font-black text-orange-500/60 uppercase">Naranja</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[6px] font-black text-yellow-500/50 uppercase tracking-wider">Amarillo</span>
                    <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-[0_0_6px_#eab308]" />
                  </div>
                </div>
                <Cube3DViewer size={300} isLocked={true} />
              </div>
              <p className="text-[8px] text-white/20 font-medium tracking-wide text-center max-w-[300px] leading-relaxed shrink-0">
                Referencia visual. Tu cubo físico debe verse así.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Instrucción Flotante (ABAJO) */}
      <div className={`z-30 w-full max-w-lg mx-4 px-6 py-4 rounded-2xl backdrop-blur-md flex flex-col items-center text-center gap-3 shrink-0 border transition-all duration-300 ${
        flashSuccess
          ? 'bg-green-500/10 border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.15)]'
          : 'bg-white/[0.02] border-white/10 shadow-lg'
      }`}>
        <div className="flex flex-col items-center w-full">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em]">Instrucción</span>
            {subFase === 'demo' && <span className="text-[9px] animate-pulse text-yellow-400 font-bold uppercase">👁️ Observa</span>}
            {subFase === 'action' && <span className="text-[9px] text-cyan-400 font-bold uppercase animate-pulse">🤚 Tu turno</span>}
            {autoProgressing && <span className="text-[9px] animate-pulse text-green-400 font-bold">Procesando...</span>}
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={`${fase}-${subFase}`}
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`text-base sm:text-lg font-black tracking-tight ${flashSuccess ? 'text-green-300' : 'text-white'}`}
            >
              {getDisplayText()}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center mt-2 w-full">
          {fase === 1 ? (
            <button
              onClick={handleConfirmPosition}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-[0_0_14px_rgba(34,197,94,0.2)] whitespace-nowrap w-full sm:w-auto"
            >
              ¡En posición!
            </button>
          ) : fase >= 5 ? (
            <button
              onClick={onCompleteTutorial}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] group whitespace-nowrap w-full sm:w-auto"
            >
              Iniciar Test <span className="inline-block group-hover:translate-x-1 transition-transform ml-1">→</span>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-1 opacity-50">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full animate-pulse ${subFase === 'action' ? 'bg-cyan-400' : 'bg-yellow-400'}`} />
                <span className="text-[9px] font-black text-white/50 uppercase tracking-[0.2em]">
                  {subFase === 'action' ? 'Esperando giro físico...' : 'Demostración activa'}
                </span>
              </div>
              <span className="text-[8px] font-bold text-white/20 uppercase mt-0.5">Fase {fase} / 5</span>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-30 shrink-0">
        {[1,2,3,4,5].map(i => (
          <div key={i} className={`h-1 rounded-full transition-all duration-500 ${fase >= i ? 'w-6 bg-blue-500' : 'w-2 bg-white/20'}`} />
        ))}
      </div>
    </div>
  );
}
