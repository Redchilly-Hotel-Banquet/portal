/** Web Audio siren + acknowledgement persistence for the kitchen console. */

export type AlarmHandle = {
  ctx: AudioContext;
  osc: OscillatorNode | null;
  modOsc: OscillatorNode | null;
  gain: GainNode | null;
  modGain: GainNode | null;
};

export type AlarmRef = { current: AlarmHandle | null };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function getContext(ref: AlarmRef): AudioContext {
  const w = window as AudioWindow;
  const AC = window.AudioContext || w.webkitAudioContext;
  const ctx = ref.current?.ctx ?? new AC!();
  if (!ref.current) ref.current = { ctx, osc: null, modOsc: null, gain: null, modGain: null };
  else ref.current.ctx = ctx;
  return ctx;
}

/** Must be called from a user gesture the first time (autoplay policy). */
export async function unlockAudio(ref: AlarmRef): Promise<boolean> {
  try {
    const ctx = getContext(ref);
    await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

export function startSiren(ref: AlarmRef) {
  try {
    const ctx = getContext(ref);
    if (ref.current?.osc) return;

    const osc = ctx.createOscillator();
    const modOsc = ctx.createOscillator();
    const gain = ctx.createGain();
    const modGain = ctx.createGain();

    osc.type = "square";
    modOsc.type = "sine";
    modOsc.frequency.value = 2.2; // sweep rate
    modGain.gain.value = 650; // sweep depth
    osc.frequency.value = 1150; // centre pitch
    gain.gain.value = 0.23;

    modOsc.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ctx.destination);

    ref.current = { ctx, osc, modOsc, gain, modGain };

    if (ctx.state === "running") {
      osc.start();
      modOsc.start();
      navigator.vibrate?.([250, 150, 250, 150, 250]);
    }
  } catch (error) {
    console.error("Siren failed to start", error);
  }
}

export function stopSiren(ref: AlarmRef) {
  const h = ref.current;
  if (!h) return;
  try {
    h.osc?.stop();
    h.modOsc?.stop();
  } catch {
    // oscillator was never started
  }
  try {
    h.osc?.disconnect();
    h.modOsc?.disconnect();
    h.gain?.disconnect();
    h.modGain?.disconnect();
  } catch {
    // already disconnected
  }
  ref.current = { ctx: h.ctx, osc: null, modOsc: null, gain: null, modGain: null };
}

const ACK_KEY = "acknowledgedOrderIds";

export function getAcked(): Set<string> {
  try {
    const raw = sessionStorage.getItem(ACK_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function addAcked(ids: string[]) {
  try {
    const s = getAcked();
    ids.forEach((id) => s.add(id));
    sessionStorage.setItem(ACK_KEY, JSON.stringify(Array.from(s)));
  } catch {
    // storage unavailable; alarm may re-fire after reload
  }
}
