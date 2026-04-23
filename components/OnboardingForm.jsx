'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { useCubeState } from '../contexts/CubeStateContext';
import Cube3DViewer from './Cube3DViewer';

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO ENGINE — Web Audio API "tick" tecnológico
// ─────────────────────────────────────────────────────────────────────────────
function playTick(type = 'up') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(type === 'up' ? 880 : 440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(type === 'up' ? 1200 : 300, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.09);
    osc.onended = () => ctx.close();
  } catch (_) { /* silencioso si no hay soporte */ }
}

function playConfirm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.16);
      osc.onended = i === 2 ? () => ctx.close() : undefined;
    });
  } catch (_) { }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE LAS PREGUNTAS
// ─────────────────────────────────────────────────────────────────────────────
const PREGUNTAS = [
  {
    key: 'horasSueno',
    label: 'Horas de Sueño',
    sublabel: 'Anoche, ¿cuántas horas dormiste?',
    icon: '🌙',
    min: 0,
    max: 12,
    defaultVal: 7,
    unit: 'h',
    color: '#818cf8', // indigo
    trackColor: '#312e81',
    formatVal: (v) => `${v}h`,
    levels: ['Privación', 'Escaso', 'Normal', 'Óptimo', 'Exceso'],
    levelFn: (v) => v <= 4 ? 0 : v <= 5 ? 1 : v <= 7 ? 2 : v <= 9 ? 3 : 4,
  },
  {
    key: 'nivelAnimo',
    label: 'Estado de Ánimo',
    sublabel: '¿Cómo te sientes emocionalmente ahora mismo?',
    icon: '⚡',
    min: 1,
    max: 10,
    defaultVal: 5,
    unit: '/10',
    color: '#34d399', // emerald
    trackColor: '#064e3b',
    formatVal: (v) => `${v}/10`,
    levels: ['Muy bajo', 'Bajo', 'Neutral', 'Bueno', 'Excelente'],
    levelFn: (v) => v <= 2 ? 0 : v <= 4 ? 1 : v <= 6 ? 2 : v <= 8 ? 3 : 4,
  },
  {
    key: 'nivelRuido',
    label: 'Nivel de Ruido Ambiental',
    sublabel: '¿Cuánto ruido hay en tu entorno ahora?',
    icon: '🔊',
    min: 1,
    max: 10,
    defaultVal: 5,
    unit: '/10',
    color: '#fb923c', // orange
    trackColor: '#7c2d12',
    formatVal: (v) => `${v}/10`,
    levels: ['Silencio total', 'Muy tranquilo', 'Normal', 'Ruidoso', 'Muy ruidoso'],
    levelFn: (v) => v <= 2 ? 0 : v <= 4 ? 1 : v <= 6 ? 2 : v <= 8 ? 3 : 4,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE: Dial Circular SVG
// ─────────────────────────────────────────────────────────────────────────────
function CircularDial({ value, min, max, color, trackColor, label, formatVal, animating }) {
  const SIZE = 220;
  const STROKE = 14;
  const R = (SIZE - STROKE * 2) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * R;
  const GAP_DEGREES = 60; // ángulo libre en la parte inferior
  const ACTIVE_ARC = ((360 - GAP_DEGREES) / 360) * CIRCUMFERENCE;
  const progress = (value - min) / (max - min);
  const filledArc = progress * ACTIVE_ARC;
  const dashOffset = CIRCUMFERENCE - ACTIVE_ARC;

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ transform: `rotate(${90 + GAP_DEGREES / 2}deg)` }}
      >
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={trackColor}
          strokeWidth={STROKE}
          strokeDasharray={`${ACTIVE_ARC} ${CIRCUMFERENCE - ACTIVE_ARC}`}
          strokeDashoffset={-dashOffset / 2}
          strokeLinecap="round"
        />
        {/* Fill */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE + 2}
          strokeDasharray={`${filledArc} ${CIRCUMFERENCE - filledArc}`}
          strokeDashoffset={-dashOffset / 2}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 8px ${color}90)`,
            transition: 'stroke-dasharray 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </svg>

      {/* Valor central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="font-black tabular-nums"
          style={{
            fontSize: '3.5rem',
            color,
            textShadow: `0 0 30px ${color}60`,
            lineHeight: 1,
            transition: 'transform 0.1s ease',
            transform: animating ? 'scale(1.15)' : 'scale(1)',
          }}
        >
          {formatVal(value)}
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest mt-1" style={{ color: `${color}80` }}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: OnboardingForm
// ─────────────────────────────────────────────────────────────────────────────
export default function OnboardingForm({ onComplete, playerName }) {
  const { subscribeToMoves } = useBluetoothCube();
  const { cubeRotation: globalRotation } = useCubeState();

  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState({
    horasSueno: 7,
    nivelAnimo: 5,
    nivelRuido: 5,
  });
  
  const [animating, setAnimating] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [entering, setEntering] = useState(false);

  // Estados visuales de Confirmación L2
  const [flash, setFlash] = useState(null);
  const [pulse, setPulse] = useState(false);
  
  // Historial de movimientos para parseo L2
  const moveHistory = useRef([]);

  const pregunta = PREGUNTAS[stepIdx];

  // ── Animar cambio de valor ─────────────────────────────────────
  const triggerAnim = useCallback(() => {
    setAnimating(true);
    setTimeout(() => setAnimating(false), 120);
  }, []);

  // ── Navegación entre preguntas ─────────────────────────────────
  const handleNext = useCallback(() => {
    if (stepIdx < PREGUNTAS.length - 1) {
      playConfirm();
      setExiting(true);
      setTimeout(() => {
        setStepIdx(i => i + 1);
        setExiting(false);
        setEntering(true);
        setTimeout(() => setEntering(false), 300);
      }, 250);
    } else {
      playConfirm();
      setExiting(true);
      setTimeout(() => {
        onComplete({
          playerName: playerName || 'Anónimo',
          horasSueno: values.horasSueno,
          nivelAnimo: values.nivelAnimo,
          nivelRuido: values.nivelRuido,
          timestamp: new Date().toISOString(),
        });
      }, 300);
    }
  }, [stepIdx, values, onComplete, playerName]);

  // ── Lógica de movimiento del cubo ─────────────────────────────
  const handleCubeMove = useCallback((movimiento) => {
    if (exiting || entering) return;
    
    const now = Date.now();
    moveHistory.current.push({ m: movimiento, t: now });
    // Limpiamos memoria de movimientos de hace más de 1.2 segundos
    moveHistory.current = moveHistory.current.filter(x => now - x.t < 1200);

    // Detección Crítica L2 (Giro doble Cara Roja)
    const lMoves = moveHistory.current.filter(x => x.m === 'L').length;
    const lPrimeMoves = moveHistory.current.filter(x => x.m === "L'").length;
    const isL2 = movimiento === 'L2' || lMoves >= 2 || lPrimeMoves >= 2;

    if (isL2) {
      moveHistory.current = []; // Flush
      setFlash('green');
      setPulse(true);
      // Animación de 400ms antes de avanzar
      setTimeout(() => {
        setPulse(false);
        setFlash(null);
        handleNext();
      }, 400);
      return;
    }

    const p = PREGUNTAS[stepIdx];
    if (!p) return;

    // Dial de Precisión (Solo Cara Naranja - R)
    if (movimiento === 'R') {
      setValues(prev => {
        const current = prev[p.key];
        const next = Math.min(p.max, current + 1);
        if (next !== current) { playTick('up'); triggerAnim(); }
        return { ...prev, [p.key]: next };
      });
    } else if (movimiento === "R'") {
      setValues(prev => {
        const current = prev[p.key];
        const next = Math.max(p.min, current - 1);
        if (next !== current) { playTick('down'); triggerAnim(); }
        return { ...prev, [p.key]: next };
      });
    }
  }, [stepIdx, exiting, entering, triggerAnim, handleNext]);

  // ── Suscripción BLE ─────────────────────────
  useEffect(() => {
    const unsub = subscribeToMoves(handleCubeMove);
    return unsub;
  }, [subscribeToMoves, handleCubeMove]);

  // Atajos teclado interactivo
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowUp') handleCubeMove('R');
      if (e.key === 'ArrowDown') handleCubeMove("R'");
      if (e.key === 'Enter') handleCubeMove('L2');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCubeMove]);

  const levelText = pregunta.levels[pregunta.levelFn(values[pregunta.key])];

  return (
    <div className="h-screen w-full bg-[#07080f] flex flex-col items-center justify-center relative overflow-hidden font-sans">
      
      {/* Background Ambiental Dinámico */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: flash === 'green' 
            ? 'radial-gradient(circle at center, rgba(34,197,94,0.3) 0%, transparent 80%)'
            : `radial-gradient(ellipse at 50% 50%, ${pregunta.color}15 0%, transparent 70%)`,
        }}
      />

      {/* Progress */}
      <div className="absolute top-6 flex gap-2 z-10 w-full justify-center">
        {PREGUNTAS.map((p, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === stepIdx ? 32 : 8,
              height: 6,
              background: i <= stepIdx ? pregunta.color : '#1e2030',
              opacity: i < stepIdx ? 0.5 : 1,
            }}
          />
        ))}
      </div>

      <div
        className="flex flex-col items-center w-full max-w-4xl z-10 mt-4 px-4"
        style={{
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          opacity: exiting || entering ? 0 : 1,
          transform: exiting ? 'scale(0.95)' : entering ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        {/* Cabecera Textual */}
        <div className="flex flex-col items-center gap-1 text-center mb-6">
          <span className="text-4xl" style={{ filter: `drop-shadow(0 0 15px ${pregunta.color}80)` }}>
            {pregunta.icon}
          </span>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">{pregunta.label}</h2>
          <p className="text-sm text-white/50 max-w-sm leading-relaxed">{pregunta.sublabel}</p>
        </div>

        {/* ── CORE: LAYOUT HORIZONTAL EN DESKTOP, VERTICAL EN MOBILE ── */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 w-full">
          
          {/* BLOQUE IZQUIERDO: EL DIAL */}
          <div className="flex flex-col items-center relative">
            <CircularDial
              value={values[pregunta.key]}
              min={pregunta.min}
              max={pregunta.max}
              color={pregunta.color}
              trackColor={pregunta.trackColor}
              label={pregunta.unit}
              formatVal={pregunta.formatVal}
              animating={animating}
            />
            <div
              className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
              style={{ background: `${pregunta.color}20`, color: pregunta.color, border: `1px solid ${pregunta.color}40` }}
            >
              {levelText}
            </div>
          </div>

          {/* BLOQUE DERECHO: DIGITAL TWIN Y HUD BURBUJAS */}
          <div className="flex flex-col items-center mt-6 md:mt-0">
            
            {/* El Cubo Virtual en el Centro Estratégico */}
            <div 
              className="rounded-3xl border p-2 relative shadow-2xl transition-all duration-300"
              style={{ 
                transform: pulse ? 'scale(1.1)' : 'scale(1)', 
                borderColor: flash === 'green' ? '#22c55e' : 'rgba(255,255,255,0.05)',
                background: flash === 'green' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.02)',
                boxShadow: flash === 'green' ? '0 0 80px rgba(34,197,94,0.3)' : '0 10px 30px rgba(0,0,0,0.5)'
              }}
            >
              <Cube3DViewer size={260} status="gyro_active" targetRotation={globalRotation} />
            </div>

            {/* Burbujas de Instrucción Rediseñadas (Debajo del Cubo) */}
            <div className="flex items-stretch justify-center gap-3 mt-5 w-full max-w-[340px]">
               {/* Burbuja Izquierda (Confirmar) */}
               <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
                 <span className="text-[11px] font-black tracking-widest text-red-500 mb-1">Mano Izquierda</span>
                 <span className="text-white text-[10px] text-center font-bold uppercase" style={{textShadow: '0 0 10px rgba(255,0,0,0.5)'}}>
                   L2: CONFIRMAR<br/>(Giro Doble)
                 </span>
               </div>
               
               {/* Burbuja Derecha (Ajustar) */}
               <div className="flex-1 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-50" />
                 <span className="text-[11px] font-black tracking-widest text-orange-500 mb-1">Mano Derecha</span>
                 <span className="text-white/80 text-[10px] text-center uppercase font-bold">
                   R: Subir<br/>R': Bajar
                 </span>
               </div>
            </div>

          </div>

        </div>

        {/* Botón Fallback Mouse (Discreto) */}
        <button
          onClick={handleNext}
          className="mt-10 px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 text-white/30 border border-white/10 hover:bg-white/5"
        >
          {stepIdx === PREGUNTAS.length - 1 ? 'Iniciar Manual' : 'Siguiente Manual'}
        </button>

      </div>
    </div>
  );
}
