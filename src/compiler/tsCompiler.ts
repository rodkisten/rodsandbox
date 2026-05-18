import ts from 'typescript';
import { Diagnostic } from '@/types';
import { normalizeTsDiagnosticToModel } from '@/diagnostics/normalizer';

export interface CompilerResult {
  /** Emitted JS files: path (with .js extension) → content */
  files: Record<string, string>;
  diagnostics: Diagnostic[];
}

export interface VirtualCompilerFile {
  path: string;
  content: string;
}

const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ES2020,
  strict: false,
  allowJs: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmitOnError: false,
  jsx: ts.JsxEmit.React,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

/** Virtual default lib file name used in our in-memory host */
const VIRTUAL_LIB_NAME = '/__lib.d.ts';

/**
 * Minimal type stubs that cover the most common browser globals.
 * Used instead of the real TypeScript lib files so the compiler works
 * entirely in-memory without a filesystem.
 */
const MINIMAL_LIB_D_TS = `
interface Boolean {}
interface Function {}
interface IArguments {}
interface Number { toString(radix?: number): string; toFixed(digits?: number): string; }
interface Object { toString(): string; hasOwnProperty(v: string): boolean; }
interface RegExp { test(string: string): boolean; exec(string: string): RegExpExecArray | null; source: string; global: boolean; }
interface RegExpExecArray extends Array<string> { index: number; input: string; }
interface String {
  toString(): string; length: number; charAt(pos: number): string;
  charCodeAt(index: number): number; indexOf(searchString: string, position?: number): number;
  lastIndexOf(searchString: string, position?: number): number;
  slice(start?: number, end?: number): string; substring(start: number, end?: number): string;
  toLowerCase(): string; toUpperCase(): string; trim(): string; trimStart(): string; trimEnd(): string;
  split(separator: string | RegExp, limit?: number): string[];
  replace(searchValue: string | RegExp, replaceValue: string): string;
  includes(searchString: string, position?: number): boolean;
  startsWith(searchString: string, position?: number): boolean;
  endsWith(searchString: string, endPosition?: number): boolean;
  repeat(count: number): string; padStart(maxLength: number, fillString?: string): string;
  padEnd(maxLength: number, fillString?: string): string; at(index: number): string | undefined;
  [index: number]: string;
}
interface Array<T> {
  length: number; [n: number]: T; push(...items: T[]): number; pop(): T | undefined;
  shift(): T | undefined; unshift(...items: T[]): number;
  splice(start: number, deleteCount?: number, ...items: T[]): T[];
  slice(start?: number, end?: number): T[];
  indexOf(searchElement: T, fromIndex?: number): number;
  includes(searchElement: T, fromIndex?: number): boolean;
  find(predicate: (value: T, index: number, obj: T[]) => unknown): T | undefined;
  findIndex(predicate: (value: T, index: number, obj: T[]) => unknown): number;
  filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S): S[];
  filter(predicate: (value: T, index: number, array: T[]) => unknown): T[];
  map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[];
  forEach(callbackfn: (value: T, index: number, array: T[]) => void): void;
  reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
  some(predicate: (value: T, index: number, array: T[]) => unknown): boolean;
  every(predicate: (value: T, index: number, array: T[]) => unknown): boolean;
  flat<A, D extends number = 1>(depth?: D): FlatArray<A, D>[];
  flatMap<U>(callback: (value: T, index: number, array: T[]) => U | U[]): U[];
  sort(compareFn?: (a: T, b: T) => number): this;
  reverse(): T[]; join(separator?: string): string;
  concat(...items: (T | T[])[]): T[];
  at(index: number): T | undefined;
}
type FlatArray<Arr, Depth extends number> = any;
interface ReadonlyArray<T> {
  length: number; [n: number]: T;
  find(predicate: (value: T, index: number, obj: ReadonlyArray<T>) => unknown): T | undefined;
  filter(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown): T[];
  map<U>(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => U): U[];
  forEach(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => void): void;
  includes(searchElement: T, fromIndex?: number): boolean;
  some(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown): boolean;
  every(predicate: (value: T, index: number, array: ReadonlyArray<T>) => unknown): boolean;
  indexOf(searchElement: T, fromIndex?: number): number;
  slice(start?: number, end?: number): T[];
  join(separator?: string): string;
}
declare var Array: {
  new<T>(arrayLength?: number): T[];
  isArray(arg: unknown): arg is Array<unknown>;
  from<T>(arrayLike: ArrayLike<T>): T[];
  from<T, U>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => U): U[];
  of<T>(...items: T[]): T[];
};
interface ArrayLike<T> { readonly length: number; readonly [n: number]: T; }
interface Iterable<T> {}
interface IterableIterator<T> {}
interface IteratorResult<T> { done?: boolean; value: T; }
interface Map<K, V> {
  clear(): void; delete(key: K): boolean;
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void;
  get(key: K): V | undefined; has(key: K): boolean; set(key: K, value: V): this;
  readonly size: number; keys(): IterableIterator<K>; values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
}
declare var Map: { new<K, V>(entries?: ReadonlyArray<readonly [K, V]> | null): Map<K, V>; };
interface Set<T> {
  add(value: T): this; clear(): void; delete(value: T): boolean;
  forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void): void;
  has(value: T): boolean; readonly size: number; keys(): IterableIterator<T>; values(): IterableIterator<T>;
}
declare var Set: { new<T>(values?: ReadonlyArray<T> | null): Set<T>; };
interface WeakMap<K extends object, V> { delete(key: K): boolean; get(key: K): V | undefined; has(key: K): boolean; set(key: K, value: V): this; }
declare var WeakMap: { new<K extends object, V>(entries?: ReadonlyArray<readonly [K, V]> | null): WeakMap<K, V>; };
interface Promise<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<T | TResult>;
  finally(onfinally?: (() => void) | null): Promise<T>;
}
interface PromiseLike<T> { then<TResult>(onfulfilled?: ((value: T) => TResult | PromiseLike<TResult>) | null): PromiseLike<TResult>; }
declare var Promise: {
  new<T>(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: unknown) => void) => void): Promise<T>;
  resolve<T>(value: T | PromiseLike<T>): Promise<T>; resolve(): Promise<void>;
  reject<T = never>(reason?: unknown): Promise<T>;
  all<T extends readonly unknown[] | []>(values: T): Promise<{ [K in keyof T]: Awaited<T[K]> }>;
  allSettled<T extends readonly unknown[] | []>(values: T): Promise<{ [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }>;
  race<T>(values: Iterable<T | PromiseLike<T>>): Promise<T>;
  any<T extends readonly unknown[] | []>(values: T): Promise<T[number]>;
};
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
interface PromiseSettledResult<T> { status: 'fulfilled' | 'rejected'; value?: T; reason?: unknown; }
declare var console: {
  log(...data: unknown[]): void; info(...data: unknown[]): void; warn(...data: unknown[]): void;
  error(...data: unknown[]): void; debug(...data: unknown[]): void; table(...tabularData: unknown[]): void;
  group(...data: unknown[]): void; groupEnd(): void; assert(condition?: boolean, ...data: unknown[]): void;
  time(label?: string): void; timeEnd(label?: string): void; clear(): void; count(label?: string): number;
};
interface EventTarget { addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void; removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void; dispatchEvent(event: Event): boolean; }
interface Event { type: string; target: EventTarget | null; currentTarget: EventTarget | null; preventDefault(): void; stopPropagation(): void; }
type EventListenerOrEventListenerObject = EventListener | EventListenerObject;
type EventListener = (evt: Event) => void;
interface EventListenerObject { handleEvent(object: Event): void; }
interface AddEventListenerOptions { capture?: boolean; once?: boolean; passive?: boolean; }
interface EventListenerOptions { capture?: boolean; }
interface UIEvent extends Event {}
interface MouseEvent extends UIEvent { clientX: number; clientY: number; button: number; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; }
interface KeyboardEvent extends UIEvent { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; }
interface Node extends EventTarget { nodeType: number; nodeName: string; textContent: string | null; parentNode: Node | null; childNodes: NodeListOf<Node>; }
interface Element extends Node { tagName: string; id: string; className: string; innerHTML: string; outerHTML: string; getAttribute(name: string): string | null; setAttribute(name: string, value: string): void; removeAttribute(name: string): void; querySelector<E extends Element = Element>(selectors: string): E | null; querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>; closest(selector: string): Element | null; matches(selectors: string): boolean; appendChild<T extends Node>(node: T): T; removeChild<T extends Node>(child: T): T; insertBefore<T extends Node>(node: T, child: Node | null): T; remove(): void; }
interface HTMLElement extends Element { style: CSSStyleDeclaration; offsetWidth: number; offsetHeight: number; offsetTop: number; offsetLeft: number; scrollTop: number; scrollLeft: number; scrollHeight: number; scrollWidth: number; hidden: boolean; focus(): void; blur(): void; click(): void; getBoundingClientRect(): DOMRect; }
interface HTMLInputElement extends HTMLElement { value: string; checked: boolean; type: string; placeholder: string; disabled: boolean; readonly: boolean; }
interface HTMLButtonElement extends HTMLElement { disabled: boolean; type: string; }
interface HTMLSelectElement extends HTMLElement { value: string; selectedIndex: number; options: HTMLCollectionOf<HTMLOptionElement>; }
interface HTMLOptionElement extends HTMLElement { value: string; text: string; selected: boolean; }
interface HTMLCollectionOf<T extends Element> { readonly length: number; item(index: number): T | null; namedItem(name: string): T | null; [index: number]: T; }
interface HTMLAnchorElement extends HTMLElement { href: string; target: string; download: string; }
interface HTMLScriptElement extends HTMLElement { src: string; type: string; async: boolean; defer: boolean; }
interface HTMLStyleElement extends HTMLElement { media: string; }
interface HTMLCanvasElement extends HTMLElement { width: number; height: number; getContext(contextId: '2d'): CanvasRenderingContext2D | null; getContext(contextId: 'webgl'): WebGLRenderingContext | null; toDataURL(type?: string): string; }
interface CanvasRenderingContext2D { fillStyle: string | CanvasGradient; strokeStyle: string | CanvasGradient; lineWidth: number; font: string; fillRect(x: number, y: number, w: number, h: number): void; clearRect(x: number, y: number, w: number, h: number): void; strokeRect(x: number, y: number, w: number, h: number): void; beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void; fill(): void; stroke(): void; fillText(text: string, x: number, y: number, maxWidth?: number): void; strokeText(text: string, x: number, y: number, maxWidth?: number): void; measureText(text: string): TextMetrics; drawImage(image: CanvasImageSource, dx: number, dy: number): void; save(): void; restore(): void; scale(x: number, y: number): void; rotate(angle: number): void; translate(x: number, y: number): void; createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient; createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient; }
interface CanvasGradient { addColorStop(offset: number, color: string): void; }
interface TextMetrics { width: number; }
interface CanvasImageSource {}
interface WebGLRenderingContext {}
interface NodeListOf<T extends Node> extends ReadonlyArray<T> { item(index: number): T; forEach(callbackfn: (value: T, key: number, parent: NodeListOf<T>) => void): void; }
interface DOMRect { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number; }
interface CSSStyleDeclaration { [property: string]: string; cssText: string; getPropertyValue(property: string): string; setProperty(property: string, value: string, priority?: string): void; removeProperty(property: string): string; }
interface Document extends Node {
  body: HTMLElement; head: HTMLElement; title: string; documentElement: HTMLElement;
  getElementById(elementId: string): HTMLElement | null;
  querySelector<E extends Element = Element>(selectors: string): E | null;
  querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>;
  createElement<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K];
  createElement(tagName: string): HTMLElement;
  createTextNode(data: string): Text;
  createDocumentFragment(): DocumentFragment;
  addEventListener<K extends keyof DocumentEventMap>(type: K, listener: (this: Document, ev: DocumentEventMap[K]) => unknown): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}
interface DocumentFragment extends Node { querySelector<E extends Element = Element>(selectors: string): E | null; appendChild<T extends Node>(node: T): T; }
interface Text extends Node { data: string; }
interface DocumentEventMap { 'DOMContentLoaded': Event; 'click': MouseEvent; 'keydown': KeyboardEvent; 'keyup': KeyboardEvent; 'keypress': KeyboardEvent; 'mousemove': MouseEvent; 'scroll': Event; }
interface HTMLElementTagNameMap { 'a': HTMLAnchorElement; 'button': HTMLButtonElement; 'canvas': HTMLCanvasElement; 'div': HTMLElement; 'h1': HTMLElement; 'h2': HTMLElement; 'h3': HTMLElement; 'input': HTMLInputElement; 'p': HTMLElement; 'script': HTMLScriptElement; 'select': HTMLSelectElement; 'span': HTMLElement; 'style': HTMLStyleElement; [key: string]: HTMLElement; }
declare var document: Document;
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; clear(): void; key(index: number): string | null; length: number; }
interface Location { href: string; pathname: string; search: string; hash: string; hostname: string; host: string; origin: string; protocol: string; port: string; assign(url: string): void; replace(url: string): void; reload(): void; }
interface History { length: number; state: unknown; pushState(data: unknown, unused: string, url?: string | URL | null): void; replaceState(data: unknown, unused: string, url?: string | URL | null): void; back(): void; forward(): void; go(delta?: number): void; }
interface Navigator { userAgent: string; language: string; onLine: boolean; hardwareConcurrency: number; }
interface Screen { width: number; height: number; availWidth: number; availHeight: number; }
type TimerHandler = string | ((...args: unknown[]) => void);
interface Window extends EventTarget {
  document: Document; location: Location; history: History; navigator: Navigator; screen: Screen;
  localStorage: Storage; sessionStorage: Storage; console: typeof console;
  innerWidth: number; innerHeight: number; devicePixelRatio: number;
  setTimeout(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
  clearTimeout(id: number | undefined): void;
  setInterval(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
  clearInterval(id: number | undefined): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
  alert(message?: string): void; confirm(message?: string): boolean; prompt(message?: string, _default?: string): string | null;
  open(url?: string, target?: string, features?: string): Window | null;
  close(): void; postMessage(message: unknown, targetOrigin: string): void;
  addEventListener<K extends keyof WindowEventMap>(type: K, listener: (this: Window, ev: WindowEventMap[K]) => unknown): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  scrollTo(x: number, y: number): void; scrollBy(x: number, y: number): void;
  getComputedStyle(elt: Element, pseudoElt?: string | null): CSSStyleDeclaration;
  URL: typeof URL; Blob: typeof Blob;
}
interface WindowEventMap { 'load': Event; 'unload': Event; 'resize': UIEvent; 'scroll': Event; 'click': MouseEvent; 'keydown': KeyboardEvent; 'keyup': KeyboardEvent; 'mousemove': MouseEvent; 'DOMContentLoaded': Event; }
type FrameRequestCallback = (time: number) => void;
declare var window: Window & typeof globalThis;
declare var self: Window & typeof globalThis;
declare var globalThis: Window;
declare function setTimeout(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
declare function clearTimeout(id?: number): void;
declare function setInterval(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
declare function clearInterval(id?: number): void;
declare function requestAnimationFrame(callback: FrameRequestCallback): number;
declare function cancelAnimationFrame(handle: number): void;
declare function fetch(input: string | Request, init?: RequestInit): Promise<Response>;
declare function queueMicrotask(callback: () => void): void;
interface Request { url: string; method: string; headers: Headers; body: ReadableStream<Uint8Array> | null; json(): Promise<unknown>; text(): Promise<string>; }
interface RequestInit { method?: string; headers?: HeadersInit; body?: BodyInit | null; mode?: RequestMode; credentials?: RequestCredentials; }
type RequestMode = 'cors' | 'no-cors' | 'same-origin' | 'navigate';
type RequestCredentials = 'omit' | 'same-origin' | 'include';
type BodyInit = Blob | ArrayBuffer | string | URLSearchParams | FormData;
type HeadersInit = Headers | string[][] | Record<string, string>;
interface Headers { append(name: string, value: string): void; delete(name: string): void; get(name: string): string | null; has(name: string): boolean; set(name: string, value: string): void; forEach(callbackfn: (value: string, key: string) => void): void; }
interface Response { ok: boolean; status: number; statusText: string; headers: Headers; url: string; redirected: boolean; json(): Promise<unknown>; text(): Promise<string>; blob(): Promise<Blob>; arrayBuffer(): Promise<ArrayBuffer>; clone(): Response; }
interface ReadableStream<R = unknown> { getReader(): ReadableStreamDefaultReader<R>; }
interface ReadableStreamDefaultReader<R = unknown> { read(): Promise<IteratorResult<R | undefined>>; releaseLock(): void; cancel(): Promise<void>; }
interface Blob { size: number; type: string; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; stream(): ReadableStream<Uint8Array>; slice(start?: number, end?: number, contentType?: string): Blob; }
declare var Blob: { new(blobParts?: BlobPart[], options?: BlobPropertyBag): Blob; };
type BlobPart = BufferSource | Blob | string;
type BufferSource = ArrayBufferView | ArrayBuffer;
interface BlobPropertyBag { type?: string; endings?: 'transparent' | 'native'; }
interface URL { href: string; origin: string; protocol: string; username: string; password: string; host: string; hostname: string; port: string; pathname: string; search: string; hash: string; toString(): string; }
declare var URL: { new(url: string, base?: string | URL): URL; createObjectURL(object: Blob | MediaSource): string; revokeObjectURL(url: string): void; };
interface URLSearchParams { append(name: string, value: string): void; delete(name: string): void; get(name: string): string | null; getAll(name: string): string[]; has(name: string): boolean; set(name: string, value: string): void; toString(): string; forEach(callbackfn: (value: string, key: string) => void): void; }
declare var URLSearchParams: { new(init?: string | URLSearchParams | Record<string, string>): URLSearchParams; };
interface FormData { append(name: string, value: string | Blob, fileName?: string): void; delete(name: string): void; get(name: string): string | File | null; has(name: string): boolean; set(name: string, value: string | Blob, fileName?: string): void; forEach(callbackfn: (value: string | File, key: string) => void): void; }
declare var FormData: { new(): FormData; };
interface File extends Blob { name: string; lastModified: number; }
interface MediaSource {}
interface ArrayBuffer { byteLength: number; slice(begin: number, end?: number): ArrayBuffer; }
interface ArrayBufferView { buffer: ArrayBuffer; byteOffset: number; byteLength: number; }
declare var ArrayBuffer: { new(byteLength: number): ArrayBuffer; isView(arg: unknown): arg is ArrayBufferView; };
interface Uint8Array extends ArrayBufferView { length: number; [index: number]: number; set(array: ArrayLike<number>, offset?: number): void; subarray(begin?: number, end?: number): Uint8Array; }
interface Int32Array extends ArrayBufferView { length: number; [index: number]: number; }
interface Float32Array extends ArrayBufferView { length: number; [index: number]: number; }
interface Float64Array extends ArrayBufferView { length: number; [index: number]: number; }
declare function parseInt(string: string, radix?: number): number;
declare function parseFloat(string: string): number;
declare function isNaN(number: number): boolean;
declare function isFinite(number: number): boolean;
declare function encodeURIComponent(uriComponent: string | number | boolean): string;
declare function decodeURIComponent(encodedURIComponent: string): string;
declare function encodeURI(uri: string): string;
declare function decodeURI(encodedURI: string): string;
declare function atob(data: string): string;
declare function btoa(data: string): string;
declare var Math: {
  abs(x: number): number; ceil(x: number): number; floor(x: number): number;
  round(x: number): number; trunc(x: number): number; sign(x: number): number;
  max(...values: number[]): number; min(...values: number[]): number;
  pow(x: number, y: number): number; sqrt(x: number): number; cbrt(x: number): number;
  random(): number; PI: number; E: number; LN2: number; LN10: number; LOG2E: number; LOG10E: number; SQRT2: number;
  log(x: number): number; log2(x: number): number; log10(x: number): number; exp(x: number): number; expm1(x: number): number;
  sin(x: number): number; cos(x: number): number; tan(x: number): number;
  asin(x: number): number; acos(x: number): number; atan(x: number): number; atan2(y: number, x: number): number;
  sinh(x: number): number; cosh(x: number): number; tanh(x: number): number;
  hypot(...values: number[]): number; clz32(x: number): number; imul(x: number, y: number): number; fround(x: number): number;
};
declare var JSON: {
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown;
  stringify(value: unknown, replacer?: ((this: unknown, key: string, value: unknown) => unknown) | (string | number)[] | null, space?: string | number): string;
};
declare var Date: {
  new(): Date; new(value: number | string): Date; new(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date;
  now(): number; parse(s: string): number; UTC(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): number;
};
interface Date {
  getTime(): number; valueOf(): number; toISOString(): string; toJSON(): string;
  toLocaleDateString(locales?: string, options?: unknown): string; toLocaleTimeString(locales?: string, options?: unknown): string;
  toLocaleString(locales?: string, options?: unknown): string; toString(): string; toUTCString(): string;
  getFullYear(): number; getMonth(): number; getDate(): number; getDay(): number;
  getHours(): number; getMinutes(): number; getSeconds(): number; getMilliseconds(): number;
  getTimezoneOffset(): number; getUTCFullYear(): number; getUTCMonth(): number; getUTCDate(): number;
  setFullYear(year: number): number; setMonth(month: number): number; setDate(date: number): number;
  setHours(hours: number): number; setMinutes(min: number): number; setSeconds(sec: number): number; setMilliseconds(ms: number): number;
  setTime(time: number): number;
}
declare var Error: { new(message?: string): Error; (message?: string): Error; readonly prototype: Error; captureStackTrace(thisVal: unknown, func?: unknown): void; stackTraceLimit: number; };
interface Error { message: string; name: string; stack?: string; cause?: unknown; }
declare var TypeError: { new(message?: string): TypeError; (message?: string): TypeError; };
interface TypeError extends Error {}
declare var RangeError: { new(message?: string): RangeError; (message?: string): RangeError; };
interface RangeError extends Error {}
declare var ReferenceError: { new(message?: string): ReferenceError; (message?: string): ReferenceError; };
interface ReferenceError extends Error {}
declare var SyntaxError: { new(message?: string): SyntaxError; (message?: string): SyntaxError; };
interface SyntaxError extends Error {}
declare var Object: {
  keys<T extends object>(o: T): (keyof T extends string ? keyof T : string)[];
  values<T>(o: { [s: string]: T } | ArrayLike<T>): T[];
  entries<T>(o: { [s: string]: T } | ArrayLike<T>): [string, T][];
  assign<T extends object, U>(target: T, source: U): T & U;
  assign<T extends object, U, V>(target: T, source1: U, source2: V): T & U & V;
  create(proto: object | null, properties?: PropertyDescriptorMap): unknown;
  freeze<T>(o: T): Readonly<T>;
  defineProperty(o: unknown, p: PropertyKey, attributes: PropertyDescriptor): unknown;
  defineProperties(o: unknown, properties: PropertyDescriptorMap): unknown;
  getOwnPropertyNames(o: unknown): string[];
  getOwnPropertyDescriptor(o: unknown, p: PropertyKey): PropertyDescriptor | undefined;
  getPrototypeOf(o: unknown): unknown;
  setPrototypeOf(o: unknown, proto: object | null): unknown;
  is(value1: unknown, value2: unknown): boolean;
  fromEntries<T>(entries: Iterable<readonly [PropertyKey, T]>): { [k: string]: T };
  hasOwn(o: object, v: PropertyKey): boolean;
};
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Partial<T> = { [P in keyof T]?: T[P] };
type Required<T> = { [P in keyof T]-?: T[P] };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
type Exclude<T, U> = T extends U ? never : T;
type Extract<T, U> = T extends U ? T : never;
type NonNullable<T> = T & {};
type ReturnType<T extends (...args: never) => unknown> = T extends (...args: never) => infer R ? R : never;
type Parameters<T extends (...args: never) => unknown> = T extends (...args: infer P) => unknown ? P : never;
type ConstructorParameters<T extends abstract new (...args: never) => unknown> = T extends abstract new (...args: infer P) => unknown ? P : never;
type InstanceType<T extends abstract new (...args: never) => unknown> = T extends abstract new (...args: never) => infer R ? R : never;
type Record<K extends keyof unknown, T> = { [P in K]: T };
type PropertyKey = string | number | symbol;
interface PropertyDescriptor { configurable?: boolean; enumerable?: boolean; value?: unknown; writable?: boolean; get?(): unknown; set?(v: unknown): void; }
interface PropertyDescriptorMap { [key: PropertyKey]: PropertyDescriptor; }
declare var Symbol: { (description?: string | number): symbol; readonly prototype: Symbol; readonly iterator: unique symbol; readonly asyncIterator: unique symbol; readonly toPrimitive: unique symbol; readonly toStringTag: unique symbol; readonly hasInstance: unique symbol; for(key: string): symbol; keyFor(sym: symbol): string | undefined; };
interface Symbol { toString(): string; valueOf(): symbol; readonly description: string | undefined; }
type TemplateStringsArray = ReadonlyArray<string> & { readonly raw: ReadonlyArray<string>; };
declare function structuredClone<T>(value: T, options?: { transfer?: unknown[] }): T;
declare function eval(x: string): unknown;
`;

function createLanguageServiceHost(
  files: Map<string, string>,
  getVersion: () => number
): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => [VIRTUAL_LIB_NAME, ...Array.from(files.keys())],
    getScriptVersion: () => String(getVersion()),
    getScriptSnapshot: (fileName) => {
      if (fileName === VIRTUAL_LIB_NAME) {
        return ts.ScriptSnapshot.fromString(MINIMAL_LIB_D_TS);
      }
      const content = files.get(fileName);
      if (content === undefined) return undefined;
      return ts.ScriptSnapshot.fromString(content);
    },
    getDefaultLibFileName: () => VIRTUAL_LIB_NAME,
    fileExists: (fileName) =>
      fileName === VIRTUAL_LIB_NAME || files.has(fileName),
    readFile: (fileName) => {
      if (fileName === VIRTUAL_LIB_NAME) return MINIMAL_LIB_D_TS;
      return files.get(fileName);
    },
    readDirectory: () => [],
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => ({
      ...DEFAULT_COMPILER_OPTIONS,
      noLib: false,
    }),
    getNewLine: () => '\n',
    useCaseSensitiveFileNames: () => true,
    resolveModuleNameLiterals: undefined,
  };
}

/**
 * Compiles a set of virtual TypeScript/JavaScript files using the TypeScript
 * compiler API in the browser. Uses an in-memory LanguageServiceHost backed
 * by a Map of filename → content.
 */
export class BrowserTypeScriptCompiler {
  private files: Map<string, string> = new Map();
  private version = 0;
  private languageService: ts.LanguageService;

  constructor() {
    const host = createLanguageServiceHost(this.files, () => this.version);
    this.languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  updateFile(path: string, content: string): void {
    this.files.set(path, content);
    this.version++;
  }

  removeFile(path: string): void {
    this.files.delete(path);
    this.version++;
  }

  /**
   * Compiles all .ts/.tsx files in the virtual filesystem and returns emitted
   * JS alongside any diagnostics. Uses transpileModule per file so the output
   * is always produced even when type errors are present.
   */
  compile(): CompilerResult {
    const result: CompilerResult = { files: {}, diagnostics: [] };

    for (const [filePath, content] of this.files) {
      if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue;

      // transpileModule is reliable in the browser and doesn't require lib files
      const transpiled = ts.transpileModule(content, {
        compilerOptions: DEFAULT_COMPILER_OPTIONS,
        fileName: filePath,
        reportDiagnostics: true,
      });

      const outputPath = filePath.replace(/\.tsx?$/, '.js');
      result.files[outputPath] = transpiled.outputText;

      // transpileModule reports syntactic diagnostics
      if (transpiled.diagnostics) {
        for (const diag of transpiled.diagnostics) {
          result.diagnostics.push(normalizeTsDiagnosticToModel(diag, filePath));
        }
      }
    }

    // Also collect semantic + syntactic diagnostics from the language service
    for (const filePath of this.files.keys()) {
      if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue;
      try {
        const semantic = this.languageService.getSemanticDiagnostics(filePath);
        for (const diag of semantic) {
          result.diagnostics.push(normalizeTsDiagnosticToModel(diag, filePath));
        }
      } catch {
        // Language service can fail in constrained browser environments; non-fatal
      }
    }

    // Deduplicate diagnostics by message + line + column
    const seen = new Set<string>();
    result.diagnostics = result.diagnostics.filter((d) => {
      const key = `${d.fileId}:${d.line}:${d.column}:${d.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return result;
  }

  getSemanticDiagnostics(path: string): Diagnostic[] {
    if (!this.files.has(path)) return [];
    try {
      return this.languageService
        .getSemanticDiagnostics(path)
        .map((d) => normalizeTsDiagnosticToModel(d, path));
    } catch {
      return [];
    }
  }

  getSyntacticDiagnostics(path: string): Diagnostic[] {
    const content = this.files.get(path);
    if (content === undefined) return [];
    const result = ts.transpileModule(content, {
      compilerOptions: DEFAULT_COMPILER_OPTIONS,
      fileName: path,
      reportDiagnostics: true,
    });
    return (result.diagnostics ?? []).map((d) =>
      normalizeTsDiagnosticToModel(d, path)
    );
  }
}
