/**
 * Procedural Web Audio API Sound Generator
 * Generates all game sound effects dynamically with zero external asset dependencies.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  public ytMuted: boolean = false;
  public volume: number = 0.6;

  public setYouTubeAudioEnabled(enabled: boolean) {
    this.ytMuted = !enabled;
    if (this.ytMuted && this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    } else if (!this.ytMuted && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public pauseAll() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  public resumeAll() {
    if (!this.ytMuted && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private initContext() {
    if (this.ytMuted) return;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended' && !this.ytMuted) {
      this.ctx.resume();
    }
  }

  /**
   * Sound effect for placing a piece ('X' or 'O')
   */
  public playPlaceSound(player: 'X' | 'O') {
    if (!this.enabled || this.ytMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Player X: Bright high-tech ping (880Hz -> 440Hz)
    // Player O: Deep warm resonance (520Hz -> 260Hz)
    const baseFreq = player === 'X' ? 880 : 520;
    osc.type = player === 'X' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq / 2, t + 0.12);

    gain.gain.setValueAtTime(this.volume * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  /**
   * Sound effect for a Rubik's layer rotation (whoosh + mechanical click)
   */
  public playRotateSound() {
    if (!this.enabled || this.ytMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // Organic pitch and volume modulation inspired by Seb Lague's physical cube
    const pitchMod = 0.92 + Math.random() * 0.16;
    const volMod = 0.85 + Math.random() * 0.25;

    // Filtered noise click for mechanical feel
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 * pitchMod, t);
    filter.Q.setValueAtTime(4, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(this.volume * 0.35 * volMod, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    whiteNoise.start(t);

    // Subtle low thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140 * pitchMod, t);
    osc.frequency.exponentialRampToValueAtTime(60 * pitchMod, t + 0.1);

    oscGain.gain.setValueAtTime(this.volume * 0.3 * volMod, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.11);

    // High-frequency tactile magnetic alignment snap
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(1400 * pitchMod, t);
    snapOsc.frequency.exponentialRampToValueAtTime(320 * pitchMod, t + 0.035);

    snapGain.gain.setValueAtTime(this.volume * 0.22 * volMod, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.038);

    snapOsc.connect(snapGain);
    snapGain.connect(this.ctx.destination);

    snapOsc.start(t);
    snapOsc.stop(t + 0.04);
  }

  /**
   * Melodic celebratory arpeggio when a board's 3-in-a-row is completed
   */
  public playBoardWinSound() {
    if (!this.enabled || this.ytMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + idx * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(this.volume * 0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  /**
   * Full match victory fanfare
   */
  public playMatchVictorySound() {
    if (!this.enabled || this.ytMuted) return;
    this.initContext();
    if (!this.ctx) return;

    // Victory progression: C5 -> G5 -> C6 with chords
    const chords = [
      { t: 0.0, freqs: [523.25, 659.25, 783.99] },
      { t: 0.2, freqs: [587.33, 739.99, 880.00] },
      { t: 0.4, freqs: [659.25, 830.61, 987.77] },
      { t: 0.65, freqs: [1046.50, 1318.51, 1567.98] },
    ];

    chords.forEach(({ t: offset, freqs }) => {
      freqs.forEach((f) => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime + offset;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t);

        gain.gain.setValueAtTime(this.volume * 0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.65);
      });
    });
  }

  /**
   * UI Click blip
   */
  public playClickSound() {
    if (!this.enabled || this.ytMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.04);

    gain.gain.setValueAtTime(this.volume * 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.05);
  }
}

export const soundEngine = new SoundEngine();
