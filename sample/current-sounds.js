// Reference synthesis copied from script.js; isolated from application state.
function playBeep(freq = 1800, duration = 0.12) {
  if (appState.isMuted) return;
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.05, audioCtx.currentTime + duration * 0.7);

    // Keep the familiar lower levels; give the upper 30% more presence over music.
    const volume = Math.max(0, Math.min(10, appState.soundVolume));
    const boost = Math.max(0, (volume - 7) / 3);
    const peak = 0.55 * (volume / 7) + boost * (1 - 0.55 * (10 / 7));
    gain.gain.setValueAtTime(peak, audioCtx.currentTime);
    if (boost > 0) {
      gain.gain.setValueAtTime(peak, audioCtx.currentTime + duration * 0.3 * boost);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playDoubleBeep() {
  if (appState.isMuted) return;
  playBeep(2300, 0.07);
  setTimeout(() => {
    playBeep(2450, 0.07);
  }, 85);
}

function playTreasureFanfare() {
  if (false) {
    navigator.vibrate([200, 100, 300, 100, 600]);
  }

  if (appState.isMuted) return;
  if (!audioCtx) initAudio();
  if (!audioCtx || audioCtx.state !== 'running') return;

  const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66, 1318.51];
  const startedAt = audioCtx.currentTime;
  notes.forEach((freq, idx) => {
    try {
      if (appState.isMuted || !audioCtx) return;
      const start = startedAt + idx * 0.115;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      const dur = (idx === notes.length - 1) ? 1.5 : 0.18;
      gain.gain.setValueAtTime(0.55 * (appState.soundVolume / 7), start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(start);
      osc.stop(start + dur);
    } catch (_) {}
  });
}

function playChallengeFanfare(completed) {
  if (appState.isMuted) return;
  try {
    if (!audioCtx) initAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    const notes = completed ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 783.99];
    notes.forEach((frequency, index) => {
      const start = audioCtx.currentTime + index * 0.12;
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16 * (appState.soundVolume / 7), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      oscillator.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + 0.5);
    });
  } catch (error) { /* Visual feedback remains available without audio support. */ }
}
