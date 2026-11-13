import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export const HeroCanvas: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || 760;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.z = 320;

    // Subtle ambient dot particles in #0d0d0d for WebGL depth
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 520;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 320;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x0d0d0d,
      size: 2.2,
      transparent: true,
      opacity: 0.11,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let targetX = 0;
    let targetY = 0;
    const onPointerMove = (e: PointerEvent) => {
      targetX = ((e.clientX / window.innerWidth) - 0.5) * 14;
      targetY = ((e.clientY / window.innerHeight) - 0.5) * -10;
    };

    const onResize = () => {
      if (!container || !renderer) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || 760;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize);

    if (reducedMotion) {
      renderer.render(scene, camera);
    }

    let rafId = 0;
    let startTime = performance.now();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      if (document.hidden || !renderer) return;

      const t = (now - startTime) * 0.0004;
      points.rotation.y = Math.sin(t) * 0.04 + targetX * 0.002;
      points.rotation.x = Math.cos(t * 0.8) * 0.03 + targetY * 0.002;
      camera.position.x += (targetX - camera.position.x) * 0.04;
      camera.position.y += (targetY - camera.position.y) * 0.04;

      renderer.render(scene, camera);
    };

    if (!reducedMotion) {
      rafId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      }
    };
  }, [reducedMotion]);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};

