'use client';
import { useRef, useCallback } from 'react';

type Direction = 'horizontal' | 'vertical';

interface UseDraggableResizeOptions {
  direction: Direction;
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  onResize?: (size: number) => void;
}

export function useDraggableResize({ direction, initialSize, minSize = 100, maxSize = 2000, onResize }: UseDraggableResizeOptions) {
  const sizeRef = useRef(initialSize);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const startSize = sizeRef.current;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = direction === 'horizontal'
          ? moveEvent.clientX - startPos
          : moveEvent.clientY - startPos;
        const newSize = Math.min(maxSize, Math.max(minSize, startSize + delta));
        sizeRef.current = newSize;
        onResize?.(newSize);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [direction, minSize, maxSize, onResize]
  );

  return { startDrag, sizeRef };
}
