'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CONFIGURACIÓN DE COLORES (Sincronizada con Cubo Físico)
 */
const COLORS = {
  'L': { hex: '#FF0000', label: 'ROJO', text: '#ffffff' },
  'R': { hex: '#FF8C00', label: 'NARANJO', text: '#ffffff' },
  'U': { hex: '#f8fafc', label: 'BLANCO', text: '#0f172a' },
  'D': { hex: '#facc15', label: 'AMARILLO', text: '#000000' },
  'F': { hex: '#2563eb', label: 'AZUL', text: '#ffffff' },
  'B': { hex: '#009e60', label: 'VERDE', text: '#ffffff' }
};

export default function AnimatedCube({ targetColor, status }) {
  
  // Rotaciones sutiles (35 grados) para mantener vista frontal parcial
  const rotations = useMemo(() => ({
    'F': { rotateX: 0, rotateY: 0 },
    'L': { rotateX: 0, rotateY: 35 },   // Exponer Izquierda (Rojo)
    'R': { rotateX: 0, rotateY: -35 },  // Exponer Derecha (Naranjo)
    'U': { rotateX: 35, rotateY: 0 },   // Exponer Superior (Blanco)
    'D': { rotateX: -35, rotateY: 0 },  // Exponer Inferior (Amarillo)
    'B': { rotateX: 0, rotateY: 180 },  // Exponer Posterior (Verde)
  }), []);

  const currentRotation = (targetColor && rotations[targetColor]) 
    ? rotations[targetColor] 
    : { rotateX: 0, rotateY: 0 };

  const isActive = status === 'showing_color' || status === 'success';

  return (
    <div className="relative w-64 h-64 md:w-[28rem] md:h-[28rem] perspective-[1200px] flex items-center justify-center">
      
      {/* INDICADOR DE AGARRE (MANO IZQUIERDA) */}
      <HandIndicator side="left" active={isActive} />

      {/* CUBO 3D REFINADO (FRONTAL) */}
      <motion.div
        animate={{
          rotateX: status === 'error' ? [0, 15, -15, 10, -10, 0] : currentRotation.rotateX,
          rotateY: status === 'error' ? [0, -30, 30, -15, 15, 0] : currentRotation.rotateY,
          scale: status === 'success' ? [1, 1.05, 1] : 1,
        }}
        transition={{ 
          type: 'spring', 
          stiffness: 120, 
          damping: 25,
          duration: status === 'error' ? 0.35 : 0.6 
        }}
        className="relative w-48 h-48 md:w-64 md:h-64 transform-style-3d shadow-2xl"
      >
        <CubeFace side="front" color={COLORS.F.hex} />
        <CubeFace side="back"  color={COLORS.B.hex} />
        <CubeFace side="left"  color={COLORS.L.hex} />
        <CubeFace side="right" color={COLORS.R.hex} />
        <CubeFace side="top"   color={COLORS.U.hex} />
        <CubeFace side="bottom" color={COLORS.D.hex} />

        {/* FEEDBACK DE ERROR */}
        <AnimatePresence>
          {status === 'error' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1.4 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center text-7xl drop-shadow-2xl translate-z-[140px]"
            >
              ❌
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* INDICADOR DE AGARRE (MANO DERECHA) */}
      <HandIndicator side="right" active={isActive} />

      {/* ETIQUETA INFERIOR DINÁMICA */}
      <div className="absolute -bottom-20 w-full text-center h-24 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isActive && targetColor && COLORS[targetColor] && (
            <motion.div
              key={targetColor}
              initial={{ opacity: 0, y: 30, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="font-black italic text-5xl md:text-7xl tracking-tighter uppercase"
              style={{ 
                color: status === 'success' ? '#10b981' : COLORS[targetColor].hex,
                textShadow: `0 0 40px ${COLORS[targetColor].hex}44`
               }}
            >
              {COLORS[targetColor].label}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RESPLANDOR AMBIENTAL */}
      <div className={`absolute -inset-24 rounded-full blur-[120px] -z-20 transition-all duration-700 ${
        isActive && targetColor ? `bg-[${COLORS[targetColor].hex}]/15` : 'bg-transparent'
      }`} />
    </div>
  );
}

function CubeFace({ side, color }) {
  const styles = {
    front:  'rotateY(0deg) translateZ(96px) md:translateZ(128px)',
    back:   'rotateY(180deg) translateZ(96px) md:translateZ(128px)',
    left:   'rotateY(-90deg) translateZ(96px) md:translateZ(128px)',
    right:  'rotateY(90deg) translateZ(96px) md:translateZ(128px)',
    top:    'rotateX(90deg) translateZ(96px) md:translateZ(128px)',
    bottom: 'rotateX(-90deg) translateZ(96px) md:translateZ(128px)',
  };

  return (
    <div 
      className="absolute inset-0 rounded-[2.5rem] border-[6px] border-black/30 backface-hidden flex items-center justify-center"
      style={{ 
        backgroundColor: color,
        transform: styles[side],
      }}
    >
      <div className="w-[85%] h-[85%] border-2 border-white/5 rounded-[2rem] opacity-20 bg-gradient-to-br from-white/20 to-transparent" />
    </div>
  );
}

function HandIndicator({ side, active }) {
  const isLeft = side === 'left';
  return (
    <motion.div
      animate={{
        x: isLeft ? [0, -5, 0] : [0, 5, 0],
        opacity: active ? 0.6 : 0.2
      }}
      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      className={`absolute ${isLeft ? '-left-20' : '-right-20'} top-1/2 -translate-y-1/2 pointer-events-none hidden md:block`}
    >
      <svg width="80" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
        <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
      <div className={`mt-2 text-[8px] font-bold uppercase tracking-widest text-center opacity-40 text-white`}>
        {isLeft ? 'IZQ' : 'DER'}
      </div>
    </motion.div>
  );
}
