// Things you can carry. The backpack holds BACKPACK_SLOTS of them, one per
// slot; an item is { id, uses? } (uses: hits left on a weapon).

export const BACKPACK_SLOTS = 4;

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ITEMS = {
  water: {
    name: 'ALMOND WATER',
    short: 'WATER',
    desc: 'A bottle of Almond Water. Drink it to steady your mind.',
    icon: svg('<path d="M10 2h4v3l2 3v13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8l2-3z"/><path d="M8 13h8"/>'),
  },
  battery: {
    name: 'BATTERIES',
    short: 'BATTERY',
    desc: 'Fresh batteries. Use them to recharge your flashlight.',
    icon: svg('<rect x="6" y="5" width="12" height="16" rx="1"/><path d="M10 3h4v2M12 9v6M9 12h6"/>'),
  },
  medkit: {
    name: 'FIRST AID KIT',
    short: 'FIRST AID',
    desc: 'Bandages and antiseptic. Use it to heal.',
    icon: svg('<rect x="3" y="7" width="18" height="13" rx="1"/><path d="M9 7V4h6v3M12 10v7M8.5 13.5h7"/>'),
  },
  meat: {
    name: 'MEAT',
    short: 'MEAT',
    desc: 'A cut of meat wrapped in a napkin. Something may want it more than you.',
    icon: svg('<path d="M15 4c4 1 5 6 2 9s-8 4-10 2-1-6 2-9 4-2.5 6-2z"/><circle cx="12" cy="10" r="2"/><path d="M6 17l-3 3"/>'),
  },
  milk: {
    name: 'ALMOND MILK',
    short: 'MILK',
    desc: 'A glass bottle of Almond Milk from a milk van. Creamy. Steadies your mind and mends you a little.',
    icon: svg('<path d="M9 2h6v3l1 2v14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7l1-2z"/><path d="M8 11h8v5H8z"/>'),
  },
  pipe: {
    name: 'LEAD PIPE',
    short: 'PIPE',
    desc: 'Heavy and short. Swing it at whatever is in front of you to stun it for a few seconds. It won\'t last forever.',
    icon: svg('<path d="M5 19L19 5"/><path d="M15 3l6 6M3 15l6 6"/>'),
    weapon: true,
    uses: 4,
  },
  flare: {
    name: 'ROAD FLARE',
    short: 'FLARE',
    desc: 'Strike it and everything close enough is stunned by the glare. One use.',
    icon: svg('<path d="M9 21l6-12"/><path d="M15 9l2-4 1 3 3-1-3 4"/>'),
    weapon: true,
  },
};

export function makeItem(id) {
  const def = ITEMS[id];
  return def.uses ? { id, uses: def.uses } : { id };
}
