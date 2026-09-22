import { ChevronLeft, ChevronRight, Minus } from 'lucide-react';
import { AvatarPartPreview } from './AvatarPreview';
import { colors, avatarOptions as options, type Avatar } from './profile';
const labels = { base: 'Character', color: 'Color', face: 'Face', accessory: 'Accessory' };
type Props = { avatar: Avatar; disabled: boolean; onChange: (avatar: Avatar) => void };

export function AvatarPicker({ avatar, disabled, onChange }: Props) {
  function cycle<K extends keyof Avatar>(key: K, direction: number) {
    const choices: readonly Avatar[K][] = options[key];
    const index = choices.indexOf(avatar[key]);
    onChange({ ...avatar, [key]: choices[(index + direction + choices.length) % choices.length] });
  }

  return <fieldset className="avatar-options" disabled={disabled}>
    <legend className="sr-only">Character options</legend>
    {(Object.keys(options) as (keyof Avatar)[]).map(key => <div className="avatar-picker" key={key} role="group" aria-label={labels[key]}>
      <div className="picker-heading"><span>{labels[key]}</span><span>{(options[key] as readonly string[]).indexOf(avatar[key]) + 1}/{options[key].length}</span></div>
      <div className="picker-controls">
        <button type="button" aria-label={`Previous ${labels[key].toLowerCase()}`} onClick={() => cycle(key, -1)}><ChevronLeft size={20}/></button>
        <div className="picker-choice" aria-live="polite" aria-atomic="true">
          <span className="picker-art" aria-hidden="true">
            {key === 'color' ? <span className="picker-swatch" style={{ backgroundColor: colors[avatar.color] }}/>
              : key === 'accessory' && avatar.accessory === 'none' ? <Minus size={28}/>
              : <AvatarPartPreview avatar={avatar} part={key}/>
            }
          </span>
          <span>{avatar[key]}</span>
        </div>
        <button type="button" aria-label={`Next ${labels[key].toLowerCase()}`} onClick={() => cycle(key, 1)}><ChevronRight size={20}/></button>
      </div>
    </div>)}
  </fieldset>;
}
