// Forage definitions: wild items that appear on grass and are gathered with `g`.
export const FORAGE = [
  { id: 'berry',       name: 'Wild Berry',  seasons: ['spring', 'summer'],        sellBase: 15, minForaging: 0 },
  { id: 'herb',        name: 'Herb',        seasons: ['spring', 'summer', 'fall'], sellBase: 18, minForaging: 0 },
  { id: 'mushroom',    name: 'Mushroom',    seasons: ['summer', 'fall'],          sellBase: 22, minForaging: 0 },
  { id: 'winter_root', name: 'Winter Root', seasons: ['fall', 'winter'],          sellBase: 25, minForaging: 0 },
  { id: 'truffle',     name: 'Truffle',     seasons: ['spring', 'summer', 'fall', 'winter'], sellBase: 120, minForaging: 3 },
];
