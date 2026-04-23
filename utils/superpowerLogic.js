/**
 * DICCIONARIO DE SUPERPODERES (Actualizado con Perfil Analítico)
 */
export const SUPERPODERES_DICT = {
  Precision: {
    titulo: 'Precisión Analítica Absoluta',
    descripcion: 'Tu cerebro opera bajo el principio de "Cero Margen de Error". Mientras otros cerebros sacrifican exactitud por velocidad impulsiva, tu corteza prefrontal procesa la información de forma deliberada y estratégica, garantizando un 100% de precisión. Este es el perfil neurológico clásico de científicos y mentes analíticas de alto nivel.',
    color: 'from-blue-500 to-indigo-600',
    icon: '🔬'
  },
  Freno: {
    titulo: 'Supresión Prefrontal Absoluta',
    descripcion: 'Tienes un Freno Cognitivo de acero. Mientras la mayoría de los cerebros ceden al instinto de movimiento ante la presión de la velocidad, tu Corteza Prefrontal es capaz de anular impulsos eléctricos en milisegundos. Esta es una métrica clásica de alta función ejecutiva y toma de decisiones bajo estrés.',
    color: 'from-purple-400 to-indigo-500',
    icon: '🧠'
  },
  Velocidad: {
    titulo: 'Velocidad de Conducción Nivel E-Sports',
    descripcion: 'Tus vías motoras están optimizadas a niveles atléticos. El tiempo que tarda tu cerebro en decodificar un estímulo visual y transformarlo en una orden mecánica para tus dedos está en el percentil superior. Tu sistema nervioso transmite datos a una velocidad que roza el límite biológico humano.',
    color: 'from-orange-400 to-red-500',
    icon: '⚡'
  },
  Ambidextrismo: {
    titulo: 'Ambidextrismo Neuronal',
    descripcion: 'Tu cerebro presenta una Simetría de Procesamiento excepcional. A diferencia del 90% de la población que tiene un hemisferio dominante marcado, tus vías neuronales puentean la información a la misma velocidad exacta hacia ambas manos. Tienes un cerebro literalmente balanceado.',
    color: 'from-emerald-400 to-teal-500',
    icon: '⚖️'
  },
  Flujo: {
    titulo: 'Estado de Flujo Sostenido',
    descripcion: 'Tu cerebro tiene la capacidad de entrar en Flow (Estado de Flujo) de manera instantánea. Tu gráfica no muestra los micro-lapsos de distracción normales de la fatiga mental. Tienes una atención sostenida de alta fidelidad, capaz de bloquear el ruido exterior por completo.',
    color: 'from-blue-400 to-emerald-400',
    icon: '🌊'
  },
  Metronomo: {
    titulo: 'Metrónomo Neuronal',
    descripcion: 'Tu cerebro funciona con la precisión de un reloj suizo. La variabilidad de tus tiempos de reacción entre un movimiento y otro es casi nula en ambas manos. Esta consistencia extrema demuestra un control motor absoluto, sin los picos de fatiga o micro-distracciones que afectan a la mayoría de las personas.',
    color: 'from-slate-400 to-slate-700',
    icon: '⌚'
  }
};

/**
 * LÓGICA DE SELECCIÓN (calcularSuperpoder)
 */
export function calcularSuperpoder(historial) {
  if (!historial || historial.length === 0) return SUPERPODERES_DICT.Flujo;

  const turns = historial.filter(t => !t.isFalseStart);
  const goTurns = turns.filter(t => t.reactionTimeMs > 0);
  const correctGoTurns = goTurns.filter(t => t.esCorrecto);
  
  const noGoTurns = historial.filter(t => t.expectedFace === 'AZUL' || t.expectedFace === 'VERDE');
  const noGoSuccess = noGoTurns.filter(t => t.esCorrecto);

  // 1. Métricas Base
  const precisionNoGo = noGoTurns.length > 0 ? (noGoSuccess.length / noGoTurns.length) : 1;
  const precisionGo = goTurns.length > 0 ? (correctGoTurns.length / goTurns.length) : 1;
  
  const tiempoPromedioGo = correctGoTurns.length > 0 
    ? (correctGoTurns.reduce((s, t) => s + t.reactionTimeMs, 0) / correctGoTurns.length) 
    : 9999;
  
  const rightTurns = correctGoTurns.filter(t => t.expectedFace === 'R');
  const leftTurns = correctGoTurns.filter(t => t.expectedFace === 'L');
  const avgR = rightTurns.length ? (rightTurns.reduce((s, t) => s + t.reactionTimeMs, 0) / rightTurns.length) : 0;
  const avgL = leftTurns.length ? (leftTurns.reduce((s, t) => s + t.reactionTimeMs, 0) / leftTurns.length) : 0;
  const diffDominancia = (avgR && avgL) ? Math.abs(avgR - avgL) : 999;

  // 1.2 Variabilidad (Para Metrónomo)
  const calculateVar = (arr) => {
    if (arr.length < 3) return 999; // Mínimo 3 para ser estadísticamente "metrónomo"
    const times = arr.map(t => t.reactionTimeMs);
    return Math.max(...times) - Math.min(...times);
  };
  const varR = calculateVar(rightTurns);
  const varL = calculateVar(leftTurns);

  // 2. Evaluación por Prioridad
  if (precisionNoGo === 1 && precisionGo === 1 && tiempoPromedioGo > 450 && turns.length >= 4) {
    return { ...SUPERPODERES_DICT.Precision, id: 'Precision' };
  }
  
  if (precisionNoGo === 1 && noGoTurns.length >= 2) {
    return { ...SUPERPODERES_DICT.Freno, id: 'Freno' };
  }

  // NUEVA REGLA: Metrónomo (Consistencia extrema < 40ms de variabilidad)
  if (varR < 40 && varL < 40 && rightTurns.length >= 3 && leftTurns.length >= 3) {
    return { ...SUPERPODERES_DICT.Metronomo, id: 'Metronomo' };
  }

  if (tiempoPromedioGo < 350) return { ...SUPERPODERES_DICT.Velocidad, id: 'Velocidad' };
  if (diffDominancia < 20 && rightTurns.length >= 2 && leftTurns.length >= 2) {
    return { ...SUPERPODERES_DICT.Ambidextrismo, id: 'Ambidextrismo' };
  }

  return { ...SUPERPODERES_DICT.Flujo, id: 'Flujo' };
}


/**
 * LÓGICA DEL MODIFICADOR DE CONTEXTO
 * Cruza datos subjetivos (Sueño, Ruido, Ánimo) con el rendimiento objetivo.
 */
export function calcularBonoContexto(historial, metadata, superpowerId) {
  if (!metadata || !historial) return null;

  const { horasSueno, nivelRuido, estadoAnimo } = metadata;
  const turns = historial.filter(t => !t.isFalseStart);
  const accuracy = turns.length > 0 ? (turns.filter(t => t.esCorrecto).length / turns.length) : 0;
  
  const noGoTurns = historial.filter(t => t.expectedFace === 'AZUL' || t.expectedFace === 'VERDE');
  const noGoErrors = noGoTurns.filter(t => !t.esCorrecto).length;

  // 1. Reserva Cognitiva (Sueño vs Rendimiento)
  // Se considera "buen superpoder" cualquiera excepto el default (Flujo/Focus)
  const isGoodPerformance = ['Precision', 'Freno', 'Velocidad', 'Ambidextrismo'].includes(superpowerId);
  if (horasSueno > 0 && horasSueno < 6 && isGoodPerformance) {
    return {
      id: 'reserva',
      texto: "✨ Bonus: Lograste este rendimiento operando con déficit de sueño. Tu cerebro utilizó su 'Reserva Cognitiva' para compensar la fatiga, manteniendo tu función ejecutiva intacta.",
      tipo: 'warning' // Estilo ambar/dorado
    };
  }

  // 2. Aislamiento Sensorial (Ruido vs Foco)
  if (nivelRuido >= 7 && accuracy >= 0.9) {
    return {
      id: 'aislamiento',
      texto: "✨ Bonus: Cancelación de Ruido Natural. Lograste filtrar un entorno altamente distractor, demostrando un foco blindado frente a estímulos externos.",
      tipo: 'info' // Estilo cyan/azul
    };
  }

  // 3. Regulación Emocional (Ánimo vs Control Inhibitorio)
  const animosNegativos = ['estresado', 'triste', 'cansado', 'ansioso', 'molesto'];
  if (animosNegativos.includes(estadoAnimo?.toLowerCase()) && noGoErrors === 0 && noGoTurns.length > 0) {
    return {
      id: 'regulacion',
      texto: "✨ Bonus: Regulación Emocional. Demostraste que tu precisión motora y control inhibitorio se mantienen estables incluso bajo carga emocional o estrés.",
      tipo: 'success' // Estilo esmeralda
    };
  }

  return null;
}

/**
 * DICCIONARIO DE SESGOS COGNITIVOS (Áreas de Oportunidad)
 */
export const SESGOS_DICT = {
  Impulsividad: { 
    titulo: 'Impulsividad Motora Frontal', 
    desc: 'Tu cerebro prioriza la velocidad por sobre la verificación. Tuviste dificultades para aplicar el freno ante estímulos engañosos (NO-GO), indicando un área de mejora en el Control Inhibitorio.' 
  },
  Fluctuacion: { 
    titulo: 'Fluctuación Atencional', 
    desc: 'Presencia de micro-lapsos atencionales. Tu gráfica presenta altos y bajos (alta variabilidad), lo que sugiere que a tu cerebro le cuesta mantener la atención sostenida y el foco continuo.' 
  },
  Sobrecarga: { 
    titulo: 'Sobrecarga de Procesamiento', 
    desc: 'Signos de carga cognitiva. El tiempo para decodificar visualmente y ejecutar la acción está sobre el promedio, sumado a errores de decisión. Suele ser biomarcador de fatiga mental.' 
  },
  Asimetria: { 
    titulo: 'Asimetría Lateral Marcada', 
    desc: 'Dependencia Hemisférica Alta. Un hemisferio está haciendo todo el trabajo rápido, mientras que la transferencia de información hacia tu mano más lenta sufre un retraso significativo.' 
  },
  Perfecto: {
    titulo: 'Rendimiento Clínico Óptimo',
    desc: 'Ningún sesgo crítico detectado. Tu sistema nervioso muestra un balance excepcional entre velocidad, precisión y consistencia.'
  }
};

/**
 * LÓGICA DE SELECCIÓN DE SESGO
 */
export function calcularSesgo(historial, stats) {
  if (!historial || historial.length === 0) return null;

  const noGoTurns = historial.filter(t => t.expectedFace === 'AZUL' || t.expectedFace === 'VERDE');
  const erroresNoGo = noGoTurns.filter(t => !t.esCorrecto).length;
  
  const turns = historial.filter(t => !t.isFalseStart);
  const goTurns = turns.filter(t => t.reactionTimeMs > 0);
  const erroresGo = goTurns.filter(t => !t.esCorrecto).length;
  
  const times = goTurns.filter(t => t.esCorrecto).map(t => t.reactionTimeMs);
  const variabilidad = times.length > 1 ? (Math.max(...times) - Math.min(...times)) : 0;

  // 1. Impulsividad (Prioridad alta en clínica)
  if (erroresNoGo > 0) return SESGOS_DICT.Impulsividad;

  // 2. Sobrecarga
  if (stats.avgTime > 500 && erroresGo > 0) return SESGOS_DICT.Sobrecarga;

  // 3. Fluctuación
  if (variabilidad > 300) return { ...SESGOS_DICT.Fluctuacion, id: 'Fluctuacion' };

  // 4. Asimetría
  const rightGo = goTurns.filter(t => t.expectedFace === 'R' && t.esCorrecto);
  const leftGo  = goTurns.filter(t => t.expectedFace === 'L' && t.esCorrecto);
  const avgR = rightGo.length ? rightGo.reduce((s, t) => s + t.reactionTimeMs, 0) / rightGo.length : 0;
  const avgL = leftGo.length ? leftGo.reduce((s, t) => s + t.reactionTimeMs, 0) / leftGo.length : 0;
  if (avgR && avgL && Math.abs(avgR - avgL) > 80) return { ...SESGOS_DICT.Asimetria, id: 'Asimetria' };

  if (stats.avgTime > 500 && erroresGo > 0) return { ...SESGOS_DICT.Sobrecarga, id: 'Sobrecarga' };

  return { ...SESGOS_DICT.Perfecto, id: 'Perfecto' };
}



