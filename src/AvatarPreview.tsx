import { colors, type Avatar } from './profile';

function Body({ base, fill }: { base: Avatar['base']; fill: string }) {
  return <g fill={fill} stroke="#315763" strokeWidth="4" strokeLinejoin="round">
    {base === 'cat' && <path d="M38 64 32 23 68 44M92 44l36-21-6 41"/>}
    {base === 'bear' && <><circle cx="42" cy="46" r="20"/><circle cx="118" cy="46" r="20"/></>}
    {base === 'bunny' && <><rect x="43" y="6" width="23" height="58" rx="12" transform="rotate(-9 55 35)"/><rect x="94" y="6" width="23" height="58" rx="12" transform="rotate(9 105 35)"/></>}
    {base === 'robot' && <><path d="M80 40V22"/><circle cx="80" cy="17" r="6"/><rect x="20" y="70" width="14" height="30" rx="5"/><rect x="126" y="70" width="14" height="30" rx="5"/></>}
    {base === 'blob' ? <path d="M31 80Q22 49 49 43Q67 18 89 40Q125 31 128 65Q153 88 130 107Q137 143 104 137Q82 151 62 137Q27 146 29 117Q9 97 31 80Z"/> : <rect x="31" y="39" width="98" height="99" rx={base === 'bean' ? 44 : base === 'robot' ? 15 : 35}/>}
  </g>;
}

function Face({ face }: { face: Avatar['face'] }) {
  return <g fill="none" stroke="#315763" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    {face === 'happy' ? <path d="m51 82 7-7 7 7m30 0 7-7 7 7"/>
      : face === 'sleepy' ? <path d="M51 80q7 8 14 0m30 0q7 8 14 0"/>
      : <><path d="M58 76v7"/>{face === 'wink' || face === 'cheeky' ? <path d="m96 81 6-5 6 5"/> : <path d="M102 76v7"/>}</>}
    {face === 'surprised' ? <ellipse cx="80" cy="102" rx="7" ry="9"/>
      : face === 'sleepy' ? <path d="M74 103h12"/>
      : face === 'happy' ? <path d="M65 97h30q-2 22-15 22T65 97Z" fill="#315763"/>
      : face === 'cheeky' ? <><path d="M66 97q14 12 28 0"/><path d="M80 103v8q10 9 13-3v-9" fill="#ec9bab"/></>
      : <path d="M67 98q13 14 26 0"/>}
  </g>;
}

function Accessory({ accessory }: { accessory: Avatar['accessory'] }) {
  return <g fill="none" stroke="#315763" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    {accessory === 'glasses' && <><rect x="43" y="67" width="29" height="25" rx="9"/><rect x="88" y="67" width="29" height="25" rx="9"/><path d="M72 76h16"/></>}
    {accessory === 'shades' && <><path d="M41 69h32v11q0 14-16 14T41 80Zm46 0h32v11q0 14-16 14T87 80Z" fill="#315763"/><path d="M73 75h14"/><path d="m49 76 9 9m36-9 9 9" stroke="#b4d9dc" strokeWidth="3"/></>}
    {accessory === 'crown' && <><path d="m53 43-6-27 20 13L80 9l13 20 20-13-6 27Z" fill="#ffd479"/><path d="M54 44h52"/><circle cx="80" cy="32" r="4" fill="#e6a0b1" stroke="none"/></>}
    {accessory === 'bow' && <><path d="M98 39 77 23q-8 17 0 31Zm7 0 22-16q8 17 0 31Z" fill="#eab5bf"/><circle cx="102" cy="39" r="7" fill="#f6d6da"/></>}
    {accessory === 'headphones' && <><path d="M27 88V70a53 53 0 0 1 106 0v18" strokeWidth="8"/><rect x="21" y="71" width="17" height="31" rx="8" fill="#c5b3e6"/><rect x="122" y="71" width="17" height="31" rx="8" fill="#c5b3e6"/></>}
  </g>;
}

const accessoryBounds: Record<Avatar['accessory'], string> = {
  none: '0 0 160 160', glasses: '35 43 90 72', shades: '34 44 92 74',
  crown: '37 0 86 60', bow: '66 13 73 53', headphones: '10 6 140 110',
};

export function AvatarPartPreview({ avatar, part }: { avatar: Avatar; part: 'base' | 'face' | 'accessory' }) {
  return <svg className="avatar-part" viewBox={part === 'base' ? '0 0 160 160' : part === 'face' ? '40 58 80 68' : accessoryBounds[avatar.accessory]} aria-hidden="true">
    {part === 'base' && <Body base={avatar.base} fill="#e5e9e7"/>}
    {part === 'face' && <Face face={avatar.face}/>}
    {part === 'accessory' && <Accessory accessory={avatar.accessory}/>}
  </svg>;
}

export function AvatarPreview({ avatar }: { avatar: Avatar }) {
  return <svg viewBox="0 0 160 160" role="img" aria-label={`${avatar.color} ${avatar.base}, ${avatar.face}${avatar.accessory !== 'none' ? `, with ${avatar.accessory}` : ''}`}>
    <ellipse cx="80" cy="143" rx="47" ry="7" fill="#284f5915"/>
    <Body base={avatar.base} fill={colors[avatar.color]}/>
    <Face face={avatar.face}/>
    <g fill="#e9899260"><ellipse cx="48" cy="96" rx="9" ry="5"/><ellipse cx="112" cy="96" rx="9" ry="5"/></g>
    <Accessory accessory={avatar.accessory}/>
  </svg>;
}
