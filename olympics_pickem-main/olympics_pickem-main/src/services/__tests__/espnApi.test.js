import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchSchedule,
  fetchGameSummary,
  fetchTeams,
  fetchStandings,
} from '../espnApi.js';
import { getActiveTournamentKey, getTournamentConfig } from '../../config/tournamentConfig.js';

describe('espnApi.js', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;
  const getBaseUrl = () => getTournamentConfig(getActiveTournamentKey()).espnBaseUrl;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
  });

  describe('fetchSchedule', () => {
    it('fetches and parses schedule data', async () => {
      const mockResponse = {
        events: [
          {
            id: '401845663',
            name: 'Canada vs USA',
            shortName: 'CAN vs USA',
            date: '2026-02-11T12:00:00Z',
            competitions: [
              {
                status: {
                  type: { id: '1', name: 'Scheduled', shortDetail: '2/11 - 12:00 PM' },
                },
                venue: { fullName: 'Olympic Arena' },
                competitors: [
                  {
                    homeAway: 'home',
                    score: '0',
                    team: {
                      id: '1',
                      displayName: 'USA',
                      abbreviation: 'USA',
                      logo: 'usa.png',
                      color: '002868',
                    },
                  },
                  {
                    homeAway: 'away',
                    score: '0',
                    team: {
                      id: '2',
                      displayName: 'Canada',
                      abbreviation: 'CAN',
                      logo: 'can.png',
                      color: 'FF0000',
                    },
                  },
                ],
              },
            ],
            season: { type: { name: 'Group A' } },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const games = await fetchSchedule('20260211-20260222');

      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        `${getBaseUrl()}/scoreboard?dates=20260211-20260222`
      );
      expect(global.fetch).toHaveBeenCalledWith('/data/game-overrides.json');
      expect(games).toHaveLength(1);
      expect(games[0]).toMatchObject({
        espnEventId: '401845663',
        name: 'Canada vs USA',
        status: { state: 'scheduled' },
        roundType: 'groupStage',
        teamA: { name: 'Canada', abbreviation: 'CAN' },
        teamB: { name: 'USA', abbreviation: 'USA' },
      });
    });

    it('preserves zero scores from the API', async () => {
      const mockResponse = {
        events: [
          {
            id: '401845700',
            name: 'Canada vs USA',
            date: '2026-02-11T12:00:00Z',
            competitions: [
              {
                status: {
                  type: { id: '2', name: 'In Progress' },
                },
                competitors: [
                  { homeAway: 'home', score: '0', team: { id: '1', displayName: 'USA' } },
                  { homeAway: 'away', score: '0', team: { id: '2', displayName: 'Canada' } },
                ],
              },
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const games = await fetchSchedule();

      expect(games[0].scores).toEqual({ teamA: 0, teamB: 0 });
    });

    it('handles final games with scores', async () => {
      const mockResponse = {
        events: [
          {
            id: '401845663',
            name: 'Canada vs USA',
            date: '2026-02-11T12:00:00Z',
            competitions: [
              {
                status: {
                  type: { id: '3', name: 'Final' },
                },
                competitors: [
                  { homeAway: 'home', score: '2', team: { id: '1', displayName: 'USA' } },
                  { homeAway: 'away', score: '4', team: { id: '2', displayName: 'Canada' } },
                ],
              },
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const games = await fetchSchedule();

      expect(games[0].status.state).toBe('final');
      expect(games[0].scores).toEqual({ teamA: 4, teamB: 2 });
    });

    it('parses in-progress games', async () => {
      const mockResponse = {
        events: [
          {
            id: '401845663',
            name: 'Canada vs USA',
            date: '2026-02-11T12:00:00Z',
            competitions: [
              {
                status: {
                  type: { id: '2', name: 'In Progress' },
                  period: 2,
                  displayClock: '15:30',
                },
                competitors: [
                  { homeAway: 'home', score: '1', team: { id: '1', displayName: 'USA' } },
                  { homeAway: 'away', score: '2', team: { id: '2', displayName: 'Canada' } },
                ],
              },
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const games = await fetchSchedule();

      expect(games[0].status).toMatchObject({
        state: 'in_progress',
        period: 2,
        clock: '15:30',
      });
    });

    it('determines medal round from event name', async () => {
      const mockResponse = {
        events: [
          {
            id: '1',
            name: 'Gold Medal Game',
            competitions: [{ status: { type: { id: '1' } }, competitors: [] }],
          },
          {
            id: '2',
            name: 'Bronze Medal Game',
            competitions: [{ status: { type: { id: '1' } }, competitors: [] }],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const games = await fetchSchedule();

      expect(games[0].roundType).toBe('medalRound');
      expect(games[1].roundType).toBe('medalRound');
    });

    it('determines knockout round from event name', async () => {
      const mockResponse = {
        events: [
          {
            id: '1',
            name: 'Semifinal 1',
            competitions: [{ status: { type: { id: '1' } }, competitors: [] }],
          },
          {
            id: '2',
            name: 'Quarterfinal 2',
            competitions: [{ status: { type: { id: '1' } }, competitors: [] }],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const games = await fetchSchedule();

      expect(games[0].roundType).toBe('knockoutRound');
      expect(games[1].roundType).toBe('knockoutRound');
    });

    it('throws error on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(fetchSchedule()).rejects.toThrow('ESPN API error: 500');
    });

    it('handles empty events array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });

      const games = await fetchSchedule();
      expect(games).toEqual([]);
    });

    it('handles missing events property', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const games = await fetchSchedule();
      expect(games).toEqual([]);
    });
  });

  describe('fetchGameSummary', () => {
    it('fetches and parses game summary', async () => {
      const mockResponse = {
        boxscore: {
          teams: [
            {
              team: { id: '1', displayName: 'Canada', abbreviation: 'CAN' },
              statistics: [{ name: 'shots', value: 30 }],
            },
            {
              team: { id: '2', displayName: 'USA', abbreviation: 'USA' },
              statistics: [{ name: 'shots', value: 25 }],
            },
          ],
        },
        scoringPlays: [
          { period: 1, time: '5:30', team: 'CAN' },
        ],
        header: { competition: {} },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const summary = await fetchGameSummary('401845663');

      expect(global.fetch).toHaveBeenCalledWith(
        `${getBaseUrl()}/summary?event=401845663`
      );
      expect(summary.espnEventId).toBe('401845663');
      expect(summary.teams).toHaveLength(2);
      expect(summary.scoring).toHaveLength(1);
    });

    it('throws error on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(fetchGameSummary('invalid')).rejects.toThrow('ESPN API error: 404');
    });
  });

  describe('fetchTeams', () => {
    it('fetches and parses teams', async () => {
      const mockResponse = {
        sports: [
          {
            leagues: [
              {
                teams: [
                  {
                    team: {
                      id: '1',
                      displayName: 'Canada',
                      abbreviation: 'CAN',
                      logos: [{ href: 'can.png' }],
                      color: 'FF0000',
                      alternateColor: 'FFFFFF',
                    },
                  },
                  {
                    team: {
                      id: '2',
                      displayName: 'USA',
                      abbreviation: 'USA',
                      logos: [{ href: 'usa.png' }],
                      color: '002868',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const teams = await fetchTeams();

      expect(global.fetch).toHaveBeenCalledWith(
        `${getBaseUrl()}/teams`
      );
      expect(teams).toHaveLength(2);
      expect(teams[0]).toMatchObject({
        espnId: '1',
        name: 'Canada',
        abbreviation: 'CAN',
        logo: 'can.png',
      });
    });

    it('throws error on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(fetchTeams()).rejects.toThrow('ESPN API error: 503');
    });

    it('handles empty response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const teams = await fetchTeams();
      expect(teams).toEqual([]);
    });
  });

  describe('fetchStandings', () => {
    it('fetches and parses standings', async () => {
      const mockResponse = {
        children: [
          {
            name: 'Group A',
            standings: {
              entries: [
                {
                  team: { id: '1', displayName: 'Canada', abbreviation: 'CAN' },
                  stats: [
                    { name: 'wins', value: 3 },
                    { name: 'losses', value: 0 },
                    { name: 'ties', value: 0 },
                    { name: 'points', value: 9 },
                    { name: 'gamesPlayed', value: 3 },
                    { name: 'pointsFor', value: 12 },
                    { name: 'pointsAgainst', value: 3 },
                    { name: 'differential', value: 9 },
                  ],
                },
              ],
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const standings = await fetchStandings();

      expect(global.fetch).toHaveBeenCalledWith(
        `${getBaseUrl()}/standings`
      );
      expect(standings).toHaveLength(1);
      expect(standings[0]).toMatchObject({
        group: 'Group A',
        team: { name: 'Canada', abbreviation: 'CAN' },
        stats: {
          wins: 3,
          losses: 0,
          ties: 0,
          points: 9,
          gamesPlayed: 3,
          goalsFor: 12,
          goalsAgainst: 3,
          goalDifferential: 9,
        },
      });
    });

    it('handles missing stats with defaults', async () => {
      const mockResponse = {
        children: [
          {
            name: 'Group A',
            standings: {
              entries: [
                {
                  team: { id: '1', displayName: 'Canada' },
                  stats: [],
                },
              ],
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const standings = await fetchStandings();

      expect(standings[0].stats).toEqual({
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        gamesPlayed: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifferential: 0,
      });
    });

    it('throws error on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(fetchStandings()).rejects.toThrow('ESPN API error: 500');
    });
  });
});
