'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import Cube3DViewer from './Cube3DViewer';

export default function TutorialPhase({ onCompleteTutorial }) {
  const { subscribeToMoves, subscribeToGyro } = useBluetoothCube();
  const [gyroData, setGyroData] = useState(null);
  
  // step: 1 = Rojo(L), 2 = Naranja(R), 3 = Transición Final
  const [step, setStep] = useState(1);
  // internalStage: 'demoing', 'waiting', 'success'
  const [internalStage, setInternalStage] = useState('demoing');
  const [lastMove, setLastMove] = useState(null);
  const [feedbackStatus, setFeedbackStatus] = useState('idle'); // For visual juice

  const targetFace = step === 1 ? 'L' : 'R';
  const colorName = step === 1 ? 'ROJA (Izquierda)' : 'NARANJA (Derecha)';

  // ── Al entrar en un nuevo paso, empezamos con la demo ──
  useEffect(() => {
    if (step > 2) return;
    setInternalStage('demoing');
    setFeedbackStatus('showing_color');
    
    // Dejar la demo unos segundos antes de pedir acción del usuario
    const timer = setTimeout(() => {
      setInternalStage('waiting');
      setFeedbackStatus('idle');
    }, 4500); 

    return () => clearTimeout(timer);
  }, [step]);

  const handleCubeMove = useCallback((notation) => {
    if (internalStage === 'success' || step > 2) return;
    
    const face = notation.charAt(0);
    setLastMove(notation);

    // Acierto
    if (face === targetFace) {
      setInternalStage('success');
      setFeedbackStatus('success');
      
      setTimeout(() => {
        if (step === 1) {
          setStep(2);
          setLastMove(null);
        } else {
          setStep(3);
          setTimeout(onCompleteTutorial, 2000);
        }
      }, 2000);
    } 
    // Error
    else {
      setFeedbackStatus('error');
      setTimeout(() => {
        if (internalStage !== 'success') setFeedbackStatus('idle');
      }, 600);
    }
  }, [internalStage, step, targetFace, onCompleteTutorial]);

  // ── Subscripción de Hardware (BLE) ──
  useEffect(() => {
    const unsubMoves = subscribeToMoves(handleCubeMove);
    const unsubGyro = subscribeToGyro((data) => {
      setGyroData(data);
    });
    return () => {
      unsubMoves();
      unsubGyro();
    };
  }, [subscribeToMoves, subscribeToGyro, handleCubeMove]);

  // ── PANTALLA: Transición Final ──
  if (step === 3) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07080f] px-6 text-center">
        <h2 className="text-2xl md:text-4xl font-black text-white animate-pulse tracking-wide italic">
          PRUEBA DE VELOCIDAD.<br/>
          <span className="text-white/40 text-xl font-bold not-italic">Preparando el motor reactivo...</span>
        </h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#07080f] px-6 gap-6 sm:gap-10">
      
      {/* Indicador superior */}
      <div className="absolute top-8 flex flex-col items-center gap-1">
        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">
          Entrenamiento de Motricidad
        </div>
        <div className="px-4 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60">
          Pasofísico {step}/2
        </div>
      </div>

      <div className="w-full max-w-lg flex flex-col items-center gap-8 relative z-10">
        
        {/* MENSAJES DINÁMICOS */}
        <div className="text-center flex flex-col gap-3 h-24 items-center justify-center">
          {internalStage === 'demoing' && (
            <div className="animate-in fade-in zoom-in duration-500">
               <p className="text-white/60 text-sm font-medium italic">Observa el ejemplo:</p>
               <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                 Gira la cara <span className={step === 1 ? 'text-red-500' : 'text-orange-500'}>{colorName}</span>
               </h3>
            </div>
          )}
          
          {internalStage === 'waiting' && (
            <div className="animate-pulse">
               <h3 className="text-2xl sm:text-3xl font-black text-white/90">
                 Ahora tú...
               </h3>
               <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">
                 Esperando movimiento en el cubo
               </p>
            </div>
          )}

          {internalStage === 'success' && (
            <div className="animate-in bounce-in duration-500 text-center">
               <p className="text-emerald-400 text-4xl font-black italic drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]">
                 ¡CORRECTO!
               </p>
               <p className="text-white/50 text-xs font-bold uppercase tracking-[0.2em] mt-1">Calibración Exitosa</p>
            </div>
          )}
        </div>

        {/* CUBE 3D VIEWER */}
        <div className="w-full aspect-[4/3] max-h-[40vh] sm:max-h-[50vh] relative group h-80">
           {/* Glow de fondo dinámico basado en el color objetivo */}
           <div 
             className={`absolute inset-0 rounded-full blur-[100px] opacity-20 transition-colors duration-700
             ${internalStage === 'demoing' ? (step === 1 ? 'bg-red-500' : 'bg-orange-500') : 'bg-white'}`}
           />
           
           <Cube3DViewer 
              className="z-10"
              demoMove={internalStage === 'demoing' ? targetFace : null}
              physicalMove={lastMove}
              status={gyroData ? 'gyro_active' : feedbackStatus}
              targetRotation={gyroData || (step === 1 ? { x: 0.2, y: 1.2, z: 0 } : { x: 0.2, y: -1.2, z: 0 })}
           />
        </div>

        {/* FEEDBACK DE TECLA / HARDWARE RAPIDO */}
        <div className="mt-4 flex flex-col items-center gap-2">
           <div className={`px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3 transition-opacity duration-500 ${internalStage === 'waiting' ? 'opacity-100' : 'opacity-20'}`}>
              <div className={`w-2 h-2 rounded-full ${internalStage === 'waiting' ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
              <span className="text-[10px] uppercase font-black text-white/40 tracking-widest">Señal de Hardware Activa</span>
           </div>
        </div>
      </div>

    </div>
  );
}
