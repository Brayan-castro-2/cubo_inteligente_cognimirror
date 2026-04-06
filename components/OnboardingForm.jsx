'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useBluetoothCube } from '../contexts/BluetoothContext';

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

  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState({
    horasSueno: 7,
    nivelAnimo: 5,
    nivelRuido: 5,
  });
  const [animating, setAnimating] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [entering, setEntering] = useState(false);

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
      // Última pregunta → completar
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
  // handleCubeMove es la función conectada al listener BLE
  const handleCubeMove = useCallback((movimiento) => {
    const isConfirm = movimiento === 'L' || movimiento === "L'"; // Cara Roja
    if (isConfirm) {
      handleNext();
      return;
    }

    const p = PREGUNTAS[stepIdx];
    if (!p) return;

    const isUp = movimiento === 'U' || movimiento === 'R';
    const isDown = movimiento === "U'" || movimiento === "R'";
    if (!isUp && !isDown) return;

    setValues(prev => {
      const current = prev[p.key];
      const next = isUp
        ? Math.min(p.max, current + 1)
        : Math.max(p.min, current - 1);
      if (next === current) return prev;
      playTick(isUp ? 'up' : 'down');
      triggerAnim();
      return { ...prev, [p.key]: next };
    });
  }, [stepIdx, triggerAnim, handleNext]);

  // ── Suscripción al contexto BLE global ─────────────────────────
  useEffect(() => {
    const unsub = subscribeToMoves(handleCubeMove);
    return unsub;
  }, [subscribeToMoves, handleCubeMove]);

  // ── Atajos de teclado (para desarrollo/demo) ───────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') handleCubeMove('U');
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') handleCubeMove("U'");
      if (e.key === 'Enter') handleCubeMove('L');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCubeMove]);

  const levelText = pregunta.levels[pregunta.levelFn(values[pregunta.key])];
  const isLast = stepIdx === PREGUNTAS.length - 1;

  return (
    <div className="min-h-screen bg-[#07080f] flex flex-col items-center justify-center relative overflow-hidden font-sans px-4">

      {/* Glow ambiental */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${pregunta.color}18 0%, transparent 65%)`,
        }}
      />

      {/* Progress dots */}
      <div className="absolute top-8 flex gap-2 z-10">
        {PREGUNTAS.map((p, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === stepIdx ? 28 : 8,
              height: 8,
              background: i <= stepIdx ? pregunta.color : '#1e2030',
              opacity: i < stepIdx ? 0.5 : 1,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-8 right-6 text-xs font-black uppercase tracking-widest text-white/20">
        {stepIdx + 1} / {PREGUNTAS.length}
      </div>

      {/* Contenido principal */}
      <div
        className="flex flex-col items-center gap-6 w-full max-w-sm z-10"
        style={{
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          opacity: exiting || entering ? 0 : 1,
          transform: exiting ? 'translateX(-30px)' : entering ? 'translateX(30px)' : 'translateX(0)',
        }}
      >
        {/* Ícono y título */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-5xl" style={{ filter: `drop-shadow(0 0 20px ${pregunta.color}80)` }}>
            {pregunta.icon}
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight">{pregunta.label}</h2>
          <p className="text-sm text-white/40 max-w-[260px] leading-relaxed">{pregunta.sublabel}</p>
        </div>

        {/* Dial circular */}
        <div className="relative">
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
          {/* Etiqueta semántica bajo el dial */}
          <div
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap"
            style={{ background: `${pregunta.color}20`, color: pregunta.color, border: `1px solid ${pregunta.color}40` }}
          >
            {levelText}
          </div>
        </div>

        {/* Controles manuales (fallback visual) */}
        <div className="flex items-center gap-6 mt-4">
          <button
            onClick={() => handleCubeMove("U'")}
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black transition-all active:scale-90"
            style={{
              background: `${pregunta.color}15`,
              border: `1px solid ${pregunta.color}30`,
              color: pregunta.color,
            }}
          >
            −
          </button>

          {/* Instruccion BLE */}
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[10px] uppercase tracking-widest font-black text-white/20">Gira el cubo</p>
            <div className="flex gap-1">
              {['U', 'U\'', 'R', 'R\''].map(m => (
                <span
                  key={m}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black"
                  style={{ background: `${pregunta.color}15`, color: `${pregunta.color}80` }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => handleCubeMove('U')}
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black transition-all active:scale-90"
            style={{
              background: `${pregunta.color}15`,
              border: `1px solid ${pregunta.color}30`,
              color: pregunta.color,
            }}
          >
            +
          </button>
        </div>

        {/* Min / Max labels */}
        <div className="flex justify-between w-full text-[10px] font-black uppercase tracking-widest text-white/20 px-4">
          <span>{pregunta.min === 0 ? '0 h' : pregunta.min + '/10'}</span>
          <span>{pregunta.formatVal(pregunta.max)}</span>
        </div>

        {/* Botón principal (Clickeable con mouse) */}
        <button
          onClick={handleNext}
          className="w-full mt-2 py-5 rounded-2xl font-black text-lg tracking-wide transition-all duration-200 active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${pregunta.color}, ${pregunta.color}bb)`,
            color: '#07080f',
            boxShadow: `0 0 40px ${pregunta.color}50`,
          }}
        >
          {isLast ? '🚀 Iniciar Prueba' : 'Siguiente →'}
        </button>

        {/* Footer de instrucción reubicado para evitar traslape */}
        <div className="w-full text-center mt-4">
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-black leading-relaxed">
            Ajusta con <span style={{color: pregunta.color}}>U</span> o <span style={{color: pregunta.color}}>R</span> <br/>
            Y Gira la cara <span className="text-red-400">ROJA (L)</span> para Avanzar
          </p>
        </div>

      </div>
    </div>
  );
}
