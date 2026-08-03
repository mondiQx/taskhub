let audioCtx: AudioContext | undefined;

function getContext(): AudioContext | undefined {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return undefined;
  audioCtx ??= new AudioContext();
  return audioCtx;
}

// Browsers suspend a freshly-created AudioContext until a real user gesture
// happens — a WS-triggered reminder is never one. Unlock it on the first
// click/keypress anywhere in the app so the chime can actually play later.
if (typeof window !== "undefined") {
  const unlock = () => {
    getContext()?.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/** Two-tone beep — one repetition of the alarm pattern. */
function playChimeOnce(): void {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  for (const [freq, start] of [
    [880, 0],
    [1320, 0.16],
  ] as const) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.2, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + start);
    osc.stop(now + start + 0.3);
  }
}

let alarmInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Repeats the chime like an alarm clock until stopMeetingAlarm() is called —
 * a single beep is too easy to miss/ignore for something time-sensitive.
 */
export function startMeetingAlarm(): void {
  if (alarmInterval) return; // already ringing
  playChimeOnce();
  alarmInterval = setInterval(playChimeOnce, 1500);
}

export function stopMeetingAlarm(): void {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = undefined;
  }
}
