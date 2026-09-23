export type AudioScene = 'landing' | 'waiting' | 'drawing' | 'judging' | 'showcase' | 'leaderboard' | 'podium';
export type SoundEffect = 'press' | 'tick' | 'submit' | 'podium' | 'reveal' | 'drumroll' | 'champion' | 'cheers';
export type MusicTheme = 'ragtime' | 'holiday';
export type SoundPreferences = { music: number; effects: number; muted: boolean; theme: MusicTheme };
const storageKey = 'draw-it-right:sound';
const defaults: SoundPreferences = { music: 60, effects: 80, muted: false, theme: 'ragtime' };

export function parseSoundPreferences(raw: string | null): SoundPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (typeof value !== 'object' || value === null) return { ...defaults };
    const volume = (input: unknown, fallback: number) => typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= 100 ? Math.round(input) : fallback;
    const theme = 'theme' in value && (value.theme === 'holiday' || value.theme === 'ragtime') ? value.theme : defaults.theme;
    return { music: volume('music' in value ? value.music : undefined, defaults.music), effects: volume('effects' in value ? value.effects : undefined, defaults.effects), muted: 'muted' in value && value.muted === true, theme };
  } catch { return { ...defaults }; }
}

// These gains multiply the user's music slider; SFX keep their own volume.
export const sceneMusicLevel: Record<AudioScene, number> = { landing: 0.26, waiting: 0.26, drawing: 0.4, judging: 0.14, showcase: 0.14, leaderboard: 0.12, podium: 0 };
type MusicGroup = 'lobby' | 'match';
export const musicGroupFor = (scene: AudioScene): MusicGroup => scene === 'landing' || scene === 'waiting' ? 'lobby' : 'match';
const themeTracks: Record<MusicTheme, Record<MusicGroup, string>> = {
  ragtime: { lobby: '/audio/the-entertainer.mp3', match: '/audio/maple-leaf-rag.mp3' },
  holiday: { lobby: '/audio/wish-background.mp3', match: '/audio/maple-leaf-rag.mp3' },
};
type Track = { audio: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode; pauseTimer?: ReturnType<typeof setTimeout> };
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class GameAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private tracks = new Map<string, Track>();
  private activeTrack: Track | null = null;
  private podiumPauseTimer: ReturnType<typeof setTimeout> | undefined;
  private clipElements = new Map<string, HTMLAudioElement>();
  private sources = new Set<OscillatorNode>();
  private listeners = new Set<() => void>();
  private scenes = new Map<symbol, { scene: AudioScene; priority: number }>();
  private scene: AudioScene = 'landing';
  private lastEffect = new Map<SoundEffect, number>();
  private preferences: SoundPreferences = (() => {
    try { return parseSoundPreferences(localStorage.getItem(storageKey)); } catch { return { ...defaults }; }
  })();

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getPreferences = () => this.preferences;

  updatePreferences(patch: Partial<SoundPreferences>): boolean {
    const oldTheme = this.preferences.theme;
    this.preferences = parseSoundPreferences(JSON.stringify({ ...this.preferences, ...patch }));
    this.applyVolume();
    if (this.preferences.theme !== oldTheme && this.context?.state === 'running' && !document.hidden && this.scene !== 'podium') {
      this.startTrack();
    }
    this.listeners.forEach(listener => listener());
    try { localStorage.setItem(storageKey, JSON.stringify(this.preferences)); return true; } catch { return false; }
  }

  syncPreferences = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    const oldTheme = this.preferences.theme;
    this.preferences = parseSoundPreferences(event.newValue);
    this.applyVolume();
    if (this.preferences.theme !== oldTheme && this.context?.state === 'running' && !document.hidden && this.scene !== 'podium') {
      this.startTrack();
    }
    this.listeners.forEach(listener => listener());
  };

  async unlock() {
    if (document.hidden) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        this.music.connect(this.context.destination);
        this.effects.connect(this.context.destination);
        this.applyVolume();
      }
      if (this.context.state !== 'running') await this.context.resume();
      if (!document.hidden && this.context.state === 'running') this.startTrack();
    } catch { /* Audio is optional. A later user gesture can retry browser permission. */ }
  }

  register(scene: AudioScene, priority: number) {
    const id = Symbol();
    this.scenes.set(id, { scene, priority });
    this.selectScene();
    return () => { this.scenes.delete(id); this.selectScene(); };
  }

  private selectScene() {
    // Coalesce React effect cleanups/setups. Screen changes within a music group
    // never replace the media element, seek, or restart its playback.
    queueMicrotask(() => {
      const next = [...this.scenes.values()].sort((a, b) => b.priority - a.priority)[0]?.scene ?? 'landing';
      if (this.scene === next) return;
      this.scene = next;
      if (this.podiumPauseTimer) clearTimeout(this.podiumPauseTimer);
      this.applyVolume(0.8);
      if (next === 'podium') {
        this.podiumPauseTimer = setTimeout(() => {
          if (this.scene !== 'podium') return;
          for (const track of this.tracks.values()) track.audio.pause();
          this.activeTrack = null;
        }, 800);
      } else if (this.context?.state === 'running' && !document.hidden) this.startTrack();
    });
  }

  private applyVolume(transition = 0.08) {
    if (!this.context || !this.music || !this.effects) return;
    const { music, effects, muted } = this.preferences;
    const gain = this.music.gain;
    const now = this.context.currentTime;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else { const current = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(current, now); }
    gain.linearRampToValueAtTime(muted ? 0 : (music / 100) * sceneMusicLevel[this.scene], now + transition);
    this.effects.gain.setTargetAtTime(muted ? 0 : effects / 100, this.context.currentTime, 0.02);
  }

  private startTrack() {
    const context = this.context;
    if (!context || !this.music || this.scene === 'podium') return;
    const group = musicGroupFor(this.scene);
    const theme = this.preferences.theme;
    const trackKey = `${theme}:${group}`;
    const src = themeTracks[theme][group];
    let track = this.tracks.get(trackKey);
    if (!track) {
      const audio = new Audio(src);
      audio.loop = true;
      audio.preload = 'auto';
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      source.connect(gain).connect(this.music);
      track = { audio, source, gain };
      this.tracks.set(trackKey, track);
    }
    if (this.activeTrack === track && !track.audio.paused) return;
    if (track.pauseTimer) clearTimeout(track.pauseTimer);
    this.activeTrack = track;
    const incoming = track;
    void incoming.audio.play().then(() => {
      if (document.hidden || this.scene === 'podium' || this.activeTrack !== incoming || this.context !== context) {
        incoming.audio.pause();
        return;
      }
      incoming.gain.gain.setTargetAtTime(1, context.currentTime, 0.22);
      for (const [key, other] of this.tracks.entries()) {
        if (key === trackKey) continue;
        other.gain.gain.setTargetAtTime(0, context.currentTime, 0.22);
        if (other.pauseTimer) clearTimeout(other.pauseTimer);
        other.pauseTimer = setTimeout(() => {
          if (this.activeTrack !== other) other.audio.pause();
        }, 1400);
      }
    }).catch(() => {
      if (this.activeTrack === incoming) this.activeTrack = null;
    });
  }

  private tone(pitch: number, at: number, duration: number, level: number) {
    const context = this.context;
    if (!context || !this.effects) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency(pitch), at);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(this.effects);
    this.sources.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.sources.delete(oscillator); };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private playClip(url: string, volume = 1) {
    if (typeof Audio === 'undefined') return;
    try {
      let audio = this.clipElements.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.preload = 'auto';
        this.clipElements.set(url, audio);
      }
      audio.currentTime = 0;
      audio.volume = Math.max(0, Math.min(1, (this.preferences.effects / 100) * volume));
      void audio.play().catch(() => {});
    } catch { /* Audio playback is optional. */ }
  }

  stopClip(url: string) {
    const audio = this.clipElements.get(url);
    if (audio && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  play(effect: SoundEffect) {
    const context = this.context;
    if (!context || context.state !== 'running' || document.hidden || this.preferences.muted || this.preferences.effects === 0) return;
    const now = context.currentTime;
    if (now - (this.lastEffect.get(effect) ?? -Infinity) < 0.04) return;
    this.lastEffect.set(effect, now);

    if (effect === 'podium') {
      this.playClip('/audio/podium-suspense.mp3', 0.65);
      this.tone(36, now, 0.75, 0.12);
      [48, 55, 60, 67, 72].forEach((pitch, index) => this.tone(pitch, now + 0.1 + index * 0.11, 0.35, 0.07));
      return;
    }
    if (effect === 'drumroll') {
      this.playClip('/audio/drum-roll.mp3', 0.85);
      return;
    }
    if (effect === 'cheers') {
      this.playClip('/audio/crowd-cheers.mp3', 0.9);
      return;
    }
    if (effect === 'champion') {
      this.stopClip('/audio/podium-suspense.mp3');
      this.stopClip('/audio/drum-roll.mp3');
      this.playClip('/audio/crowd-cheers.mp3', 0.95);
      const fanfare = [72, 76, 79, 84, 79, 84, 88];
      fanfare.forEach((pitch, index) => this.tone(pitch, now + index * 0.15, 0.65, 0.085));
      return;
    }

    const notes: Record<Extract<SoundEffect, 'press' | 'tick' | 'submit' | 'reveal'>, number[]> = {
      press: [76, 84],
      tick: [79],
      submit: [72, 76, 79],
      reveal: [60, 67, 72],
    };
    notes[effect].forEach((pitch, index) => this.tone(pitch, now + index * 0.065, 0.2, 0.085));
  }

  visibility = () => {
    if (document.hidden) {
      for (const track of this.tracks.values()) {
        if (track.pauseTimer) clearTimeout(track.pauseTimer);
        track.audio.pause();
        if (this.context) track.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
      }
      for (const clip of this.clipElements.values()) clip.pause();
      for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } }
      void this.context?.suspend().catch(() => {});
    } else if (this.context) void this.unlock();
  };

  dispose() {
    if (this.podiumPauseTimer) clearTimeout(this.podiumPauseTimer);
    for (const track of this.tracks.values()) {
      if (track.pauseTimer) clearTimeout(track.pauseTimer);
      track.audio.pause();
      track.audio.removeAttribute('src');
      track.audio.load();
      track.source.disconnect();
      track.gain.disconnect();
    }
    this.tracks.clear();
    this.activeTrack = null;
    for (const clip of this.clipElements.values()) {
      clip.pause();
      clip.removeAttribute('src');
      clip.load();
    }
    this.clipElements.clear();
    for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } }
    void this.context?.close().catch(() => {});
    this.context = null;
    this.music = null;
    this.effects = null;
    this.lastEffect.clear();
  }
}

export const gameAudio = new GameAudio();
