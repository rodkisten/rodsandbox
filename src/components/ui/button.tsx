'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon';

const variantStyles: Record<ButtonVariant, string> = {
  default: 'bg-neutral-600 text-white hover:bg-neutral-500',
  secondary: 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700',
  ghost: 'bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100',
  destructive: 'bg-red-600 text-white hover:bg-red-500',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-9 px-3 text-sm',
  sm: 'h-8 px-2.5 text-xs',
  icon: 'h-8 w-8 p-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ className, variant = 'default', size = 'default', type = 'button', ref, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
