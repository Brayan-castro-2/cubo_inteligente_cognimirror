'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useBluetoothCube } from './BluetoothContext';

const CubeStateContext = createContext(null);

export function CubeStateProvider({ children }) {
  const { subscribeToMoves, subscribeToGyro } = useBluetoothCube();
  
  // Estado de permutación: Lista de movimientos para reconstruir el estado
  // Guardamos también la rotación actual para que no "salte" al cambiar de página
  const [moveHistory, setMoveHistory] = useState([]);
  const [cubeRotation, setCubeRotation] = useState({ x: 0, y: 0, z: 0 });
  const [isCubesyncActive, setIsCubesyncActive] = useState(true);

  // Escuchar movimientos globales desde el sensor
  useEffect(() => {
    const unsub = subscribeToMoves((move) => {
      setMoveHistory(prev => [...prev, move]);
    });
    return () => unsub();
  }, [subscribeToMoves]);

  // Escuchar rotación global
  useEffect(() => {
    const unsub = subscribeToGyro((data) => {
      if (data) setCubeRotation(data);
    });
    return () => unsub();
  }, [subscribeToGyro]);

  const resetCubeState = useCallback(() => {
    setMoveHistory([]);
  }, []);

  const value = {
    moveHistory,
    setMoveHistory,
    cubeRotation,
    resetCubeState,
    isCubesyncActive,
    setIsCubesyncActive
  };

  return (
    <CubeStateContext.Provider value={value}>
      {children}
    </CubeStateContext.Provider>
  );
}

export function useCubeState() {
  const context = useContext(CubeStateContext);
  if (!context) {
    throw new Error('useCubeState debe ser usado dentro de un CubeStateProvider');
  }
  return context;
}
