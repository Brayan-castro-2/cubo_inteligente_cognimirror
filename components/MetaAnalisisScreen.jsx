'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * COMPONENTE: MetaAnalisisScreen
 * Cruce de datos entre Fase 1 (Estándar) y Fase 2 (Flexibilidad)
 */
export default function MetaAnalisisScreen({ historialFase1, historialFase2 }) {
  
  const analysis = useMemo(() => {
    const calcStats = (history) => {
      const valid = history.filter(t => t.isCorrect && t.reactionTimeMs > 0);
      const avg = Math.round(valid.reduce((acc, t) => acc + t.reactionTimeMs, 0) / (valid.length || 1));
      const errors = history.filter(t => !t.isCorrect && (t.isImpulsivityError || t.expectedFace === 'F' || t.expectedFace === 'B' || t.expectedFace === 'U' || t.expectedFace === 'D')).length;
      
      // Dominancia
      const leftAvg = history.filter(t => (t.expectedFace === 'R' || t.expectedFace === 'U') && t.isCorrect && t.reactionTimeMs > 0).reduce((acc, t) => acc + t.reactionTimeMs, 0) / 5 || 0;
      const rightAvg = history.filter(t => (t.expectedFace === 'L' || t.expectedFace === 'D') && t.isCorrect && t.reactionTimeMs > 0).reduce((acc, t) => acc + t.reactionTimeMs, 0) / 5 || 0;
      let dom = 'Balanceada';
      if (leftAvg && rightAvg) {
        if (leftAvg < rightAvg - 30) dom = 'Mano Izquierda';
        else if (rightAvg < leftAvg - 30) dom = 'Mano Derecha';
      }
      
      return { avg, errors, dom };
    };

    const s1 = calcStats(historialFase1);
    const s2 = calcStats(historialFase2);

    // 1. Dominancia Matrix
    const domMatch = s1.dom === s2.dom;
    const insightDom = domMatch 
      ? 'Dominancia Anatómica Absoluta. Tu asimetría lateral es estructural y resistente a la carga cognitiva.'
      : 'Focalización Asimétrica Dinámica. Tu cerebro alterna el flujo de energía entre hemisferios para compensar la fatiga atencional.';

    // 2. Switch Cost
    const switchCost = s2.avg - s1.avg;
    const insightSwitch = switchCost <= 0 
      ? 'Efecto de Calentamiento / Flexibilidad de Élite. Superaste la Interferencia Proactiva y tus procesos motrices se agilizaron en la segunda fase.'
      : `Costo de Adaptación de ${switchCost}ms. Tu cerebro sufrió Interferencia Proactiva al tener que suprimir las reglas de la Fase 1.`;

    // 3. Ego Depletion
    const insightEgo = (s1.errors === 0 && s2.errors > 0)
      ? 'Agotamiento Prefrontal (Ego Depletion). Tu capacidad de inhibición se fatigó significativamente en la segunda fase.'
      : (s1.errors > 0 && s2.errors === 0)
      ? 'Adaptación Estratégica. Modulaste tu impulsividad y aprendiste a frenar con éxito bajo las nuevas reglas.'
      : s2.errors === 0 
      ? 'Control Inhibitorio Blindado. Mantuviste la precisión total en ambas configuraciones mentales.'
      : 'Persistencia de Impulsividad. Ambos modos presentaron fallos en el frenado motor.';

    return { s1, s2, switchCost, insightDom, insightSwitch, insightEgo };
  }, [historialFase1, historialFase2]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-12 bg-white/5 border border-white/10 p-6 rounded-[2.5rem] overflow-hidden"
    >
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white">Cruce de Datos: Meta-Análisis</h2>
          <p className="text-[9px] text-white/30 font-bold uppercase">Comparativa Estratégica Fase 1 vs Fase 2</p>
        </div>
      </div>

      {/* DOBLE COLUMNA COMPARATIVA */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {/* FAse 1 */}
        <div className="bg-white/5 p-4 rounded-3xl space-y-4 border border-white/5">
          <p className="text-[9px] font-black tracking-widest text-white/40 uppercase">Fase 1: Estándar</p>
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <span className="text-[8px] text-white/20 uppercase font-black">Velocidad</span>
              <span className="text-lg font-black text-white/80">{analysis.s1.avg}ms</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-[8px] text-white/20 uppercase font-black">Errores NO-GO</span>
              <span className={`text-lg font-black ${analysis.s1.errors > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{analysis.s1.errors}</span>
            </div>
            <div className="pt-2 border-t border-white/5">
              <p className="text-[8px] text-white/20 uppercase font-black mb-1">Mano Dominante</p>
              <p className="text-[10px] font-black text-cyan-400/80">{analysis.s1.dom.toUpperCase()}</p>
            </div>
          </div>
        </div>

        {/* FAse 2 */}
        <div className="bg-cyan-500/5 p-4 rounded-3xl space-y-4 border border-cyan-500/10 relative">
          <p className="text-[9px] font-black tracking-widest text-cyan-400/60 uppercase">Fase 2: Flexibilidad</p>
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <span className="text-[8px] text-white/20 uppercase font-black">Velocidad</span>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold ${analysis.switchCost <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {analysis.switchCost > 0 ? `+${analysis.switchCost}` : analysis.switchCost}ms
                </span>
                <span className="text-lg font-black text-cyan-400">{analysis.s2.avg}ms</span>
              </div>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-[8px] text-white/20 uppercase font-black">Errores NO-GO</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-cyan-400">{analysis.s2.errors}</span>
                {analysis.s2.errors > analysis.s1.errors && <span className="text-red-500 text-xs">↑</span>}
                {analysis.s2.errors < analysis.s1.errors && <span className="text-emerald-500 text-xs">↓</span>}
                {analysis.s2.errors === analysis.s1.errors && <span className="text-white/20 text-xs">→</span>}
              </div>
            </div>
            <div className="pt-2 border-t border-white/5">
              <p className="text-[8px] text-white/20 uppercase font-black mb-1">Efecto Hemisférico</p>
              <p className="text-[10px] font-black text-cyan-400">
                {analysis.s2.dom === analysis.s1.dom ? 'ESTABLE' : 'SHIFT DINÁMICO'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CONCLUSIONES CLÍNICAS */}
      <div className="bg-black/40 p-5 rounded-3xl border border-white/5 space-y-4">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-400">Diagnóstico Estratégico</h4>
        <div className="space-y-4 text-[11px] leading-relaxed text-white/60">
          <p className="flex gap-2">
            <span className="text-cyan-400 text-base leading-none">○</span>
            <span>{analysis.insightDom}</span>
          </p>
          <p className="flex gap-2 border-t border-white/5 pt-3">
            <span className="text-cyan-400 text-base leading-none">○</span>
            <span>{analysis.insightSwitch}</span>
          </p>
          <p className="flex gap-2 border-t border-white/5 pt-3">
            <span className="text-cyan-400 text-base leading-none">○</span>
            <span>{analysis.insightEgo}</span>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
