// Lifetime-stat milestones. Each fires once, the first time its stat crosses
// `threshold`, paying a one-time gold reward. Add an entry here to add a new
// achievement -- systems/stats.js checks this list generically.
export const ACHIEVEMENTS = [
  { id: 'harvest_50', stat: 'cropsHarvested', threshold: 50, reward: 100, name: 'Green Thumb', desc: 'Harvest 50 crops' },
  { id: 'harvest_250', stat: 'cropsHarvested', threshold: 250, reward: 500, name: 'Master Farmer', desc: 'Harvest 250 crops' },
  { id: 'gold_1000', stat: 'goldEarned', threshold: 1000, reward: 100, name: 'Small Fortune', desc: 'Earn 1,000g lifetime' },
  { id: 'gold_5000', stat: 'goldEarned', threshold: 5000, reward: 400, name: 'Big Fortune', desc: 'Earn 5,000g lifetime' },
  { id: 'forage_50', stat: 'forageGathered', threshold: 50, reward: 100, name: 'Forager', desc: 'Gather 50 forage items' },
  { id: 'days_28', stat: 'daysPlayed', threshold: 28, reward: 150, name: 'First Season', desc: 'Play 28 days' },
  { id: 'days_112', stat: 'daysPlayed', threshold: 112, reward: 500, name: 'First Year', desc: 'Play a full year (112 days)' },
  { id: 'quests_10', stat: 'questsCompleted', threshold: 10, reward: 300, name: 'Town Hero', desc: 'Complete every quest' },
];

export function achievementDef(id) {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
