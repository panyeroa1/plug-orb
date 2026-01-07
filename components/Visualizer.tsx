import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  size: number;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isActive, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; color: string; radius: number }[]>([]);

  useEffect(() => {
    const colors = [
      'rgba(34, 211, 238, 0.5)', // Bright Cyan
      'rgba(168, 85, 247, 0.4)', // Purple
      'rgba(56, 189, 248, 0.4)', // Sky 400
      'rgba(255, 255, 255, 0.2)'  // White
    ];
    particlesRef.current = Array.from({ length: 12 }).map((_, i) => ({
      x: Math.random() * size,
      y: Math.random() * size,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      color: colors[i % colors.length],
      radius: size * (0.2 + Math.random() * 0.3)
    }));
  }, [size]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    let animationFrame: number;

    const draw = () => {
      animationFrame = requestAnimationFrame(draw);

      let bass: number = 0, mids: number = 0, highs: number = 0, totalAvg: number = 0;

      if (isActive && analyser) {
        analyser.getByteFrequencyData(dataArray);
        const getAverage = (start: number, end: number) => {
          let sum = 0;
          const len = Math.min(end, dataArray.length);
          for (let i = start; i < len; i++) sum += dataArray[i];
          return sum / (len - start);
        };
        bass = getAverage(0, 5) / 255;
        mids = getAverage(5, 30) / 255;
        highs = getAverage(30, 100) / 255;
        totalAvg = (bass + mids + highs) / 3;
      } else {
        // Subtle "breathing" animation for idle state
        const time = Date.now() / 1500;
        const breathing = (Math.sin(time) + 1) / 2;
        bass = 0.05 + breathing * 0.05;
        mids = 0.04 + breathing * 0.04;
        highs = 0.03 + breathing * 0.03;
        totalAvg = (bass + mids + highs) / 3;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Layer 1: Radial Background Glow (Supernova)
      ctx.globalCompositeOperation = 'screen';
      const coreSize = size * 0.3 * (1 + totalAvg * 0.8);
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreSize * 1.5);
      
      if (isActive) {
        coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        coreGradient.addColorStop(0.3, 'rgba(34, 211, 238, 0.2)');
        coreGradient.addColorStop(0.7, 'rgba(14, 165, 233, 0.1)');
      } else {
        coreGradient.addColorStop(0, 'rgba(186, 230, 253, 0.15)');
        coreGradient.addColorStop(0.6, 'rgba(14, 165, 233, 0.05)');
      }
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreSize * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Layer 2: Floating Nebula Particles
      particlesRef.current.forEach((p, i) => {
        const speedMultiplier = isActive ? 1.5 : 0.4;
        p.x += p.vx * speedMultiplier;
        p.y += p.vy * speedMultiplier;
        
        if (p.x < 0 || p.x > size) p.vx *= -1;
        if (p.y < 0 || p.y > size) p.vy *= -1;

        const bandValue = i % 3 === 0 ? bass : i % 3 === 1 ? mids : highs;
        const dynamicRadius = p.radius * (1.0 + bandValue * 0.5);
        const color = isActive ? p.color : 'rgba(125, 211, 252, 0.1)';

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dynamicRadius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Layer 3: Radial Frequency Spectrum (Bars)
      const barCount = 48;
      const radius = size * 0.35;
      const barMaxLen = size * 0.15;

      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2;
        // Map frequency data to bars. We use only the first portion of bufferLength as it contains most energy.
        const dataIndex = Math.floor((i / barCount) * (bufferLength / 3));
        const value = isActive ? dataArray[dataIndex] / 255 : (Math.sin(Date.now() / 300 + i * 0.5) + 1) * 0.1;
        
        const currentBarLen = value * barMaxLen * (isActive ? 1.2 : 0.5);
        const innerX = centerX + Math.cos(angle) * radius;
        const innerY = centerY + Math.sin(angle) * radius;
        const outerX = centerX + Math.cos(angle) * (radius + currentBarLen);
        const outerY = centerY + Math.sin(angle) * (radius + currentBarLen);

        ctx.beginPath();
        ctx.moveTo(innerX, innerY);
        ctx.lineTo(outerX, outerY);
        
        // Dynamic styling for bars
        ctx.lineWidth = isActive ? 2 : 1;
        const opacity = isActive ? 0.4 + value * 0.6 : 0.2;
        ctx.strokeStyle = isActive 
          ? `rgba(34, 211, 238, ${opacity})`
          : `rgba(255, 255, 255, ${opacity})`;
        
        if (isActive && value > 0.5) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(34, 211, 238, 0.8)';
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.stroke();
      }
      
      // Reset shadow for next layers
      ctx.shadowBlur = 0;

      // Layer 4: The "Waveform" Ring
      if (isActive) {
        ctx.beginPath();
        for (let i = 0; i <= barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2;
          const dataIndex = Math.floor((i / barCount) * (bufferLength / 4));
          const value = dataArray[dataIndex] / 255;
          const ringRadius = radius + (value * barMaxLen * 0.4);
          const x = centerX + Math.cos(angle) * ringRadius;
          const y = centerY + Math.sin(angle) * ringRadius;
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + totalAvg * 0.3})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Layer 5: Sharp High-Frequency Corona
      if (isActive && totalAvg > 0.2) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (size / 2) * (0.7 + totalAvg * 0.2), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(totalAvg - 0.1) * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    };

    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [analyser, isActive, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="absolute inset-0 pointer-events-none rounded-full"
    />
  );
};

export default Visualizer;