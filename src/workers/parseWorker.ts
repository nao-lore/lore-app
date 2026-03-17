self.onmessage = (e: MessageEvent<string>) => {
  try {
    // Find JSON in the raw AI response
    const text = e.data;
    const start = text.indexOf('{');
    if (start === -1) { self.postMessage({ error: 'No JSON found' }); return; }
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { self.postMessage({ result: JSON.parse(text.slice(start, i + 1)) }); return; } }
    }
    self.postMessage({ error: 'Incomplete JSON' });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
