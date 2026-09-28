// Items: sold by vending machines for gold that battles drop, used with ITEM in battle (uses your
// turn). Fixed kit content; 6 inventory slots.
export interface ItemDef {
  id: string;
  name: string;   // <= 12 chars
  price: number;
  desc: string;   // one short line for the shop
  kind: 'heal' | 'shield' | 'slow' | 'tp';
  n?: number;
}

export const ITEMS: ItemDef[] = [
  { id: 'coldbrew', name: 'Cold Brew', price: 12, desc: 'Heals 12 HP.', kind: 'heal', n: 12 },
  { id: 'donut', name: 'Big Donut', price: 22, desc: 'Heals 25 HP.', kind: 'heal', n: 25 },
  { id: 'hoodie', name: 'Hog Hoodie', price: 16, desc: 'Next attack does half damage.', kind: 'shield' },
  { id: 'lofi', name: 'Lo-fi Beats', price: 14, desc: 'Next attack is slower.', kind: 'slow' },
];

export const MAX_ITEMS = 6;
export const item = (id: string) => ITEMS.find((i) => i.id === id);

/** What using it says in battle. */
export function itemLine(it: ItemDef, healed: number): string {
  if (it.kind === 'heal') return `You have the ${it.name}. +${healed} HP.`;
  if (it.kind === 'shield') return `You put on the ${it.name}. So cosy. The next attack does half damage.`;
  if (it.kind === 'slow') return `You play ${it.name}. Everything calms down. The next attack is slower.`;
  return `You use the ${it.name}.`;
}
