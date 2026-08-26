import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadPlayers,
  loadPlayerPicks,
  loadAllPlayerPicks,
} from '../pickLoader.js';

describe('pickLoader.js', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy?.mockRestore();
  });

  describe('loadPlayers', () => {
    it('loads and returns players from JSON', async () => {
      const mockPlayers = {
        players: [
          { id: 'player1', name: 'Alice', display_order: 1 },
          { id: 'player2', name: 'Bob', display_order: 2 },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPlayers),
      });

      const players = await loadPlayers();

      expect(global.fetch).toHaveBeenCalledWith('/data/picks/players.json');
      expect(players).toHaveLength(2);
      expect(players[0]).toEqual({ id: 'player1', name: 'Alice', display_order: 1 });
    });

    it('returns empty array if players property is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const players = await loadPlayers();
      expect(players).toEqual([]);
    });

    it('throws error on failed fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(loadPlayers()).rejects.toThrow('Failed to load players manifest: 404');
    });
  });

  describe('loadPlayerPicks', () => {
    it('loads and parses player picks from CSV', async () => {
      const csvContent = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,4,USA,3
401845664,Finland,2,Sweden,2`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(csvContent),
      });

      const player = { id: 'player1', name: 'Alice' };
      const picks = await loadPlayerPicks(player);

      expect(global.fetch).toHaveBeenCalledWith('/data/picks/player1.csv');
      expect(picks).toHaveLength(2);
      expect(picks[0]).toMatchObject({
        playerId: 'player1',
        gameId: '401845663',
        teamA: 'Canada',
        teamAScore: 4,
        teamB: 'USA',
        teamBScore: 3,
        predictedResult: 'win_a',
      });
      expect(picks[1].predictedResult).toBe('tie');
    });

    it('sanitizes player id for filename', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('game_id,team_a,team_a_score,team_b,team_b_score'),
      });

      const player = { id: 'Player-One_123', name: 'Player One' };
      await loadPlayerPicks(player);

      expect(global.fetch).toHaveBeenCalledWith('/data/picks/playerone123.csv');
    });

    it('returns empty array when CSV file not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const player = { id: 'nonexistent', name: 'Nobody' };
      const picks = await loadPlayerPicks(player);

      expect(picks).toEqual([]);
    });

    it('handles alternative header names', async () => {
      const csvContent = `gameid,teama,teama_score,teamb,teamb_score
401845663,Canada,3,USA,2`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(csvContent),
      });

      const player = { id: 'player1', name: 'Alice' };
      const picks = await loadPlayerPicks(player);

      expect(picks[0].gameId).toBe('401845663');
      expect(picks[0].teamA).toBe('Canada');
    });

    it('handles invalid scores as 0', async () => {
      const csvContent = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,abc,USA,xyz`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(csvContent),
      });

      const player = { id: 'player1', name: 'Alice' };
      const picks = await loadPlayerPicks(player);

      expect(picks[0].teamAScore).toBe(0);
      expect(picks[0].teamBScore).toBe(0);
      expect(picks[0].predictedResult).toBe('tie');
    });

    it('determines correct predictedResult', async () => {
      const csvContent = `game_id,team_a,team_a_score,team_b,team_b_score
1,TeamA,3,TeamB,1
2,TeamA,1,TeamB,3
3,TeamA,2,TeamB,2`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(csvContent),
      });

      const picks = await loadPlayerPicks({ id: 'test', name: 'Test' });

      expect(picks[0].predictedResult).toBe('win_a');
      expect(picks[1].predictedResult).toBe('win_b');
      expect(picks[2].predictedResult).toBe('tie');
    });
  });

  describe('loadAllPlayerPicks', () => {
    it('loads all players with their picks', async () => {
      const mockPlayers = {
        players: [
          { id: 'player1', name: 'Alice' },
          { id: 'player2', name: 'Bob' },
        ],
      };

      const csvContent1 = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,4,USA,3`;

      const csvContent2 = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,2,USA,3`;

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPlayers),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(csvContent1),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(csvContent2),
        });

      const playersWithPicks = await loadAllPlayerPicks();

      expect(playersWithPicks).toHaveLength(2);
      expect(playersWithPicks[0].name).toBe('Alice');
      expect(playersWithPicks[0].picks).toHaveLength(1);
      expect(playersWithPicks[0].picks[0].predictedResult).toBe('win_a');
      expect(playersWithPicks[1].name).toBe('Bob');
      expect(playersWithPicks[1].picks).toHaveLength(1);
      expect(playersWithPicks[1].picks[0].predictedResult).toBe('win_b');
    });

    it('handles players with no picks file', async () => {
      const mockPlayers = {
        players: [
          { id: 'player1', name: 'Alice' },
        ],
      };

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPlayers),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const playersWithPicks = await loadAllPlayerPicks();

      expect(playersWithPicks).toHaveLength(1);
      expect(playersWithPicks[0].picks).toEqual([]);
    });

    it('handles empty players list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ players: [] }),
      });

      const playersWithPicks = await loadAllPlayerPicks();
      expect(playersWithPicks).toEqual([]);
    });
  });
});
