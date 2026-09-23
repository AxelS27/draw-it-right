import { useEffect, useSyncExternalStore } from 'react';
import { gameAudio, type AudioScene, type InterfaceSound } from './audio';

export function useSoundPreferences() {
  return useSyncExternalStore(gameAudio.subscribe, gameAudio.getPreferences, gameAudio.getPreferences);
}

export function useAudioScene(scene: AudioScene | null, priority: number) {
  useEffect(() => scene ? gameAudio.register(scene, priority) : undefined, [scene, priority]);
}

export function useWebsiteAudio() {
  useEffect(() => {
    const control = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const element = target.closest('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"]');
      return element && !element.matches(':disabled, [aria-disabled="true"]') && !element.closest('[inert]') ? element : null;
    };
    const unlock = () => { void gameAudio.unlock(); };
    // Native click covers mouse, touch, Enter and Space without duplicate press sounds.
    const click = (event: MouseEvent) => {
      const element = control(event.target);
      if (!element) return;
      const explicit = element.getAttribute('data-sound');
      if (explicit === 'none') return;
      const sounds: InterfaceSound[] = ['press', 'close', 'open', 'switch-on', 'switch-off', 'select', 'increment', 'decrement'];
      const override = sounds.find(sound => sound === explicit);
      if (override) { gameAudio.play(override); return; }
      if (element instanceof HTMLInputElement && element.type === 'checkbox') {
        // Native checkbox activation updates checked before the click is dispatched.
        gameAudio.play(element.checked ? 'switch-on' : 'switch-off');
      } else if (element.matches('[role="switch"]')) {
        gameAudio.play(element.getAttribute('aria-checked') === 'true' ? 'switch-off' : 'switch-on');
      } else if (element.hasAttribute('aria-expanded')) {
        gameAudio.play(element.getAttribute('aria-expanded') === 'true' ? 'close' : 'open');
      } else if (element.matches('[aria-pressed], [role="tab"], [role="radio"], input[type="radio"]')) {
        gameAudio.play('select');
      } else {
        gameAudio.play('press');
      }
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('click', click, true);
    document.addEventListener('visibilitychange', gameAudio.visibility);
    window.addEventListener('storage', gameAudio.syncPreferences);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', gameAudio.visibility);
      window.removeEventListener('storage', gameAudio.syncPreferences);
      gameAudio.dispose();
    };
  }, []);
}
