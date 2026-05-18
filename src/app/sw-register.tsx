'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/registerSw';

export default function SwRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}

