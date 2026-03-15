const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function playTone(frequency: number, duration: number, volume = 0.08) {
  if (!audioCtx) return;
  // Respect feature toggle
  try {
    if (localStorage.getItem('threadlog_feature_sounds') === 'false') return;
  } catch { /* ignore */ }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = frequency;
  osc.type = 'sine';
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function playSuccess() { playTone(880, 0.15); setTimeout(() => playTone(1320, 0.12), 80); }
export function playClick() { playTone(600, 0.06, 0.04); }
export function playDelete() { playTone(330, 0.2, 0.06); }
export function playComplete() { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.15), 200); }
