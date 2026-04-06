'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// ── CONFIGURACIÓN DEL CUBO ──
const COLORS = { 
  U: 0xffffff, // Blanco
  D: 0xffd500, // Amarillo
  F: 0x0051ba, // Azul
  B: 0x009e60, // Verde
  L: 0xc41e3a, // Rojo
  R: 0xff5800, // Naranjo 
  CORE: 0x1a1a1a 
};

const MOVES_CONFIG = {
  'U': { axis: 'y', val: 1, angle: -Math.PI / 2 },
  'D': { axis: 'y', val: -1, angle: Math.PI / 2 },
  'R': { axis: 'x', val: 1, angle: -Math.PI / 2 },
  'L': { axis: 'x', val: -1, angle: Math.PI / 2 },
  'F': { axis: 'z', val: 1, angle: -Math.PI / 2 },
  'B': { axis: 'z', val: -1, angle: Math.PI / 2 },
};

export default function Cube3DViewer({ demoMove, physicalMove, targetRotation, status, className }) {
  const containerRef = useRef(null);
  const threeRef = useRef(null);

  // 1. INICIALIZACIÓN DE SCENE
  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    const scene = new THREE.Scene();
    
    // Cámara isométrica frontal ajustada para buena visibilidad de caras
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(6, 4, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Iluminación
    const amb = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(8, 15, 10);
    scene.add(dir);

    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);
    const allCubies = [];

    // Generar los 27 cubies
    const geo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const mats = [
            new THREE.MeshPhongMaterial({ color: x === 1 ? COLORS.R : COLORS.CORE, shininess: 80 }),
            new THREE.MeshPhongMaterial({ color: x === -1 ? COLORS.L : COLORS.CORE, shininess: 80 }),
            new THREE.MeshPhongMaterial({ color: y === 1 ? COLORS.U : COLORS.CORE, shininess: 80 }),
            new THREE.MeshPhongMaterial({ color: y === -1 ? COLORS.D : COLORS.CORE, shininess: 80 }),
            new THREE.MeshPhongMaterial({ color: z === 1 ? COLORS.F : COLORS.CORE, shininess: 80 }),
            new THREE.MeshPhongMaterial({ color: z === -1 ? COLORS.B : COLORS.CORE, shininess: 80 }),
          ];
          const cubie = new THREE.Mesh(geo, mats);
          cubie.position.set(x, y, z);
          cubeGroup.add(cubie); 
          allCubies.push(cubie);
        }
      }
    }

    // Estado del motor
    const state = {
      isAnimating: false,
      moveQueue: [],
      demoTimeout: null,
      isDemoActive: false,
      lastQueuedMove: null
    };

    // Animador de caras por matriz
    const rotateFace = async (axis, val, angle, steps = 14) => {
      return new Promise(resolve => {
        // CORRECCIÓN: Usar posición local (relativa a cubeGroup)
        // El getWorldPosition fallaba porque el cubo "flota" (rota el grupo entero)
        const active = allCubies.filter(c => {
          return Math.abs(c.position[axis] - val) < 0.5;
        });
        
        const pivot = new THREE.Object3D();
        cubeGroup.add(pivot);
        active.forEach(c => pivot.attach(c));
        
        const dA = angle / steps; 
        let step = 0;
        
        const tick = () => {
          if (step < steps) { 
             pivot.rotation[axis] += dA; 
             step++; 
             requestAnimationFrame(tick); 
          } else {
            // Asegurar ángulo exacto al final para evitar deformaciones acumuladas
            pivot.rotation[axis] = angle;
            pivot.updateMatrixWorld();
            
            active.forEach(c => {
              cubeGroup.attach(c);
              // Snap a la grilla
              c.position.x = Math.round(c.position.x);
              c.position.y = Math.round(c.position.y);
              c.position.z = Math.round(c.position.z);
            });
            cubeGroup.remove(pivot); 
            resolve();
          }
        };
        tick();
      });
    };

    // Procesador de colas de física
    const processQueue = async () => {
      if (state.isAnimating || state.moveQueue.length === 0) return;
      state.isAnimating = true;
      const notation = state.moveQueue.shift();
      const face = notation.charAt(0);
      const mod = notation.length > 1 ? notation.charAt(1) : '';
      let count = mod === '2' ? 2 : 1;
      let angle = MOVES_CONFIG[face].angle;
      if (mod === "'" || mod === "-") angle *= -1;
      
      const steps = 12; // Transición visual clara para demo
      for (let i = 0; i < count; i++) {
        await rotateFace(MOVES_CONFIG[face].axis, MOVES_CONFIG[face].val, angle, steps);
      }
      
      state.isAnimating = false;
      if (state.moveQueue.length > 0) processQueue();
    };

    threeRef.current = { cubeGroup, processQueue, state };

    // Observador Responsivo
    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    });
    observer.observe(containerRef.current);

    // Loop
    let afId;
    const renderLoop = () => {
      afId = requestAnimationFrame(renderLoop);
      
      if (status === 'gyro_active' && targetRotation) {
        // Modo Seguimiento de Hardware (ESP32) con Suavizado (Lerp)
        const smoothing = 0.15; // 0.15 = Suave, 1.0 = Instantáneo (ruidoso)
        cubeGroup.rotation.x += (targetRotation.x - cubeGroup.rotation.x) * smoothing;
        cubeGroup.rotation.y += (targetRotation.y - cubeGroup.rotation.y) * smoothing;
        cubeGroup.rotation.z += (targetRotation.z - cubeGroup.rotation.z) * smoothing;
      } else if (status === 'teaching' && targetRotation) {
        // Modo Tutorial (orientación forzada fija)
        cubeGroup.rotation.x += (targetRotation.x - cubeGroup.rotation.x) * 0.1;
        cubeGroup.rotation.y += (targetRotation.y - cubeGroup.rotation.y) * 0.1;
        cubeGroup.rotation.z += (targetRotation.z - cubeGroup.rotation.z) * 0.1;
      } else {
        // Movimiento sutil e inmersivo "Flotante" por defecto
        cubeGroup.rotation.x = Math.sin(Date.now() / 3000) * 0.1;
        cubeGroup.rotation.y = Math.sin(Date.now() / 4000) * 0.15 - Math.PI / 5;
      }
      renderer.render(scene, camera);
    };
    renderLoop();

    // Desmontaje limpio
    return () => {
      cancelAnimationFrame(afId);
      observer.disconnect();
      if(containerRef.current) containerRef.current.removeChild(renderer.domElement);
      renderer.dispose();
      if (state.demoTimeout) clearTimeout(state.demoTimeout);
    };
  }, []);

  // 2. DEMO OBSERVER (BUCLE INFINITO DE ENSEÑANZA)
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;
    
    three.state.isDemoActive = !!demoMove;
    if (three.state.demoTimeout) clearTimeout(three.state.demoTimeout);

    if (demoMove) {
      // Loop: Gira la cara -> Espera -> Retrocede -> Espera -> Reinicia
      const runDemoLoop = () => {
        if (!three.state.isDemoActive) return;
        
        // Fase 1: Girar
        three.state.moveQueue.push(demoMove);
        three.processQueue();
        
        three.state.demoTimeout = setTimeout(() => {
          if (!three.state.isDemoActive) return;
          
          // Fase 2: Retroceder para el bucle
          const reverseMove = demoMove.includes("'") || demoMove.includes("-") 
            ? demoMove.charAt(0) 
            : demoMove + "'";
          three.state.moveQueue.push(reverseMove);
          three.processQueue();
          
          // Preparar repetición
          three.state.demoTimeout = setTimeout(runDemoLoop, 1500);
        }, 1500); // 1.5s visualizando el ejemplo
      };
      runDemoLoop();
    } else {
       // Resetear si se detiene la demo
       three.state.moveQueue = []; 
    }

    return () => {
      if (three.state.demoTimeout) clearTimeout(three.state.demoTimeout);
      three.state.isDemoActive = false;
    };
  }, [demoMove]);

  // 3. PHYSICAL MOVE OBSERVER (MODO ESPEJO)
  useEffect(() => {
    const three = threeRef.current;
    if (!three || !physicalMove) return;

    // Detenemos la demo para no entrelazar movimientos fantasma
    three.state.isDemoActive = false;
    if (three.state.demoTimeout) clearTimeout(three.state.demoTimeout);
    
    three.state.moveQueue.push(physicalMove);
    three.processQueue();
  }, [physicalMove]);

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full h-full flex items-center justify-center ${className || ''}`}
    />
  );
}
