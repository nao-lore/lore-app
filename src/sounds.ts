let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
  audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx;
}

function playTone(frequency: number, duration: number, volume = 0.08) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  // Respect feature toggle
  try {
    if (localStorage.getItem('threadlog_feature_sounds') === 'false') return;
  } catch { /* ignore */ }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  osc.type = 'sine';
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function playSuccess() { playTone(880, 0.15); setTimeout(() => playTone(1320, 0.12), 80); }
export function playClick() { playTone(600, 0.06, 0.04); }
export function playDelete() { playTone(330, 0.2, 0.06); }
export function playComplete() { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.15), 200); }
