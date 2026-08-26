export const TOURNAMENTS = {
  mens_ice_hockey: {
    label: "Men's Olympic Ice Hockey",
    espnBaseUrl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey',
    // Official dates Feb 11–22, 2026
    dateRange: '20260211-20260222',
  },
  womens_ice_hockey: {
    label: "Women's Olympic Ice Hockey",
    espnBaseUrl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-womens-ice-hockey',
    // Women start earlier; opening day Feb 5, 2026
    dateRange: '20260205-20260220',
  },
};

export function getTournamentConfig(key = 'mens_ice_hockey') {
  return TOURNAMENTS[key] || TOURNAMENTS.mens_ice_hockey;
}

export function getActiveTournamentKey() {
  const envSource = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env
    : (typeof process !== 'undefined' ? process.env : {});

  return envSource?.VITE_TOURNAMENT_KEY || 'mens_ice_hockey';
}
