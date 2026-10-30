// Small Web Audio synthesizer for Unison's tactile cues. No audio files, no
// autoplay: the AudioContext is only created after a user gesture, and every
// call is a silent no-op if audio is unavailable.

export type SoundName = "tick" | "pop" | "ready" | "reveal" | "victory" | "join";

const STORAGE_KEY = "unison:sound";

// C major pentatonic-ish palette; victory resolves to a warm C major add9.
const CHORD = [261.63, 329.63, 392.0, 523.25, 587.33];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      this.enabled = true;
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      // storage unavailable: preference lasts for this page only
    }
    if (value) this.unlock();
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        const compressor = this.ctx.createDynamicsCompressor();
        this.master.connect(compressor).connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  play(name: SoundName, voices = 3) {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== "running") return;
    try {
      const t = this.ctx.currentTime + 0.01;
      switch (name) {
        case "tick":
          this.tone({ freq: 1320, start: t, dur: 0.035, gain: 0.08, type: "sine" });
          break;
        case "pop":
          this.tone({ freq: 660, to: 330, start: t, dur: 0.14, gain: 0.35, type: "sine" });
          this.tone({ freq: 1320, start: t, dur: 0.05, gain: 0.06, type: "triangle" });
          break;
        case "ready":
          this.tone({ freq: 880, start: t, dur: 0.22, gain: 0.12, type: "triangle" });
          break;
        case "join":
          this.tone({ freq: 523.25, start: t, dur: 0.18, gain: 0.12, type: "sine" });
          this.tone({ freq: 784, start: t + 0.08, dur: 0.24, gain: 0.1, type: "sine" });
          break;
        case "reveal":
          CHORD.slice(0, Math.max(2, Math.min(voices, 4))).forEach((f, i) =>
            this.tone({ freq: f, start: t + i * 0.11, dur: 0.5, gain: 0.16, type: "sine" }),
          );
          break;
        case "victory":
          this.victory(t, voices);
          break;
      }
    } catch {
      // never let audio break the game
    }
  }

  /** Several scattered pitches glide and resolve into one warm chord. */
  private victory(t: number, voices: number) {
    const n = Math.max(2, Math.min(voices, 4));
    const scattered = [233.08, 349.23, 415.3, 493.88];
    for (let i = 0; i < n; i++) {
      this.tone({ freq: scattered[i], to: CHORD[i], start: t, glide: 0.55, dur: 2.2, gain: 0.18, type: "triangle" });
    }
    // The shared root and a soft shimmer once the chord has resolved.
    this.tone({ freq: 130.81, start: t + 0.5, dur: 2.4, gain: 0.22, type: "sine" });
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
      this.tone({ freq: f, start: t + 0.75 + i * 0.07, dur: 0.6, gain: 0.04, type: "sine" }),
    );
  }

  private tone(opts: {
    freq: number;
    to?: number;
    glide?: number;
    start: number;
    dur: number;
    gain: number;
    type: OscillatorType;
  }) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, opts.start);
    if (opts.to) {
      osc.frequency.exponentialRampToValueAtTime(opts.to, opts.start + (opts.glide ?? opts.dur * 0.8));
    }
    const attack = Math.min(0.02, opts.dur / 4);
    env.gain.setValueAtTime(0.0001, opts.start);
    env.gain.exponentialRampToValueAtTime(opts.gain, opts.start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur);
    osc.connect(env).connect(this.master!);
    osc.start(opts.start);
    osc.stop(opts.start + opts.dur + 0.05);
  }
}
