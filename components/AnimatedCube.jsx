'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = {
  'U': { hex: '#f8fafc', label: 'BLANCO', text: '#0f172a' },
  'D': { hex: '#facc15', label: 'AMARILLO', text: '#000000' },
  'F': { hex: '#2563eb', label: 'AZUL', text: '#ffffff' },
  'B': { hex: '#16a34a', label: 'VERDE', text: '#ffffff' },
  'L': { hex: '#dc2626', label: 'ROJO', text: '#ffffff' },
  'R': { hex: '#f97316', label: 'NARANJO', text: '#ffffff' }
};

const GRAY_INACTIVE = '#d1d5db';
const ERROR_COLOR = '#7f1d1d'; // rojo oscuro para rechazos

export default function AnimatedCube({ targetColor, status }) {
  // Recordamos el último color válido para que las animaciones de salida no se rompan
  // cuando targetColor pasa a null asíncronamente en el padre.
  const lastColorRef = useRef(null);

  useEffect(() => {
    if (targetColor && COLORS[targetColor]) {
      lastColorRef.current = COLORS[targetColor];
    }
  }, [targetColor]);

  const colorObj = (targetColor && COLORS[targetColor]) ? COLORS[targetColor] : lastColorRef.current;
  
  // Condición de color activo
  const isActiveColor = status === 'showing_color' || status === 'success' || (status === 'error' && colorObj);

  // Determinar fondo actual seguro
  const currentBgColor = status === 'error' 
    ? ERROR_COLOR 
    : (isActiveColor && colorObj ? colorObj.hex : GRAY_INACTIVE);

  const cubeVariants = {
    inactive: {
      scale: 1,
      backgroundColor: GRAY_INACTIVE,
      x: 0,
      transition: { duration: 0.3 }
    },
    active: {
      scale: [1, 1.1, 1],
      backgroundColor: currentBgColor,
      x: 0,
      transition: { type: 'tween', ease: 'easeInOut', duration: 0.4 }
    },
    error: {
      scale: 1,
      x: [-12, 12, -10, 10, -5, 5, 0],
      backgroundColor: ERROR_COLOR,
      transition: { duration: 0.35 }
    },
    success: {
      scale: [1, 1.15, 1],
      backgroundColor: currentBgColor,
      transition: { type: 'tween', ease: 'easeInOut', duration: 0.4 }
    }
  };

  let animationState = 'inactive';
  if (status === 'error') animationState = 'error';
  else if (status === 'success') animationState = 'success';
  else if (status === 'showing_color') animationState = 'active';

  return (
    <motion.div
      variants={cubeVariants}
      initial="inactive"
      animate={animationState}
      className="relative w-full aspect-square rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.4)] border-4 border-white/10 flex items-center justify-center overflow-hidden"
      style={{ maxHeight: '40vh', transformOrigin: 'center' }}
    >
      {/* GLOW INTERIOR */}
      <motion.div 
        className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30"
        style={{ background: 'radial-gradient(circle at 30% 30%, white 0%, transparent 60%)' }}
      />

      <AnimatePresence mode="popLayout">
        {isActiveColor && colorObj && status !== 'error' && (
          <motion.span
            key={colorObj.label}
            initial={{ opacity: 0, scale: 0.5, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="font-black text-6xl md:text-7xl lg:text-8xl tracking-tighter z-10 absolute"
            style={{ 
              color: colorObj.text,
              textShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}
          >
            {colorObj.label}
          </motion.span>
        )}

        {status === 'error' && (
          <motion.span
            key="error-icon"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="font-black text-7xl z-10 absolute"
          >
            ❌
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
