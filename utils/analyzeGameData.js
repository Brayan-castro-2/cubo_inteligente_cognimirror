export function computeCumulativeMetrics(userHistory) {
  if (!userHistory || userHistory.length === 0) return null;

  let totalTR = 0;
  let trCount = 0;
  let totalErroresFalsos = 0;
  let maxStreakGlobal = 0;
  
  let validHands = 0;
  let asymmetryL = 0;
  let asymmetryR = 0;
  
  userHistory.forEach(session => {
    const m = session.metrics;
    if (m.tiempo_total > 0 && (m.aciertos_rojo + m.aciertos_naranja) > 0) {
      totalTR += (m.tiempo_total / (m.aciertos_rojo + m.aciertos_naranja));
      trCount++;
    }
    totalErroresFalsos += m.errores_falsos;
    if (m.max_streak > maxStreakGlobal) maxStreakGlobal = m.max_streak;
    
    if (m.tiempo_promedio_por_mano?.L && m.tiempo_promedio_por_mano?.R) {
      asymmetryL += m.tiempo_promedio_por_mano.L;
      asymmetryR += m.tiempo_promedio_por_mano.R;
      validHands++;
    }
  });

  const avgTR = trCount > 0 ? Math.round(totalTR / trCount) : 0;
  const avgAsymL = validHands > 0 ? Math.round(asymmetryL / validHands) : 0;
  const avgAsymR = validHands > 0 ? Math.round(asymmetryR / validHands) : 0;

  return {
    sessionsCount: userHistory.length,
    avgReactionTime: avgTR,
    totalErroresFalsos: totalErroresFalsos,
    maxStreakGlobal: maxStreakGlobal,
    avgTimeL: avgAsymL,
    avgTimeR: avgAsymR
  };
}

/**
 * MOTOR DE RECUPERACIÓN MANUAL (Emergencia Feria)
 */
export const analyzeGameData = (rawTurns) => {
  // Capa de Compatibilidad: mapeamos los datos del sensor al formato que pide el parche
  const turns = rawTurns.map((t, idx) => ({
    index: idx + 1,
    time: t.time || 0,
    face: t.expected, // L o R
    isCorrect: t.status === 'Ok' || t.status === 'Corregido',
    isNoGo: t.type === 'NOGO',
    isNoGoCommission: t.type === 'NOGO' && t.fail
  }));

  const leftTurns = turns.filter(t => t.face === 'L' && t.isCorrect);
  const rightTurns = turns.filter(t => t.face === 'R' && t.isCorrect);
  
  const avgLeft = leftTurns.length > 0 ? leftGoAvg(leftTurns) : 0;
  const avgRight = rightTurns.length > 0 ? rightGoAvg(rightTurns) : 0;
  
  function leftGoAvg(arr) { return arr.reduce((a, b) => a + b.time, 0) / arr.length; }
  function rightGoAvg(arr) { return arr.reduce((a, b) => a + b.time, 0) / arr.length; }

  // Contar errores (según lógica del parche)
  const errors = turns.filter(t => !t.isCorrect || t.isNoGoCommission).length;

  // Determinar Perfil
  let profile = "Explorador";
  if (avgLeft < 600 && avgRight < 600) profile = "Velocista Cognitivo";
  if (errors === 0) profile = "Zen / Enfoque Total";
  if (Math.abs(avgLeft - avgRight) > 200) profile = "Lateralización Alta";

  return {
    avgLeft,
    avgRight,
    errors,
    profile,
    diff: Math.abs(avgLeft - avgRight),
    leftData: leftTurns.map(t => t.time),
    rightData: rightTurns.map(t => t.time),
    turns: turns // devolver todo para el gráfico de línea
  };
};
