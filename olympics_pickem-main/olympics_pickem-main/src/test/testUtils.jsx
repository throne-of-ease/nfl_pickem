import { createContext, useContext } from 'react';

// Mock AppContext for testing hooks
const MockAppContext = createContext(null);

export function MockAppProvider({ children, value }) {
  const defaultValue = {
    games: [],
    leaderboard: [],
    players: [],
    tournamentProgress: null,
    loading: { games: false, leaderboard: false },
    error: { games: null, leaderboard: null },
    lastUpdated: null,
    fetchGames: () => {},
    fetchLeaderboard: () => {},
    refreshAll: () => {},
    ...value,
  };

  return (
    <MockAppContext.Provider value={defaultValue}>
      {children}
    </MockAppContext.Provider>
  );
}

export function useMockApp() {
  const context = useContext(MockAppContext);
  if (!context) {
    throw new Error('useMockApp must be used within a MockAppProvider');
  }
  return context;
}

// Export with the same name as the real context for easy mocking
export { MockAppContext as AppContext };
