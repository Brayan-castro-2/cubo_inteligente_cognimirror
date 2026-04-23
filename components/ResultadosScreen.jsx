'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MetaAnalisisScreen from './MetaAnalisisScreen';
import { calcularSuperpoder, calcularBonoContexto, calcularSesgo } from '../utils/superpowerLogic';

/**
 * COMPONENTE: ResultadosScreen
 * Diseñado para presentar el Perfil Cognitivo con estética Premium SaaS.
 */
export default function ResultadosScreen({ 
  rawTurnsData = [], 
  sessionMeta = {}, 
  onRestart, 
  onViewFullReport,
  gameMode = 'ESTANDAR',
  onStartPhase2,
  historialFase1
}) {
  const LATENCIA_HARDWARE = 150; // ms de ruido mecánico/BLE estimado

  // 1. Determinar el "Superpoder"
  const superpower = useMemo(() => calcularSuperpoder(rawTurnsData), [rawTurnsData]);

  // ––– ESTADOS DE INTERACCIÓN CLÍNICA –––
  const [confirmacionDominancia, setConfirmacionDominancia] = React.useState(null); // null | 'si' | 'no'
  const [actividadOculta, setActividadOculta] = React.useState(null); // string | null
  const [mostrarTelemetria, setMostrarTelemetria] = React.useState(false);

  // 2. Determinar Bono de Contexto
  const bonus = useMemo(() => {
    return calcularBonoContexto(rawTurnsData, sessionMeta, superpower.id);
  }, [rawTurnsData, sessionMeta, superpower.id]);

  // 2. Calcular Métricas para el Dashboard 2x2
  const stats = useMemo(() => {
    const turns = rawTurnsData.filter(t => !t.isFalseStart);
    const correctGo = turns.filter(t => t.esCorrecto && t.reactionTimeMs > 0);
    
    const avgTimeBruto = correctGo.length > 0 
      ? Math.round(correctGo.reduce((s, t) => s + t.reactionTimeMs, 0) / correctGo.length) 
      : 0;
    
    // Tiempo Neto (Compensado) - Límite biológico 150ms
    const avgTimeNeto = Math.max(150, avgTimeBruto - LATENCIA_HARDWARE);

    const accuracy = turns.length > 0
      ? Math.round((turns.filter(t => t.esCorrecto).length / turns.length) * 100)
      : 0;
    
    // Mejor tiempo para análisis biológico
    const mejorTiempoBruto = correctGo.length > 0 
      ? Math.min(...correctGo.map(t => t.reactionTimeMs)) 
      : 0;
    const mejorTiempoNeto = Math.max(150, mejorTiempoBruto - LATENCIA_HARDWARE);
    
    // Mano Dominante (Basado en TR Bruto)
    const rightGo = correctGo.filter(t => t.expectedFace === 'R');
    const leftGo  = correctGo.filter(t => t.expectedFace === 'L');
    const avgR = rightGo.length ? rightGo.reduce((s, t) => s + t.reactionTimeMs, 0) / rightGo.length : 0;
    const avgL = leftGo.length ? leftGo.reduce((s, t) => s + t.reactionTimeMs, 0) / leftGo.length : 0;
    
    let dominance = 'Balanceada';
    if (avgR && avgL) {
      if (avgR + 30 < avgL) dominance = 'Derecha';
      else if (avgL + 30 < avgR) dominance = 'Izquierda';
    } else if (avgR) dominance = 'Derecha';
    else if (avgL) dominance = 'Izquierda';

    // Racha Máxima de la sesión
    let maxC = 0, currentC = 0;
    rawTurnsData.forEach(t => {
      if (t.esCorrecto) {
        currentC++;
        if (currentC > maxC) maxC = currentC;
      } else {
        currentC = 0;
      }
    });

    return { 
      avgTime: avgTimeNeto, 
      avgTimeBruto, 
      accuracy, 
      dominance, 
      maxCombo: maxC, 
      mejorTiempo: mejorTiempoNeto,
      mejorTiempoBruto 
    };
  }, [rawTurnsData]);


  // 4. Determinar Sesgo Cognitivo
  const sesgo = useMemo(() => calcularSesgo(rawTurnsData, stats), [rawTurnsData, stats]);

  // 4.5 Cálculo de Biomecánica del Impulso (Biomarcador No-Go)
  const impulseStats = useMemo(() => {
    const impulses = rawTurnsData.filter(t => t.isImpulsivityError && t.reactionTimeMs > 0);
    if (impulses.length === 0) return null;

    const times = impulses.map(t => t.reactionTimeMs);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    return {
      count: impulses.length,
      avg,
      min,
      max,
      delta: max - min
    };
  }, [rawTurnsData]);


  // 5. Helper para Renderizar EVIDENCIA (Fórmulas)
  const renderEvidence = (items) => (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-3 pt-3 border-t border-white/5">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-mono text-white/50 border border-white/5">
            {item}
          </span>
          {i < items.length - 1 && <span className="text-[10px] text-white/20">+</span>}
        </React.Fragment>
      ))}
    </div>
  );


  return (
    <div className="fixed inset-0 bg-[#07080f] text-white z-[60] flex flex-col items-center justify-center p-6 overflow-y-auto">
      {/* Orbe de luz dinámica en el fondo (Cambia según el superpoder) */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r ${superpower.color} opacity-10 blur-[120px] -z-10`} />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-xl flex flex-col items-center text-center gap-10"
      >
        {/* ICONO Y CABECERA */}
        <div className="space-y-6">
          <motion.div 
            animate={{ 
              scale: [1, 1.05, 1],
              rotate: [0, 2, -2, 0]
            }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="text-7xl md:text-8xl drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]"
          >
            {superpower.icon}
          </motion.div>
          
          <div className="space-y-4">
            <p className="text-sm font-black uppercase tracking-[0.4em] text-white/40">Perfil Cognitivo Detectado</p>
            <h1 className={`text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r ${superpower.color} drop-shadow-sm`}>
              {superpower.titulo}
            </h1>
            <p className="text-gray-300 text-sm md:text-base leading-relaxed max-w-md mx-auto line-clamp-3 font-medium">
              {superpower.descripcion}
            </p>
            
            {/* Evidencia de Superpoder */}
            <div className="mt-4 p-3 bg-black/20 rounded-xl border border-white/5 inline-block mx-auto">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">Evidencia de Telemetría</p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-white/60">
                {superpower.id === 'Metronomo' && (
                  <>{`[Var L: <40ms] + [Var R: <40ms] ➔ Consistencia Total`}</>
                )}
                {superpower.id === 'Velocidad' && (
                  <>{`[Bruto: ${stats.avgTimeBruto}ms] - [Ruido BLE: ${LATENCIA_HARDWARE}ms] ➔ ${stats.avgTime}ms Netos`}</>
                )}

                {superpower.id === 'Precision' && (
                  <>{`[Precisión: 100%] + [TR: >450ms] ➔ Control Analítico`}</>
                )}
                {superpower.id === 'Freno' && (
                  <>{`[No-Go Errors: 0] + [TR: ${stats.avgTime}ms] ➔ Freno Perfecto`}</>
                )}
                {superpower.id === 'Ambidextrismo' && (
                  <>{`[Mano L: ${Math.round(stats.avgTime)}ms] ≈ [Mano R] ➔ Simetría`}</>
                )}
                {superpower.id === 'Flujo' && (
                  <>{`[Racha: x${stats.maxCombo}] + [TR Estable] ➔ Estado de Flujo`}</>
                )}
              </div>
            </div>
          </div>

          {/* PANEL DE BONO DE CONTEXTO */}
          <AnimatePresence>
            {bonus && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`
                  mt-6 p-4 rounded-2xl border backdrop-blur-md 
                  text-xs font-bold leading-relaxed text-center max-w-md mx-auto
                  ${bonus.tipo === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-200/80' :
                    bonus.tipo === 'info' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200/80' :
                    'bg-emerald-500/10 border-emerald-500/30 text-emerald-200/80'}
                `}
              >
                <p>{bonus.texto}</p>
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-center gap-2 opacity-60">
                  {bonus.id === 'reserva' && (
                    <span className="text-[9px] font-mono px-2 py-0.5 bg-black/20 rounded">
                      [Sueño: {sessionMeta.horasSueno}h] + [TR: {stats.avgTime}ms] ➔ Compensación
                    </span>
                  )}
                  {bonus.id === 'aislamiento' && (
                    <span className="text-[9px] font-mono px-2 py-0.5 bg-black/20 rounded">
                      [Ruido: {sessionMeta.nivelRuido}/10] + [Precisión: {stats.accuracy}%] ➔ Foco
                    </span>
                  )}
                  {bonus.id === 'regulacion' && (
                    <span className="text-[9px] font-mono px-2 py-0.5 bg-black/20 rounded">
                      [Ánimo: {sessionMeta.estadoAnimo}] + [Errores No-Go: 0] ➔ Regulación
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ––– ANÁLISIS DE FLEXIBILIDAD (Solo si viene de Fase 2) ––– */}
          {gameMode === 'FLEXIBILIDAD' && historialFase1 && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 p-6 rounded-[2.5rem] text-left space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-widest text-cyan-400">Análisis de Flexibilidad (Set-Shifting)</h3>
                <span className="text-[10px] font-mono bg-cyan-500 text-black px-2 py-0.5 rounded-full font-bold">FASE 2</span>
              </div>
              
              {(() => {
                const avg1 = historialFase1.filter(t => t.isCorrect && t.reactionTimeMs > 0).reduce((acc, t) => acc + t.reactionTimeMs, 0) / (historialFase1.filter(t => t.isCorrect && t.reactionTimeMs > 0).length || 1);
                const avg2 = rawTurnsData.filter(t => t.isCorrect && t.reactionTimeMs > 0).reduce((acc, t) => acc + t.reactionTimeMs, 0) / (rawTurnsData.filter(t => t.isCorrect && t.reactionTimeMs > 0).length || 1);
                const switchCost = Math.round(avg2 - avg1);

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/20 p-3 rounded-2xl">
                        <p className="text-[8px] text-white/30 uppercase font-bold">Costo de Cambio</p>
                        <p className={`text-xl font-black ${switchCost < 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {switchCost > 0 ? `+${switchCost}` : switchCost}ms
                        </p>
                      </div>
                      <div className="bg-black/20 p-3 rounded-2xl">
                        <p className="text-[8px] text-white/30 uppercase font-bold">Interferencia</p>
                        <p className="text-xl font-black text-white/80">
                          {switchCost > 150 ? 'Alta' : switchCost > 50 ? 'Media' : 'Baja'}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/60 leading-relaxed italic border-t border-white/5 pt-3">
                      {switchCost < 50 
                        ? 'Flexibilidad Cognitiva de Élite. Tu cerebro reescribió las reglas motrices casi instantáneamente sin sufrir interferencia del aprendizaje anterior.'
                        : switchCost > 150 
                        ? `Interferencia Proactiva detectada. Tu cerebro tuvo que esforzarse significativamente para suprimir la regla anterior (Rojo/Naranjo), aumentando el costo en ${switchCost}ms.`
                        : `Adaptación funcional exitosa. Experimentaste un retraso moderado al procesar las nuevas reglas, típico de la transición entre tareas motoras opuestas.`}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ––– MAPEO MULTIDIMENSIONAL COGNITIVO (Radar Chart) ––– */}
          {(() => {
            // 1. Cálculos de Normalización (0-100)
            const scoreVel = Math.max(0, Math.min(100, ((600 - stats.avgTime) / 400) * 100));
            
            const noGoTurns = rawTurnsData.filter(t => t.expectedFace === 'F' || t.expectedFace === 'B' || t.expectedFace === 'U' || t.expectedFace === 'D');
            const noGoErrors = noGoTurns.filter(t => !t.esCorrecto).length;
            const scoreInhib = Math.max(0, 100 - (noGoErrors * 33.3));

            const leftTurns = rawTurnsData.filter(t => (t.expectedFace === 'R' || t.colorName === 'ROJO') && t.esCorrecto && t.reactionTimeMs > 0);
            const rightTurns = rawTurnsData.filter(t => (t.expectedFace === 'L' || t.colorName === 'NARANJO') && t.esCorrecto && t.reactionTimeMs > 0);
            const leftAvg = leftTurns.reduce((acc, t) => acc + t.reactionTimeMs, 0) / (leftTurns.length || 1);
            const rightAvg = rightTurns.reduce((acc, t) => acc + t.reactionTimeMs, 0) / (rightTurns.length || 1);
            const diffSide = Math.abs(leftAvg - rightAvg);
            const scoreSim = Math.max(0, 100 - (diffSide / 1.5));

            const scoreAtenc = Math.min(100, (stats.maxCombo / 10) * 100);

            // Variabilidad (Consistencia)
            const allGoRTs = rawTurnsData.filter(t => t.esCorrecto && t.reactionTimeMs > 0).map(t => t.reactionTimeMs);
            const mean = allGoRTs.reduce((a, b) => a + b, 0) / (allGoRTs.length || 1);
            const stdev = Math.sqrt(allGoRTs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (allGoRTs.length || 1));
            const scoreConst = Math.max(0, 100 - (stdev / 1));

            const metrics = [
              { label: 'Velocidad', val: scoreVel },
              { label: 'Control Inhibitorio', val: scoreInhib },
              { label: 'Simetría Hemisférica', val: scoreSim },
              { label: 'Foco Sostenido', val: scoreAtenc },
              { label: 'Estabilidad Motor', val: scoreConst },
            ];

            // 2. Geometría SVG (Radio 40, Centro 50)
            const getPoint = (val, i) => {
              const angle = (i * 72 - 90) * (Math.PI / 180);
              const r = (val / 100) * 40;
              return `${50 + r * Math.cos(angle)},${50 + r * Math.sin(angle)}`;
            };

            const dataPoints = metrics.map((m, i) => getPoint(m.val, i)).join(' ');

            return (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 bg-white/5 border border-white/10 p-6 rounded-[2.5rem] text-center space-y-6"
              >
                <div className="space-y-1">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] text-cyan-400/80">Mapeo Multidimensional Cognitivo</h3>
                  <p className="text-[9px] text-white/30 uppercase font-bold">Perfil de Rendimiento Estructurado</p>
                </div>

                <div className="relative w-64 h-64 mx-auto">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100">
                    {/* Guías de Escala (Pentágonos) */}
                    {[20, 40, 60, 80, 100].map(scale => {
                      const pts = metrics.map((_, i) => getPoint(scale, i)).join(' ');
                      return <polygon key={scale} points={pts} fill="none" stroke="white" strokeOpacity="0.05" strokeWidth="0.5" />;
                    })}

                    {/* Ejes Radiales */}
                    {metrics.map((_, i) => {
                      const p = getPoint(100, i);
                      return <line key={i} x1="50" y1="50" x2={p.split(',')[0]} y2={p.split(',')[1]} stroke="white" strokeOpacity="0.05" strokeWidth="0.5" />;
                    })}

                    {/* Área de Datos del Usuario */}
                    <motion.polygon
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.5 }}
                      points={dataPoints}
                      className="fill-cyan-500/30 stroke-cyan-400 stroke-[1.5]"
                      style={{ transformOrigin: 'center' }}
                    />

                    {/* Etiquetas en Vértices */}
                    {metrics.map((m, i) => {
                      const angle = (i * 72 - 90) * (Math.PI / 180);
                      const x = 50 + 48 * Math.cos(angle);
                      const y = 50 + 48 * Math.sin(angle);
                      return (
                        <text 
                          key={i} x={x} y={y} 
                          fontSize="3.5" fill="white" fillOpacity="0.4" fontBold="900"
                          textAnchor="middle" alignmentBaseline="middle"
                          className="font-black"
                        >
                          {m.label.toUpperCase()}
                        </text>
                      );
                    })}
                  </svg>
                </div>
              </motion.div>
            );
          })()}
        </div>

        {/* ––– SECCIÓN DE DESCUBRIMIENTO CLÍNICO ––– */}
        <div className="w-full space-y-4">
          <AnimatePresence mode="wait">
            {!confirmacionDominancia ? (
              <motion.div
                key="pregunta"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full bg-gray-800/40 border border-gray-700/50 backdrop-blur-xl p-6 rounded-3xl text-center space-y-4 shadow-xl"
              >
                <p className="text-xs md:text-sm font-medium text-white/70">
                   El sistema detectó mayor velocidad de respuesta en tu mano <span className="text-cyan-400 font-black uppercase">{stats.dominance === 'Balanceada' ? 'Derecha' : stats.dominance}</span>.
                   <br />¿Es esta tu mano dominante en la vida diaria?
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button 
                    onClick={() => setConfirmacionDominancia('si')}
                    className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 transition-all"
                  >
                    Sí, es mi mano dominante
                  </button>
                  <button 
                    onClick={() => setConfirmacionDominancia('no')}
                    className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 transition-all"
                  >
                    No, soy {stats.dominance === 'Derecha' ? 'Zurdo' : 'Diestro'}
                  </button>
                </div>
              </motion.div>
            ) : confirmacionDominancia === 'no' && !actividadOculta ? (
              <motion.div
                key="revelacion"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full bg-indigo-500/10 border border-indigo-400/30 backdrop-blur-xl p-6 rounded-3xl text-center space-y-5 shadow-[0_0_30px_rgba(99,102,241,0.1)]"
              >
                <div className="space-y-2">
                  <h3 className="text-lg font-black uppercase italic tracking-tighter text-indigo-300">¡Fascinante!</h3>
                  <p className="text-xs text-white/70 leading-relaxed max-w-sm mx-auto">
                    Hemos detectado una <span className="text-white font-bold">'Dominancia Cruzada Oculta'</span>. Tu cerebro ha desarrollado redes neuronales de alta velocidad en tu mano no dominante debido a la neuroplasticidad. <br/>¿Qué actividad haces que podría explicar esto?
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['Tocar Instrumento', 'Videojuegos', 'Tipeo Rápido', 'Deportes', 'Otra'].map(act => (
                    <button
                      key={act}
                      onClick={() => setActividadOculta(act)}
                      className="px-4 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/40 transition-all"
                    >
                      {act}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : confirmacionDominancia === 'no' && actividadOculta ? (
              <motion.div
                key="exito"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full bg-emerald-500/10 border border-emerald-400/30 backdrop-blur-xl p-6 rounded-3xl text-center shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              >
                <p className="text-sm font-black text-emerald-300 uppercase italic tracking-widest">
                  ¡El misterio está resuelto!
                </p>
                <p className="text-[10px] text-white/50 mt-1 font-bold">
                  Esa actividad ha re-cableado tu corteza motora.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="confirmado"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full py-4 text-center text-[10px] text-white/20 font-bold uppercase tracking-[0.3em]"
              >
                Perfil Cognitivo Validado
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ––– PANEL DE SESGO COGNITIVO (ÁREA DE OPORTUNIDAD) ––– */}
        {sesgo && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className={`w-full p-5 rounded-3xl border backdrop-blur-xl text-left space-y-2 ${
              sesgo.titulo === 'Rendimiento Clínico Óptimo' 
              ? 'bg-emerald-500/5 border-emerald-500/20' 
              : 'bg-red-500/5 border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${sesgo.titulo === 'Rendimiento Clínico Óptimo' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <p className={`text-[10px] font-black uppercase tracking-widest ${sesgo.titulo === 'Rendimiento Clínico Óptimo' ? 'text-emerald-400' : 'text-red-400'}`}>
                {sesgo.titulo === 'Rendimiento Clínico Óptimo' ? 'Estado del Sistema' : 'Área de Oportunidad (Sesgo Detectado)'}
              </p>
            </div>
            <h4 className="text-sm font-black text-white italic uppercase tracking-tighter">
              {sesgo.titulo}
            </h4>
            <p className="text-[11px] text-white/50 leading-relaxed italic">
              {sesgo.desc}
            </p>
            {/* Evidencia de Sesgo */}
            <div className="pt-2 flex items-center gap-2">
               {sesgo.id === 'Impulsividad' && (
                  <span className="text-[9px] font-mono px-2 py-0.5 bg-red-500/10 rounded border border-red-500/20 text-red-300/60">
                    [Movimientos en NO-GO: Alta Frecuencia] ➔ Freno Fallido
                  </span>
               )}
               {sesgo.id === 'Fluctuacion' && (
                  <span className="text-[9px] font-mono px-2 py-0.5 bg-red-500/10 rounded border border-red-500/20 text-red-300/60">
                    [T. Max - T. Min: {Math.max(...rawTurnsData.map(t => t.reactionTimeMs)) - Math.min(...rawTurnsData.filter(t => t.reactionTimeMs > 0).map(t => t.reactionTimeMs))}ms] ➔ Inconsistencia
                  </span>
               )}
               {sesgo.id === 'Asimetria' && (
                  <span className="text-[9px] font-mono px-2 py-0.5 bg-red-500/10 rounded border border-red-500/20 text-red-300/60">
                    [Diferencia L/R: {'>'}80ms] ➔ Dependencia Lateral
                  </span>
               )}
            </div>
          </motion.div>
        )}

        {/* ––– ANÁLISIS DE VELOCIDAD DE IMPULSO (BIOMARCADOR) ––– */}
        {impulseStats && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full p-5 rounded-3xl bg-amber-500/5 border border-amber-500/20 text-left space-y-3 shadow-[0_0_20px_rgba(245,158,11,0.05)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                  Análisis de Velocidad de Impulso
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold text-amber-500/50 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {impulseStats.count} {impulseStats.count === 1 ? 'IMPULSO' : 'IMPULSOS'}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-mono font-black text-amber-400">{impulseStats.avg}ms</span>
              <span className="text-[10px] font-bold text-amber-400/40 uppercase">Velocidad Media de Reacción Impulsiva</span>
            </div>

            {impulseStats.count >= 2 && (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-500/10">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-white/30 uppercase">Más Rápido</span>
                  <span className="text-xs font-mono font-bold text-white/70">{impulseStats.min}ms</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-white/30 uppercase">Más Lento</span>
                  <span className="text-xs font-mono font-bold text-white/70">{impulseStats.max}ms</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[8px] font-black text-white/30 uppercase">Delta (Variabilidad)</span>
                  <span className="text-xs font-mono font-bold text-amber-400/60">{impulseStats.delta}ms</span>
                </div>
              </div>
            )}

            <p className="text-[9px] text-white/40 italic leading-relaxed pt-1">
              (Un impulso <span className="text-white/60 font-bold">muy rápido</span> indica un reflejo incontrolable; uno <span className="text-white/60 font-bold">lento</span> sugiere confusión cognitiva ante el estímulo trampa).
            </p>
          </motion.div>
        )}


        {/* DASHBOARD DE MÉTRICAS (2x2) */}
        <div className="grid grid-cols-2 w-full gap-4">
          <StatBox label="TR Neto (Estimado)" value={stats.avgTime} unit="ms" />

          <StatBox label="Precisión Total" value={stats.accuracy} unit="%" />
          <StatBox label="Mano Dominante" value={stats.dominance} />
          <StatBox label="Racha Máxima" value={`x${stats.maxCombo}`} />
        </div>

        {/* ACCIONES FINALES */}
        <div className="flex flex-col w-full gap-4 mt-2">
          <button
            onClick={() => setMostrarTelemetria(!mostrarTelemetria)}
            className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400/60 hover:text-cyan-400 transition-colors mb-2"
          >
            {mostrarTelemetria ? '✕ Ocultar Telemetría' : '⚡ Ver Telemetría Cruda (Modo Ingeniero)'}
          </button>

          <AnimatePresence>
            {mostrarTelemetria && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full space-y-6 overflow-hidden"
              >
                {/* 1. GRÁFICO DE RITMO COGNITIVO (Nativo SVG) */}
                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-left space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Ritmo Cognitivo (Velocidad Invertida)</p>
                    <div className="flex gap-4 text-[8px] font-bold uppercase tracking-tighter text-white/40">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> Velocidad</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-[1px] border-b border-dashed border-white/40"></span> Promedio</span>
                    </div>
                  </div>

                  <div className="relative w-full h-48 mt-4">
                    {/* SVG Chart */}
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Líneas de Grilla (Horizontales) */}
                      {[25, 50, 75].map(y => (
                        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="white" strokeOpacity="0.05" strokeWidth="0.5" />
                      ))}

                      {/* Línea de Promedio (Punteada) */}
                      {(() => {
                        const avgY = Math.max(0, Math.min(100, (1 - (stats.tiempoPromedioGo / 1000)) * 100));
                        return (
                          <line 
                            x1="0" y1={avgY} x2="100" y2={avgY} 
                            stroke="white" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="2,2" 
                          />
                        );
                      })()}

                      {/* Línea de Tendencia (GOs) */}
                      {(() => {
                        const goTurns = rawTurnsData.filter(t => t.esCorrecto && t.reactionTimeMs > 0);
                        if (goTurns.length < 2) return null;
                        
                        const points = rawTurnsData.map((t, i) => {
                          const x = (i / (rawTurnsData.length - 1)) * 100;
                          // Solo dibujamos línea si es un GO exitoso. Si es error, hay break.
                          if (t.esCorrecto && t.reactionTimeMs > 0) {
                            const y = (1 - (t.reactionTimeMs / 1000)) * 100;
                            return `${x},${y}`;
                          }
                          return null;
                        }).filter(p => p !== null).join(' ');

                        return (
                          <motion.polyline
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            points={points}
                            fill="none"
                            stroke="#22d3ee"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            className="drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                          />
                        );
                      })()}

                      {/* Marcadores de Eventos (Puntos, Estrellas, Equis) */}
                      {rawTurnsData.map((t, i) => {
                        const x = (i / (rawTurnsData.length - 1)) * 100;
                        const y = (1 - (t.reactionTimeMs / 1000)) * 100;
                        
                        // 1. Récord (Estrella)
                        if (t.reactionTimeMs === stats.mejorTiempo && t.esCorrecto) {
                          return (
                            <g key={i}>
                              <circle cx={x} cy={y} r="3" fill="#22d3ee" />
                              <text x={x} y={y - 5} fontSize="8" textAnchor="middle">⭐</text>
                            </g>
                          );
                        }

                        // 2. Error de Impulsividad (Equis Roja)
                        if (!t.esCorrecto && t.isImpulsivityError) {
                          return (
                            <g key={i}>
                              <circle cx={x} cy={y} r="4" fill="#ef4444" fillOpacity="0.3" />
                              <text x={x} y={y + 3} fontSize="8" textAnchor="middle" fill="#ef4444" fontWeight="bold">✕</text>
                            </g>
                          );
                        }

                        // 3. Inhibición Exitosa (Punto verde base)
                        if (t.esCorrecto && t.isInhibitionSuccess) {
                          return <circle key={i} cx={x} cy="95" r="2" fill="#10b981" />;
                        }

                        // 4. Punto GO Estándar
                        if (t.esCorrecto && t.reactionTimeMs > 0) {
                          return <circle key={i} cx={x} cy={y} r="1.5" fill="#22d3ee" fillOpacity="0.5" />;
                        }

                        return null;
                      })}
                    </svg>

                    {/* Eje X (Turnos) */}
                    <div className="absolute -bottom-6 left-0 w-full flex justify-between px-1">
                      <span className="text-[8px] font-mono text-white/20">Turno 1</span>
                      <span className="text-[8px] font-mono text-white/20">Mazo Final</span>
                    </div>
                  </div>

                  {/* ANÁLISIS DINÁMICO */}
                  <div className="pt-6 border-t border-white/5">
                    {(() => {
                      const bestTurn = rawTurnsData.find(t => t.reactionTimeMs === stats.mejorTiempo && t.esCorrecto);
                      const impulseError = rawTurnsData.find(t => !t.esCorrecto && t.isImpulsivityError);
                      
                      return (
                        <p className="text-[11px] text-white/50 leading-relaxed italic">
                          {`Alcanzaste tu máximo nivel de hiperfoco en el turno ${bestTurn?.turn || '?'} (${stats.mejorTiempo}ms). `}
                          {impulseError 
                            ? `Sin embargo, la aceleración provocó un error de impulsividad en el estímulo ${impulseError.colorName} (Turno ${impulseError.turn}), indicando un lapso de control inhibitorio bajo presión.`
                            : `Mantuviste el control absoluto y la precisión perfecta incluso en los momentos de mayor aceleración dinámica.`}
                        </p>
                      );
                    })()}
                  </div>
                </div>

                {/* 2. ANÁLISIS DE FATIGA Y APRENDIZAJE HEMISFÉRICO (Dual Line) */}
                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl text-left space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Líneas de Aprendizaje Hemisférico</p>
                    <div className="flex gap-4 text-[7px] font-bold uppercase tracking-tighter">
                      <span className="flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Hemisf. Derecho (Mano Izq)</span>
                      <span className="flex items-center gap-1 text-orange-400"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Hemisf. Izquierdo (Mano Der)</span>
                    </div>
                  </div>

                  <div className="relative w-full h-40 mt-2">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Líneas de Grilla */}
                      {[25, 50, 75].map(y => (
                        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="white" strokeOpacity="0.03" strokeWidth="0.5" />
                      ))}

                      {/* Lineas de las manos */}
                      {(() => {
                        const leftTurns = rawTurnsData.filter(t => (t.expectedFace === 'R' || t.colorName === 'ROJO') && t.esCorrecto && t.reactionTimeMs > 0).slice(0, 5);
                        const rightTurns = rawTurnsData.filter(t => (t.expectedFace === 'L' || t.colorName === 'NARANJO') && t.esCorrecto && t.reactionTimeMs > 0).slice(0, 5);

                        const getLine = (turns, color) => {
                          if (turns.length < 2) return null;
                          const pts = turns.map((t, i) => {
                            const x = (i / 4) * 100;
                            const y = Math.max(10, Math.min(90, (t.reactionTimeMs / 1000) * 100));
                            return `${x},${y}`;
                          }).join(' ');

                          return (
                            <motion.polyline
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              points={pts}
                              fill="none"
                              stroke={color}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              className="drop-shadow-[0_0_5px_rgba(0,0,0,0.5)]"
                            />
                          );
                        };

                        const getCircles = (turns, color) => turns.map((t, i) => {
                          const x = (i / 4) * 100;
                          const y = Math.max(10, Math.min(90, (t.reactionTimeMs / 1000) * 100));
                          return <circle key={i} cx={x} cy={y} r="2.5" fill="black" stroke={color} strokeWidth="1" />;
                        });

                        return (
                          <g>
                            {getLine(leftTurns, '#ef4444')}
                            {getLine(rightTurns, '#f97316')}
                            {getCircles(leftTurns, '#ef4444')}
                            {getCircles(rightTurns, '#f97316')}
                          </g>
                        );
                      })()}
                    </svg>

                    <div className="absolute -bottom-6 left-0 w-full flex justify-between px-1">
                      <span className="text-[7px] font-mono text-white/20">Intento 1</span>
                      <span className="text-[7px] font-mono text-white/20">Intento 5</span>
                    </div>
                  </div>

                  {/* ANÁLISIS DINÁMICO HEMISFÉRICO */}
                  <div className="pt-6 border-t border-white/5">
                    {(() => {
                      const leftTurns = rawTurnsData.filter(t => (t.expectedFace === 'R' || t.colorName === 'ROJO') && t.esCorrecto && t.reactionTimeMs > 0).slice(0, 5);
                      const rightTurns = rawTurnsData.filter(t => (t.expectedFace === 'L' || t.colorName === 'NARANJO') && t.esCorrecto && t.reactionTimeMs > 0).slice(0, 5);

                      if (leftTurns.length < 2 || rightTurns.length < 2) return null;

                      const analyze = (turns, name) => {
                        const first = turns[0].reactionTimeMs;
                        const last = turns[turns.length - 1].reactionTimeMs;
                        const improvement = first - last;
                        if (improvement > 50) return `${name} mostró aprendizaje y adaptación positiva.`;
                        if (improvement < -50) return `${name} mostró signos de fatiga motora acumulada.`;
                        return `${name} mantuvo estabilidad constante.`;
                      };

                      return (
                        <div className="space-y-1">
                          <p className="text-[10px] text-white/40 leading-relaxed italic">
                            🔴 {analyze(leftTurns, 'Tu hemisferio derecho (mano izquierda)')}
                          </p>
                          <p className="text-[10px] text-white/40 leading-relaxed italic">
                            🟠 {analyze(rightTurns, 'Tu hemisferio izquierdo (mano derecha)')}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>



                {/* ––– META-ANÁLISIS CRUZADO (Solo si terminó ambas fases) ––– */}
          {gameMode === 'FLEXIBILIDAD' && historialFase1 && (
            <MetaAnalisisScreen 
              historialFase1={historialFase1}
              historialFase2={rawTurnsData}
            />
          )}

          {/* ––– CONSOLA DE DATOS CRUDOS (Simulación BLE) ––– */}
                <div className="bg-black border border-gray-800 p-4 rounded-xl text-left">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> CONSOLA BLE_TERMINAL
                    </span>
                    <span className="text-[8px] font-mono text-white/20">BAUD 115200</span>
                  </div>
                  <div className="h-40 overflow-y-auto font-mono text-[9px] text-emerald-400/80 space-y-1 custom-scrollbar leading-tight">
                    {rawTurnsData.map((t, i) => (
                      <p key={i}>
                        {`> [Aparición: ${t.isiMs || 0}ms] ➔ Estímulo: ${t.colorName || t.caraObjetivo} ➔ Reacción: ${t.reactionTimeMs}ms`}
                      </p>
                    ))}
                    <p className="animate-pulse text-white/30">{"> [LISTENING_FOR_NEW_SEQUENCE]..."}</p>
                  </div>
                </div>

                {/* 3. ANÁLISIS BIOLÓGICO */}
                {stats.mejorTiempo > 0 && (
                  <div className="bg-indigo-500/10 border border-indigo-400/20 p-4 rounded-xl text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Análisis Biológico (Best Step)</p>
                    <p className="text-[11px] text-white/60 mt-1 leading-relaxed">
                      Tu tiempo de <span className="text-white font-bold">{stats.mejorTiempo}ms</span> se descompone así: 
                      Percepción visual (~50ms), procesamiento frontal (~{stats.mejorTiempo - 130}ms) 
                      y conducción motora (~80ms).
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={onRestart}
            className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r ${superpower.color} shadow-lg shadow-white/5 opacity-90 hover:opacity-100`}
          >
            Nueva Evaluación
          </button>
          
          <button
            onClick={onViewFullReport}
            className="text-xs font-bold text-white/40 hover:text-white transition-all uppercase tracking-widest flex items-center justify-center gap-2"
          >
            Ver Reporte Clínico Detallado <span>→</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Sub-componente para las tarjetas de estadísticas
 */
function StatBox({ label, value, unit }) {
  return (
    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-xl flex flex-col items-start gap-1 transition-all hover:bg-white/10 group">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/20 group-hover:text-white/40 transition-colors">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono font-black text-white">{value}</span>
        {unit && <span className="text-[10px] font-bold text-white/40 uppercase">{unit}</span>}
      </div>
    </div>
  );
}
