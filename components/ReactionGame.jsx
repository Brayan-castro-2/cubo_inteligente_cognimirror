'use client';

import { useEffect, useRef } from 'react';
import { useReactionGame } from '../hooks/useReactionGame';
import ExecutiveReport from './ExecutiveReport';
import AnimatedCube from './AnimatedCube';

// ─────────────────────────────────────────────────────────────
// FIREWALL ARQUITECTÓNICO: Lógica local del juego (Alineada a BLE Global)
// ROJA = Cara L (Izquierda) | NARANJA = Cara R (Derecha)
// ─────────────────────────────────────────────────────────────

export default function ReactionGame({ onExit, playerName, sessionMeta }) {
  const game = useReactionGame();
  const sessionRecordRef = useRef(null); // Almacena el payload sin re-renders

  // ── Arrancar el juego automáticamente al montar ──────────
  useEffect(() => {
    const timer = setTimeout(() => game.start(), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Se delegó el render visual y los colores al componente animado AnimatedCube ──

  // ── Doble Persistencia al finalizar ──────────────────────
  useEffect(() => {
    if (game.playState !== 'results') return;
    if (sessionRecordRef.current) return; // Ya se guardó, no duplicar

    let rightTotal = 0, rightCount = 0;
    let leftTotal  = 0, leftCount  = 0;
    let impulsivityErrors = 0;

    game.gameData.forEach(t => {
      if (t.isFalseStart) {
        impulsivityErrors++;
        if (t.actualFace === 'R') { rightTotal -= 25; rightCount++; }
        if (t.actualFace === 'L') { leftTotal  -= 25; leftCount++;  }
      }
      if (t.isOmission)    impulsivityErrors++;
      if (t.firstMoveWrong) impulsivityErrors++;

      if (t.isCorrect && t.reactionTimeMs > 0) {
        if (t.expectedFace === 'R') { rightTotal += t.reactionTimeMs; rightCount++; }
        if (t.expectedFace === 'L') { leftTotal  += t.reactionTimeMs; leftCount++;  }
      }
    });

    const avgR = rightCount ? rightTotal / rightCount : 0;
    const avgL = leftCount  ? leftTotal  / leftCount  : 0;
    let dominance = 'Ambidiestro';
    if (avgR > 0 && avgL > 0) {
      if (avgR + 30 < avgL) dominance = 'Derecha';
      else if (avgL + 30 < avgR) dominance = 'Izquierda';
    } else if (avgR > 0) dominance = 'Derecha';
    else if (avgL > 0)   dominance = 'Izquierda';

    const validT   = game.gameData.filter(t => t.isCorrect && t.reactionTimeMs > 0);
    const avgTotal = validT.length
      ? validT.reduce((a, b) => a + b.reactionTimeMs, 0) / validT.length
      : 0;

    const record = {
      id: crypto.randomUUID(),
      playerName: playerName || 'Anónimo',
      date: new Date().toISOString(),
      sessionMeta: sessionMeta || null, // Datos del onboarding: sueño, ánimo, ruido
      metrics: { dominance, averageReactionTime: Math.round(avgTotal), impulsivityScore: impulsivityErrors },
      rawTurnsData: game.gameData
    };

    // Persistencia Local
    const db = JSON.parse(localStorage.getItem('cogniMirror_DB') || '[]');
    db.push(record);
    localStorage.setItem('cogniMirror_DB', JSON.stringify(db));

    // Simulación de nube (descomenta cuando tengas endpoint)
    // fetch('/api/save-game', { method: 'POST', body: JSON.stringify(record) });
    console.log('✅ Guardado local OK. Payload:', record);

    sessionRecordRef.current = record;
  }, [game.playState, game.gameData, playerName]);

  // ── PANTALLA DE RESULTADOS (Nuevo Reporte Ejecutivo) ────────
  if (game.playState === 'results') {
    return (
      <ExecutiveReport
        playerName={playerName}
        date={new Date().toISOString()}
        rawTurnsData={game.gameData}
        latencyOffset={game.latencyOffset}
        recordId={sessionRecordRef.current?.id}
        onRestart={() => { sessionRecordRef.current = null; game.start(); }}
        onExit={onExit}
      />
    );
  }

  // ── UI LIMPIA ─────────────────────────────────────────────
  return (
    <div
      className="relative min-h-screen font-sans flex items-center justify-center transition-colors duration-150"
      style={{ backgroundColor: game.visualFeedback === 'error' ? '#450a0a' : '#07080f' }}
    >
      {/* HUD SUPERIOR */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-white/50 font-semibold tracking-wide">
        <div>Turno {game.currentTurn + 1}/{game.totalTurns}</div>
        <div className="flex gap-1 text-2xl">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={i < game.lives ? 'opacity-100' : 'opacity-20 grayscale'}>
              ❤️
            </span>
          ))}
        </div>
      </div>

      {/* BLOQUE CENTRAL DE ESTÍMULO (Responsivo) */}
      <div className="w-full max-w-sm px-6 flex flex-col items-center gap-8 relative z-10">
        <AnimatedCube 
          targetColor={game.expectedFace} 
          status={game.visualFeedback || game.playState} 
        />
        <p className={`text-xs font-bold tracking-[0.3em] uppercase transition-all duration-300 ${game.playState === 'showing_color' ? 'text-white animate-pulse' : 'text-white/20'}`}>
          {game.playState === 'showing_color' ? '¡Gira ahora!' : 'Espera...'}
        </p>
      </div>
    </div>
  );
}
