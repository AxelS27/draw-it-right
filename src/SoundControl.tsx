import { Volume2, VolumeX } from 'lucide-react';
import { gameAudio } from './audio';
import { useSoundPreferences } from './useAudio';

export function SoundControl() {
  const { muted } = useSoundPreferences();
  return <button type="button" className="sound-toggle" aria-label={muted ? 'Unmute all audio' : 'Mute all audio'} aria-pressed={muted} title={muted ? 'Unmute audio' : 'Mute audio'} onClick={() => gameAudio.updatePreferences({ muted: !muted })}>{muted ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button>;
}
