import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Coins, Paintbrush, ShoppingBag, Sparkles } from 'lucide-react';
import { setDoc } from 'firebase/firestore';
import { AvatarPreview } from './AvatarPreview';
import { defaultAvatar, profileRef, type Avatar, type Profile } from './profile';
import { matchRequest, type Wallet } from './match-api';
import { navigate } from './navigation';
import { gameAudio } from './audio';
import './shop.css';

type Category = 'All' | 'Accessories' | 'Characters' | 'Faces' | 'Colors';
type Item = { id: string; name: string; category: Exclude<Category, 'All'>; patch: Partial<Avatar>; price: number; color: string };
const categories: Category[] = ['All', 'Accessories', 'Characters', 'Faces', 'Colors'];
const items: Item[] = [
  { id: 'santa', name: 'Santa hat', category: 'Accessories', patch: { accessory: 'santa' }, price: 100, color: '#fbe0e0' },
  { id: 'antlers', name: 'Reindeer antlers', category: 'Accessories', patch: { accessory: 'antlers' }, price: 0, color: '#f3e5d8' },
  { id: 'beard', name: 'Santa beard', category: 'Accessories', patch: { accessory: 'beard' }, price: 0, color: '#e6f2ee' },
  { id: 'elf', name: 'Elf hat', category: 'Accessories', patch: { accessory: 'elf' }, price: 0, color: '#ddf2e4' },
  { id: 'scarf', name: 'Holiday scarf', category: 'Accessories', patch: { accessory: 'scarf' }, price: 0, color: '#fce8df' },
  { id: 'crown', name: 'Little royalty', category: 'Accessories', patch: { accessory: 'crown' }, price: 350, color: '#fff0c9' },
  { id: 'halo', name: 'Doodle angel', category: 'Accessories', patch: { accessory: 'halo' }, price: 300, color: '#fff7d6' },
  { id: 'beanie', name: 'Cozy beanie', category: 'Accessories', patch: { accessory: 'beanie' }, price: 250, color: '#f7e1d7' },
  { id: 'headphones', name: 'On my wavelength', category: 'Accessories', patch: { accessory: 'headphones' }, price: 250, color: '#e6e0f4' },
  { id: 'party', name: 'Party time', category: 'Accessories', patch: { accessory: 'party' }, price: 220, color: '#dff4f1' },
  { id: 'shades', name: 'Too cool', category: 'Accessories', patch: { accessory: 'shades' }, price: 200, color: '#dceae7' },
  { id: 'glasses', name: 'Smart sketcher', category: 'Accessories', patch: { accessory: 'glasses' }, price: 150, color: '#e7eef5' },
  { id: 'bow', name: 'Cherry on top', category: 'Accessories', patch: { accessory: 'bow' }, price: 150, color: '#f5dedf' },
  { id: 'robot', name: 'Little tin pal', category: 'Characters', patch: { base: 'robot' }, price: 450, color: '#dfeaf3' },
  { id: 'cat', name: 'Doodle cat', category: 'Characters', patch: { base: 'cat' }, price: 400, color: '#f5e4cd' },
  { id: 'bunny', name: 'Happy hopper', category: 'Characters', patch: { base: 'bunny' }, price: 400, color: '#f0dfeb' },
  { id: 'bear', name: 'Bear with me', category: 'Characters', patch: { base: 'bear' }, price: 400, color: '#e8eddb' },
  { id: 'blob', name: 'Wavy blob', category: 'Characters', patch: { base: 'blob' }, price: 350, color: '#e4f0ec' },
  { id: 'cheeky', name: 'Cheeky grin', category: 'Faces', patch: { face: 'cheeky' }, price: 120, color: '#f9e3e8' },
  { id: 'happy', name: 'Big smile', category: 'Faces', patch: { face: 'happy' }, price: 100, color: '#fff2d6' },
  { id: 'sleepy', name: 'Sleepyhead', category: 'Faces', patch: { face: 'sleepy' }, price: 90, color: '#e6e4f2' },
  { id: 'wink', name: 'Quick wink', category: 'Faces', patch: { face: 'wink' }, price: 80, color: '#e4f2e8' },
  { id: 'surprised', name: 'Whoa!', category: 'Faces', patch: { face: 'surprised' }, price: 80, color: '#f2ece1' },
  { id: 'mint', name: 'Fresh mint', category: 'Colors', patch: { color: 'mint' }, price: 0, color: '#dceee2' },
  { id: 'rose', name: 'Rose doodle', category: 'Colors', patch: { color: 'rose' }, price: 100, color: '#f4dfe5' },
  { id: 'lilac', name: 'Lilac daydream', category: 'Colors', patch: { color: 'lilac' }, price: 100, color: '#e9e1f5' },
  { id: 'gold', name: 'Golden hour', category: 'Colors', patch: { color: 'gold' }, price: 100, color: '#f7edcf' },
  { id: 'blue', name: 'Ocean blue', category: 'Colors', patch: { color: 'blue' }, price: 100, color: '#ddebf7' },
  { id: 'peach', name: 'Peach sunset', category: 'Colors', patch: { color: 'peach' }, price: 100, color: '#fae5d8' },
  { id: 'cream', name: 'Cream puff', category: 'Colors', patch: { color: 'cream' }, price: 100, color: '#f7f0dc' },
  { id: 'teal', name: 'Teal splash', category: 'Colors', patch: { color: 'teal' }, price: 100, color: '#d7efee' },
  { id: 'coral', name: 'Coral pop', category: 'Colors', patch: { color: 'coral' }, price: 120, color: '#fadcd9' },
  { id: 'sky', name: 'Sky breeze', category: 'Colors', patch: { color: 'sky' }, price: 120, color: '#dceeff' },
  { id: 'rainbow', name: 'Rainbow glow', category: 'Colors', patch: { color: 'rainbow' }, price: 500, color: '#f4e6ff' },
];
const isWearing = (avatar: Avatar, item: Item) => (Object.keys(item.patch) as (keyof Avatar)[]).every(key => avatar[key] === item.patch[key]);

type ShopProps = {
  uid?: string;
  profile: Profile | null;
  wallet: Wallet | null;
  onLogin: () => void;
  onEquip: (avatar: Avatar) => void;
};

export function Shop({ uid, profile, wallet, onLogin, onEquip }: ShopProps) {
  const initial = profile?.avatar ?? defaultAvatar;
  const [outfit, setOutfit] = useState<Avatar>(initial);
  const [category, setCategory] = useState<Category>('All');
  const [selected, setSelected] = useState<Item | null>(items[0]!);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (profile?.avatar) setOutfit(profile.avatar);
  }, [profile?.avatar]);

  const preview = { ...outfit, ...selected?.patch };
  const ownedSet = new Set(wallet?.owned ?? []);
  const isOwned = (item: Item) => item.price === 0 || ownedSet.has(item.id);
  const selectedOwned = selected ? isOwned(selected) : false;
  const wearingSaved = selected && profile ? isWearing(profile.avatar, selected) : false;
  const balance = wallet?.balance ?? 0;
  const canAfford = selected ? balance >= selected.price : false;
  const filtered = items.filter(item => category === 'All' || item.category === category).sort((a, b) => a.price - b.price);

  function changeCategory(next: Category) {
    setCategory(next);
    if (next !== 'All' && selected?.category !== next) setSelected(items.find(item => item.category === next)!);
    setNotice('');
  }

  async function buyOrEquip() {
    if (!selected || busy) return;
    if (!uid || !profile) { onLogin(); return; }
    setBusy(true);
    setNotice('');
    try {
      if (!selectedOwned) {
        if (!canAfford) {
          setNotice(`Need ${selected.price - balance} more coins.`);
          return;
        }
        await matchRequest<Wallet>('/wallet/buy', { item: selected.id });
        window.dispatchEvent(new Event('wallet-updated'));
        gameAudio.play('submit');
        setNotice(`Bought ${selected.name}! Click Equip to wear it.`);
        return;
      }
      const nextAvatar: Avatar = { ...profile.avatar, ...selected.patch };
      await setDoc(profileRef(uid), { username: profile.username, avatar: nextAvatar });
      setOutfit(nextAvatar);
      onEquip(nextAvatar);
      gameAudio.play('select');
      setNotice(`${selected.name} equipped!`);
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : 'Purchase failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shop-page" aria-labelledby="shop-heading">
    <div className="shop-topline"><button className="shop-back" data-sound="close" onClick={() => navigate('/')}><ArrowLeft size={17}/>Back to lobby</button>{!uid && <span className="shop-preview-label">LOG IN TO BUY</span>}</div>
    <header className="shop-heading"><div><span className="shop-title-icon" aria-hidden="true"><ShoppingBag size={26}/></span><div><h1>The doodle shop</h1><p>A little extra you.</p></div></div><span className="shop-cosmetic-note"><Sparkles size={16}/>Just looks. Same drawing skills.</span></header>
    <div className="shop-layout">
      <section className="shop-catalog" aria-label="Cosmetic catalog">
        <div className="shop-filters" role="group" aria-label="Item category">{categories.map(value => <button key={value} aria-pressed={category === value} onClick={() => changeCategory(value)}>{value}</button>)}</div>
        <div className="shop-catalog-heading"><h2>{category === 'All' ? 'Find your next look' : category}</h2><span>{filtered.length} items</span><a className="shop-preview-jump" href="#shop-preview-heading">View preview</a></div>
        <div className="shop-item-grid">{filtered.map(item => {
          const owned = isOwned(item);
          const equipped = profile ? isWearing(profile.avatar, item) : false;
          return <button key={item.id} className={`shop-item${selected?.id === item.id ? ' is-selected' : ''}`} aria-pressed={selected?.id === item.id} aria-label={`${item.name}, ${item.price ? `${item.price} coins` : 'included'}${equipped ? ', equipped' : owned ? ', owned' : ''}`} onClick={() => { setSelected(item); setNotice(''); }}>
            <span className="shop-item-art" style={{ backgroundColor: item.color }}><AvatarPreview avatar={{ ...outfit, ...item.patch }}/>{(equipped || owned) && <span className="shop-worn"><Check size={12}/>{equipped ? 'On' : 'Owned'}</span>}</span>
            <span className="shop-item-name">{item.name}</span><span className="shop-item-bottom"><span>{item.category}</span><strong>{owned ? (item.price ? 'Owned' : item.category === 'Colors' ? 'Included' : 'Free') : <><Coins size={13}/>{item.price}</>}</strong></span>
          </button>;
        })}</div>
        <p className="shop-catalog-note">Play live matches to earn coins and unlock new looks.</p>
      </section>
      <aside className="shop-fitting-room" aria-labelledby="shop-preview-heading">
        <div className="shop-fitting-heading"><h2 id="shop-preview-heading" tabIndex={-1}>Try it on</h2><span><Paintbrush size={15}/>Your canvas, your look</span></div>
        <div className="shop-avatar-stage" style={{ backgroundColor: selected?.color ?? '#dceee2' }}><span className="shop-stage-spark shop-stage-spark-one" aria-hidden="true">✦</span><AvatarPreview avatar={preview}/><span className="shop-stage-spark shop-stage-spark-two" aria-hidden="true">✦</span><span className="shop-stage-label">AVATAR PREVIEW</span></div>
        <div className="shop-item-details"><span>{selected?.category ?? 'Your avatar'}</span><h3>{selected?.name ?? 'Your original look'}</h3><p>{selected ? selectedOwned ? (selected.price ? 'Owned item' : selected.category === 'Colors' ? 'Included color' : 'Free holiday item') : <><Coins size={17}/><strong>{selected.price}</strong><span>coins</span></> : 'Pick an item to try it on.'}</p></div>
        <button className={`shop-try-button${Boolean(uid && profile) && selected && !selectedOwned && !canAfford ? ' is-unaffordable' : ''}`} data-sound="select" disabled={!selected || busy || (Boolean(uid && profile) && (wearingSaved || (!selectedOwned && !canAfford)))} onClick={() => void buyOrEquip()}>
          {!uid || !profile ? 'Log in to buy'
            : busy ? 'Saving…'
            : wearingSaved ? <><Check size={18}/>Equipped</>
            : selectedOwned ? <><Sparkles size={18}/>Equip</>
            : canAfford ? <><Coins size={18}/>Buy ({selected?.price})</>
            : <><Coins size={18}/>Need {(selected?.price ?? 0) - balance} more coins</>}
        </button>
        <p className="shop-local-note">Equipped items are saved directly to your player profile.</p>
        <p className="shop-status" role="status">{notice}</p>
      </aside>
    </div>
  </main>;
}
