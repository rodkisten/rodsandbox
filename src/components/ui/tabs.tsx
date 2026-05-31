'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ref, ...props }: React.ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn('inline-flex items-center rounded-md bg-neutral-900 p-1', className)}
      {...props}
    />
  );
}
TabsList.displayName = TabsPrimitive.List.displayName;

export function TabsTrigger({ className, ref, ...props }: React.ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center rounded px-2.5 py-1.5 text-xs font-medium text-neutral-400 transition data-[state=active]:bg-neutral-800 data-[state=active]:text-neutral-300',
        className,
      )}
      {...props}
    />
  );
}
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export function TabsContent({ className, ref, ...props }: React.ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content ref={ref} className={cn('h-full overflow-hidden', className)} {...props} />
  );
}
TabsContent.displayName = TabsPrimitive.Content.displayName;
