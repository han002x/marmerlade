export function addMessageTraces(drawing: SVGSVGElement, messageSteps: ReadonlyMap<number, number>) {
  const traces: SVGElement[] = [];
  for (const message of drawing.querySelectorAll('[data-et="message"][data-statement]')) {
    const step = messageSteps.get(Number(message.getAttribute('data-statement')));
    if (step === undefined) continue;
    const ink = message.nextElementSibling;
    const styled = ink?.hasAttribute('data-sq-ink') ? ink : message;
    const reverse = styled.hasAttribute('marker-start');
    const directions = reverse && styled.hasAttribute('marker-end') ? [false, true] : [reverse];
    const width = Math.max(2.5, parseFloat(getComputedStyle(styled).strokeWidth) || 0) + 0.5;
    for (const backward of directions) {
      const trace = document.createElementNS('http://www.w3.org/2000/svg', message.localName);
      for (const name of ['d', 'x1', 'y1', 'x2', 'y2', 'transform']) {
        const value = message.getAttribute(name);
        if (value !== null) trace.setAttribute(name, value);
      }
      trace.classList.add('mf-flow-trace');
      trace.classList.toggle('mf-flow-reverse', backward);
      trace.setAttribute('pathLength', '1');
      trace.setAttribute('aria-hidden', 'true');
      trace.style.setProperty('--mf-flow-s', String(step));
      trace.style.strokeWidth = String(width);
      styled.after(trace);
      traces.push(trace);
    }
  }
  return () => traces.forEach((trace) => trace.remove());
}
