const KEY = "rht-sound-enabled";

export function getSoundEnabled() {
  const raw = localStorage.getItem(KEY);
  return raw === null ? true : raw === "true";
}

export function saveSoundEnabled(enabled) {
  localStorage.setItem(KEY, String(enabled));
}

let ctx = null;
function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function beep({ frequency, duration = 0.15, delay = 0, volume = 0.2 }) {
  const audioCtx = getContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = frequency;
  osc.type = "sine";
  gain.gain.value = volume;
  osc.connect(gain).connect(audioCtx.destination);
  const start = audioCtx.currentTime + delay;
  osc.start(start);
  osc.stop(start + duration);
}

// Distinct, built-in tones per severity — no audio files to manage or ship.
// Letting Scott bring his own custom sound file is a real next step (he asked
// for it explicitly, 2026-09-14) but is a bigger feature on its own (upload,
// storage, playback UI) than belongs in this pass — this ships a working,
// audibly-distinct sound per situation today, built-in tones as v1.
export function playTone(kind) {
  if (!getSoundEnabled()) return;
  try {
    if (kind === "reminder") {
      beep({ frequency: 660, duration: 0.18 });
    } else if (kind === "low") {
      beep({ frequency: 440, duration: 0.15 });
      beep({ frequency: 440, duration: 0.15, delay: 0.22 });
    } else if (kind === "high") {
      beep({ frequency: 880, duration: 0.15 });
      beep({ frequency: 880, duration: 0.15, delay: 0.22 });
    }
  } catch {
    // Browsers block Web Audio until a user gesture has happened on the page —
    // fail silently rather than let a decorative beep break saving or reminders.
  }
}
