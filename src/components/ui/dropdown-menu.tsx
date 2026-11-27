'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { useSandboxRuntime } from '@/browser/RuntimeContext';
import { cn } from '@/lib/cn';

export function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const { embedded } = useSandboxRuntime();
  return <DropdownMenuPrimitive.Root {...props} modal={embedded ? false : props.modal} />;
}
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuPortal(props: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  const { portalContainer } = useSandboxRuntime();
  return <DropdownMenuPrimitive.Portal {...props} container={props.container ?? portalContainer} />;
}
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        'flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-neutral-800 data-[state=open]:bg-neutral-800',
        inset && 'pl-8',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

export function DropdownMenuSubContent({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 p-1 text-neutral-100 shadow-xl',
        className,
      )}
      {...props}
    />
  );
}
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[14rem] overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 p-1 text-neutral-100 shadow-xl',
          className,
        )}
        {...props}
      />
    </DropdownMenuPortal>
  );
}
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export function DropdownMenuItem({
  className,
  inset,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-neutral-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-neutral-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

export function DropdownMenuRadioItem({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-neutral-800',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <div className="size-2 rounded-full bg-neutral-200" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

export function DropdownMenuLabel({
  className,
  inset,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-xs font-semibold text-neutral-400', inset && 'pl-8', className)}
      {...props}
    />
  );
}
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

export function DropdownMenuSeparator({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-neutral-700', className)} {...props} />
  );
}
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
