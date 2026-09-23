import { useState } from 'react';
import { Music2, Sparkles, Volume2 } from 'lucide-react';
import { gameAudio, type MusicTheme, type SoundPreferences } from './audio';
import { useSoundPreferences } from './useAudio';

export function SoundSettings() {
  const preferences = useSoundPreferences();
  const [error, setError] = useState(false);

  function change(key: Exclude<keyof SoundPreferences, 'muted' | 'theme'>, value: number) {
    setError(!gameAudio.updatePreferences({ [key]: value }));
  }

  function changeTheme(theme: MusicTheme) {
    setError(!gameAudio.updatePreferences({ theme }));
  }

  return <section className="settings-sound" aria-label="Sound preferences">
    <p className="settings-sound-notice">Music rises while drawing, softens during results, and builds suspense at the podium. Your sliders control the overall volume.</p>
    <button type="button" className="settings-secondary" aria-pressed={preferences.muted} onClick={() => setError(!gameAudio.updatePreferences({ muted: !preferences.muted }))}>{preferences.muted ? 'Unmute all audio' : 'Mute all audio'}</button>
    <div className="settings-sound-card">
      <div className="settings-sound-heading"><span className="settings-sound-icon"><Sparkles size={22} aria-hidden="true"/></span><div><label htmlFor="sound-theme">Music theme</label><p id="sound-theme-hint">Choose the piano playlist for the lobby and drawing rooms.</p></div></div>
      <div className="settings-theme-picker" role="radiogroup" aria-labelledby="sound-theme">
        {([
          { key: 'ragtime', label: 'Classic Ragtime', note: 'The Entertainer & Maple Leaf Rag' },
          { key: 'holiday', label: 'Holiday Piano', note: 'We Wish You a Merry Christmas' },
        ] as const).map(item => <button key={item.key} type="button" role="radio" aria-checked={preferences.theme === item.key} className={`settings-theme-option${preferences.theme === item.key ? ' is-active' : ''}`} onClick={() => changeTheme(item.key)}><strong>{item.label}</strong><small>{item.note}</small></button>)}
      </div>
    </div>
    {([
      { key: 'music', title: 'Backsound', description: 'Background music while you play.', Icon: Music2 },
      { key: 'effects', title: 'Sound effects', description: 'Button clicks, countdowns, drum rolls, crowd cheers and fanfare.', Icon: Volume2 },
    ] as const).map(({ key, title, description, Icon }) => <div className="settings-sound-card" key={key}>
      <div className="settings-sound-heading"><span className="settings-sound-icon"><Icon size={22} aria-hidden="true"/></span><div><label htmlFor={`sound-${key}`}>{title}</label><p id={`sound-${key}-hint`}>{description}</p></div></div>
      <div className="settings-volume"><input id={`sound-${key}`} type="range" min="0" max="100" step="1" value={preferences[key]} aria-describedby={`sound-${key}-hint`} aria-valuetext={preferences[key] === 0 ? 'Muted' : `${preferences[key]} percent`} onChange={event => change(key, Number(event.target.value))}/><output htmlFor={`sound-${key}`}>{preferences[key] === 0 ? 'Muted' : `${preferences[key]}%`}</output></div>
    </div>)}
    <p className={error ? 'settings-error' : 'settings-sound-note'} role="status">{error ? 'Couldn’t save on this device. Allow browser storage and adjust the volume again.' : preferences.muted ? 'All audio is muted. Unmute to hear your volume changes.' : 'Saved automatically on this device. Set a volume to 0 to mute it.'}</p>
  </section>;
}
