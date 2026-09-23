import { useState } from 'react';
import { ArrowLeft, Check, Coins, Paintbrush, RotateCcw, ShoppingBag, Sparkles } from 'lucide-react';
import { AvatarPreview } from './AvatarPreview';
import { defaultAvatar, type Avatar, type Profile } from './profile';
import { navigate } from './navigation';
import './shop.css';

type Category = 'All' | 'Accessories' | 'Characters' | 'Colors';
type Item = { id: string; name: string; category: Exclude<Category, 'All'>; patch: Partial<Avatar>; price: number; color: string };
const categories: Category[] = ['All', 'Accessories', 'Characters', 'Colors'];
const items: Item[] = [
  { id: 'crown', name: 'Little royalty', category: 'Accessories', patch: { accessory: 'crown' }, price: 350, color: '#fff0c9' },
  { id: 'headphones', name: 'On my wavelength', category: 'Accessories', patch: { accessory: 'headphones' }, price: 250, color: '#e6e0f4' },
  { id: 'bow', name: 'Cherry on top', category: 'Accessories', patch: { accessory: 'bow' }, price: 150, color: '#f5dedf' },
  { id: 'shades', name: 'Too cool', category: 'Accessories', patch: { accessory: 'shades' }, price: 200, color: '#dceae7' },
  { id: 'cat', name: 'Doodle cat', category: 'Characters', patch: { base: 'cat' }, price: 400, color: '#f5e4cd' },
  { id: 'bunny', name: 'Happy hopper', category: 'Characters', patch: { base: 'bunny' }, price: 400, color: '#f0dfeb' },
  { id: 'robot', name: 'Little tin pal', category: 'Characters', patch: { base: 'robot' }, price: 450, color: '#dfeaf3' },
  { id: 'bear', name: 'Bear with me', category: 'Characters', patch: { base: 'bear' }, price: 400, color: '#e8eddb' },
  { id: 'mint', name: 'Fresh mint', category: 'Colors', patch: { color: 'mint' }, price: 0, color: '#dceee2' },
  { id: 'rose', name: 'Rose doodle', category: 'Colors', patch: { color: 'rose' }, price: 100, color: '#f4dfe5' },
  { id: 'lilac', name: 'Lilac daydream', category: 'Colors', patch: { color: 'lilac' }, price: 100, color: '#e9e1f5' },
  { id: 'gold', name: 'Golden hour', category: 'Colors', patch: { color: 'gold' }, price: 100, color: '#f7edcf' },
];
const isWearing = (avatar: Avatar, item: Item) => (Object.keys(item.patch) as (keyof Avatar)[]).every(key => avatar[key] === item.patch[key]);

export function Shop({ profile }: { profile: Profile | null }) {
  const initial = profile?.avatar ?? defaultAvatar;
  const [outfit, setOutfit] = useState<Avatar>(initial);
  const [category, setCategory] = useState<Category>('All');
  const [selected, setSelected] = useState<Item | null>(items[0]!);
  const [notice, setNotice] = useState('');
  const preview = { ...outfit, ...selected?.patch };
  const wearing = selected ? isWearing(outfit, selected) : false;
  const filtered = items.filter(item => category === 'All' || item.category === category);

  function changeCategory(next: Category) {
    setCategory(next);
    if (next !== 'All' && selected?.category !== next) setSelected(items.find(item => item.category === next)!);
    setNotice('');
  }

  return <main className="shop-page" aria-labelledby="shop-heading">
    <div className="shop-topline"><button className="shop-back" data-sound="close" onClick={() => navigate('/')}><ArrowLeft size={17}/>Back to lobby</button><span className="shop-preview-label">PREVIEW ONLY</span></div>
    <header className="shop-heading"><div><span className="shop-title-icon" aria-hidden="true"><ShoppingBag size={26}/></span><div><h1>The doodle shop</h1><p>A little extra you.</p></div></div><span className="shop-cosmetic-note"><Sparkles size={16}/>Just looks. Same drawing skills.</span></header>
    <div className="shop-layout">
      <section className="shop-catalog" aria-label="Cosmetic catalog">
        <div className="shop-filters" role="group" aria-label="Item category">{categories.map(value => <button key={value} aria-pressed={category === value} onClick={() => changeCategory(value)}>{value}</button>)}</div>
        <div className="shop-catalog-heading"><h2>{category === 'All' ? 'Find your next look' : category}</h2><span>{filtered.length} items</span><a className="shop-preview-jump" href="#shop-preview-heading">View preview</a></div>
        <div className="shop-item-grid">{filtered.map(item => <button key={item.id} className={`shop-item${selected?.id === item.id ? ' is-selected' : ''}`} aria-pressed={selected?.id === item.id} aria-label={`${item.name}, ${item.price ? `${item.price} sample coins` : 'included'}${isWearing(outfit, item) ? ', worn in preview' : ''}`} onClick={() => { setSelected(item); setNotice(''); }}>
          <span className="shop-item-art" style={{ backgroundColor: item.color }}><AvatarPreview avatar={{ ...outfit, ...item.patch }}/>{isWearing(outfit, item) && <span className="shop-worn"><Check size={12}/>On</span>}</span>
          <span className="shop-item-name">{item.name}</span><span className="shop-item-bottom"><span>{item.category}</span><strong>{item.price ? <><Coins size={13}/>{item.price}</> : 'Included'}</strong></span>
        </button>)}</div>
        <p className="shop-catalog-note">Prices are examples. Purchases and inventory aren’t available yet.</p>
      </section>
      <aside className="shop-fitting-room" aria-labelledby="shop-preview-heading">
        <div className="shop-fitting-heading"><h2 id="shop-preview-heading" tabIndex={-1}>Try it on</h2><span><Paintbrush size={15}/>Your canvas, your look</span></div>
        <div className="shop-avatar-stage" style={{ backgroundColor: selected?.color ?? '#dceee2' }}><span className="shop-stage-spark shop-stage-spark-one" aria-hidden="true">✦</span><AvatarPreview avatar={preview}/><span className="shop-stage-spark shop-stage-spark-two" aria-hidden="true">✦</span><span className="shop-stage-label">AVATAR PREVIEW</span></div>
        <div className="shop-item-details"><span>{selected?.category ?? 'Your avatar'}</span><h3>{selected?.name ?? 'Your original look'}</h3><p>{selected ? selected.price ? <><Coins size={17}/><strong>{selected.price}</strong><span>sample price</span></> : 'Included color' : 'Pick an item to try it on.'}</p></div>
        <button className="shop-try-button" data-sound="select" disabled={!selected || wearing} onClick={() => { if (!selected) return; setOutfit(preview); setNotice(`${selected.name} added to your preview.`); }}>{wearing ? <><Check size={18}/>Wearing in preview</> : <><Sparkles size={18}/>Use in preview</>}</button>
        <button className="shop-reset" data-sound="close" onClick={() => { setOutfit(initial); setSelected(null); setCategory('All'); setNotice('Preview reset. Your saved avatar is unchanged.'); }}><RotateCcw size={15}/>Reset preview</button>
        <p className="shop-local-note">Try combinations freely. Nothing is purchased or saved to your profile.</p>
        <p className="shop-status" role="status">{notice}</p>
      </aside>
    </div>
  </main>;
}
