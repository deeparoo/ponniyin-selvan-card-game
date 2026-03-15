// Character definitions extracted from index.html
// No image data included - just game mechanics

const BASE_CHARS = {
  PERIYA: {
    id: 'PERIYA', name: 'Periya Pazhuvettarayar', shortName: 'P. Pazhuvettarayar',
    tamilName: 'பெரிய பழுவேட்டரையர்',
    title: 'Treasurer · Dhanaadhigaari', color: '#c08030', count: 3,
    action: { type: 'TAX', desc: 'Tax: collect 3 coins from the Treasury', cost: 0, needsTarget: false },
    counter: { blocks: ['GIFT'], selfOnly: false, desc: 'Blocks the Gift action' }
  },
  NANDINI: {
    id: 'NANDINI', name: 'Nandini', shortName: 'Nandini',
    tamilName: 'நந்தினி',
    title: 'Queen of Pazhuvur', color: '#c03050', count: 3,
    action: { type: 'STEAL', desc: 'Steal: take 2 coins from any player', cost: 0, needsTarget: true },
    counter: { blocks: ['STEAL'], selfOnly: true, desc: 'Blocks theft of your own coins' }
  },
  KUNDAVAI: {
    id: 'KUNDAVAI', name: 'Kundavai', shortName: 'Kundavai',
    tamilName: 'குந்தவை',
    title: 'Princess · Ilaya Piratti', color: '#8050c0', count: 2,
    action: { type: 'KUNDAVAI_COINS', desc: 'Treasury Gift: take 2 coins from the Treasury', cost: 0, needsTarget: false },
    counter: { blocks: ['STEAL'], selfOnly: true, desc: 'Blocks theft of your own coins' }
  },
  ARUL: {
    id: 'ARUL', name: 'Arulmozhivarman', shortName: 'Arulmozhivarman',
    tamilName: 'அருள்மொழிவர்மன்',
    title: 'Prince · Ponniyin Selvan', color: '#40a040', count: 3,
    action: { type: 'DRAW2', desc: 'Recruit: draw 2 cards, keep any 2, return the rest', cost: 0, needsTarget: false },
    counter: { blocks: ['KANDAMARAN_EXCHANGE'], selfOnly: true, desc: "Blocks Kandamaran's forced exchange" }
  },
  VANTHI: {
    id: 'VANTHI', name: 'Vanthiyathevan', shortName: 'Vanthiyathevan',
    tamilName: 'வந்தியத்தேவன்',
    title: 'Messenger · Thoothan', color: '#c0a020', count: 2,
    action: { type: 'GUESS', desc: 'Gamble: guess a card — correct: steal 3 coins; wrong: lose all coins', cost: 0, needsTarget: true },
    counter: { blocks: ['SPY'], selfOnly: true, desc: "Blocks Aazhwarkadiyan's spy" }
  },
  KANDA: {
    id: 'KANDA', name: 'Kandamaran', shortName: 'Kandamaran',
    tamilName: 'கந்தமாறன்',
    title: 'Traitor · Throgabaavi', color: '#909090', count: 1,
    action: { type: 'KANDAMARAN_EXCHANGE', desc: 'Betray: force a card swap with a player holding 2 cards', cost: 0, needsTarget: true },
    counter: null
  },
  RAVID: {
    id: 'RAVID', name: 'Ravidasan', shortName: 'Ravidasan',
    tamilName: 'ரவிதாசன்',
    title: 'Assassin · Abathuthavi', color: '#c01010', count: 3,
    action: { type: 'ASSASSINATE', desc: 'Assassinate: pay 4 coins — target loses a card', cost: 4, needsTarget: true },
    counter: null
  },
  AAZHWAR: {
    id: 'AAZHWAR', name: 'Aazhwarkadiyan', shortName: 'Aazhwarkadiyan',
    tamilName: 'ஆழ்வார்க்கடியான்',
    title: 'Spy · Saaranai', color: '#208080', count: 1,
    action: { type: 'SPY', desc: "Spy: look at one of target's cards and force a replacement", cost: 0, needsTarget: true },
    counter: { blocks: ['ASSASSINATE'], selfOnly: true, desc: "Blocks Ravidasan's assassination" }
  },
  POON: {
    id: 'POON', name: 'Poonkuzhali', shortName: 'Poonkuzhali',
    tamilName: 'பூங்குழலி',
    title: 'Saviour · Samudra Kumari', color: '#2070a0', count: 2,
    action: null,
    counter: { blocks: ['ASSASSINATE'], selfOnly: true, desc: "Blocks Ravidasan's assassination" }
  }
};

const EXPANSION_CHARS = {
  ADITHA: {
    id: 'ADITHA', name: 'Aditha Karikalan', shortName: 'Aditha Karikalan',
    tamilName: 'ஆதித்த கரிகாலன்',
    title: 'Crown Prince ★', color: '#a08020', count: 2,
    action: { type: 'DISCARD_REPLACE', desc: 'Decree: pay 2 coins — target discards a card and draws a replacement', cost: 2, needsTarget: true },
    counter: { blocks: ['GUESS'], selfOnly: true, desc: "Blocks Vanthiyathevan's gamble" }
  },
  MANI: {
    id: 'MANI', name: 'Manimegalai', shortName: 'Manimegalai',
    tamilName: 'மணிமேகலை',
    title: 'Martyr · Thiyagi ★', color: '#9030c0', count: 2,
    action: { type: 'GIVE_COINS', desc: 'Sacrifice: give any number of your coins to any player', cost: 0, needsTarget: true },
    counter: { blocks: ['TAX'], selfOnly: false, desc: "Blocks Periya Pazhuvettarayar's Tax" }
  }
};

function getAllChars(includeExpansion) {
  return includeExpansion ? { ...BASE_CHARS, ...EXPANSION_CHARS } : { ...BASE_CHARS };
}

module.exports = { BASE_CHARS, EXPANSION_CHARS, getAllChars };
