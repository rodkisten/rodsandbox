// Keep the workbench within the visible viewport, including the iOS keyboard.
export function installVisualViewport(): () => void {
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const height = viewport?.height ?? window.innerHeight;
      const offset = viewport?.offsetTop ?? 0;
      const root = document.documentElement;
      root.style.setProperty('--visible-height', height + 'px');
      root.style.setProperty('--visible-top', offset + 'px');
      root.style.setProperty('--completion-height', Math.max(72, Math.min(200, height * 0.32)) + 'px');
    });
  };
  update();
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
  };
}
