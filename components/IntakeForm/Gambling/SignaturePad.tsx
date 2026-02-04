import React, { useRef, useState, useEffect } from 'react';

interface SignaturePadProps {
  onEnd: (base64Data: string | null) => void;
  hasError?: boolean;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onEnd, hasError }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a'; // Navy-900
    }

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const ratio = window.devicePixelRatio || 1;
        const width = parent.clientWidth;
        const height = 180;

        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(ratio, ratio);
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#0f172a';
        }
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [hasSignature]);

  const getCoordinates = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : (event as React.MouseEvent).clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : (event as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchstart') e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    if (e.type === 'touchmove') e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasSignature) setHasSignature(true);
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      onEnd(canvasRef.current?.toDataURL('image/png') || null);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      onEnd(null);
    }
  };

  return (
    <div className="w-full group">
      <div
        className={`relative w-full h-[180px] bg-white border-2 rounded-xl overflow-hidden touch-none transition-colors
          ${hasError
            ? 'border-red-400 bg-red-50'
            : 'border-slate-200 hover:border-slate-400'
          }`}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full"
        />
        {!hasSignature && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-3xl font-serif italic select-none">
            Sign here
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mt-3 px-1">
        <p className={`text-xs font-bold uppercase tracking-wider ${hasError ? 'text-red-500' : 'text-slate-400'}`}>
          {hasError ? 'Required Field' : 'Draw with finger or mouse'}
        </p>
        <button
          type="button"
          onClick={clearSignature}
          className="text-xs font-bold text-navy-900 hover:text-red-600 uppercase tracking-wider transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;