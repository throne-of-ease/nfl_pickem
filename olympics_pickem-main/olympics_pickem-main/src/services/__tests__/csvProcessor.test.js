import { describe, it, expect } from 'vitest';
import {
  parsePlayerPicksCSV,
  validatePicks,
  transformPicksToDatabase,
  generatePicksTemplate,
} from '../csvProcessor.js';

describe('csvProcessor.js', () => {
  describe('parsePlayerPicksCSV', () => {
    it('parses valid CSV with standard headers', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,4,USA,3
401845664,Finland,2,Sweden,2`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.picks).toHaveLength(2);
      expect(result.picks[0]).toEqual({
        gameId: '401845663',
        teamA: 'Canada',
        teamAScore: 4,
        teamB: 'USA',
        teamBScore: 3,
        confidence: 0.5,
        predictedResult: 'win_a',
      });
      expect(result.picks[1].predictedResult).toBe('tie');
    });

    it('handles alternative header names', () => {
      const csv = `gameid,teama,teama_score,teamb,teamb_score
401845663,Canada,3,USA,2`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.picks[0].gameId).toBe('401845663');
      expect(result.picks[0].teamA).toBe('Canada');
    });

    it('handles away_team/home_team headers', () => {
      const csv = `event_id,away_team,away_score,home_team,home_score
401845663,Canada,1,USA,4`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.picks[0].teamA).toBe('Canada');
      expect(result.picks[0].teamB).toBe('USA');
      expect(result.picks[0].predictedResult).toBe('win_b');
    });

    it('trims whitespace from values', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
  401845663  ,  Canada  ,  3  ,  USA  ,  2  `;

      const result = parsePlayerPicksCSV(csv);

      expect(result.picks[0].gameId).toBe('401845663');
      expect(result.picks[0].teamA).toBe('Canada');
      expect(result.picks[0].teamAScore).toBe(3);
    });

    it('returns error for missing game_id', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
,Canada,3,USA,2`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Missing game_id');
      expect(result.errors[0].type).toBe('missing_field');
    });

    it('returns error for missing team names', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,,3,USA,2`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Missing team name(s)');
    });

    it('returns error for invalid score values', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,abc,USA,2`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Invalid score value(s)');
      expect(result.errors[0].type).toBe('invalid_score');
    });

    it('returns error for negative scores', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,-1,USA,2`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Scores cannot be negative');
    });

    it('skips empty lines', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,3,USA,2

401845664,Finland,1,Sweden,0`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.picks).toHaveLength(2);
    });

    it('parses multiple valid and invalid rows', () => {
      const csv = `game_id,team_a,team_a_score,team_b,team_b_score
401845663,Canada,3,USA,2
,Finland,1,Sweden,0
401845665,Germany,abc,France,2`;

      const result = parsePlayerPicksCSV(csv);

      expect(result.picks).toHaveLength(1);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('validatePicks', () => {
    const mockGames = [
      { espnEventId: '401845663', name: 'Canada vs USA', roundType: 'groupStage' },
      { espnEventId: '401845664', name: 'Finland vs Sweden', roundType: 'groupStage' },
    ];

    const mockTeams = [
      { name: 'Canada', abbreviation: 'CAN' },
      { name: 'USA', abbreviation: 'USA' },
      { name: 'Finland', abbreviation: 'FIN' },
      { name: 'Sweden', abbreviation: 'SWE' },
    ];

    it('validates correct picks', () => {
      const picks = [
        { gameId: '401845663', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2 },
        { gameId: '401845664', teamA: 'Finland', teamAScore: 1, teamB: 'Sweden', teamBScore: 1 },
      ];

      const result = validatePicks(picks, mockGames, mockTeams);

      expect(result.validPicks).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.coverage).toBe('100.0');
    });

    it('reports error for unknown game ID', () => {
      const picks = [
        { gameId: '999999999', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2 },
      ];

      const result = validatePicks(picks, mockGames, mockTeams);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('unknown_game');
      expect(result.validPicks).toHaveLength(0);
    });

    it('reports warning for team name mismatch', () => {
      const picks = [
        { gameId: '401845663', teamA: 'Kanada', teamAScore: 3, teamB: 'USA', teamBScore: 2 },
      ];

      const result = validatePicks(picks, mockGames, mockTeams);

      expect(result.warnings.some(w => w.type === 'team_mismatch')).toBe(true);
      expect(result.validPicks).toHaveLength(1); // Still valid, just warning
    });

    it('accepts team abbreviations', () => {
      const picks = [
        { gameId: '401845663', teamA: 'CAN', teamAScore: 3, teamB: 'USA', teamBScore: 2 },
      ];

      const result = validatePicks(picks, mockGames, mockTeams);

      expect(result.warnings.filter(w => w.type === 'team_mismatch')).toHaveLength(0);
    });

    it('handles duplicate picks', () => {
      const picks = [
        { gameId: '401845663', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2 },
        { gameId: '401845663', teamA: 'Canada', teamAScore: 5, teamB: 'USA', teamBScore: 1 },
      ];

      const result = validatePicks(picks, mockGames, mockTeams);

      expect(result.validPicks).toHaveLength(1);
      expect(result.validPicks[0].teamAScore).toBe(5); // Latest pick wins
      expect(result.warnings.some(w => w.type === 'duplicate_pick')).toBe(true);
    });

    it('warns about missing picks', () => {
      const picks = [
        { gameId: '401845663', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2 },
      ];

      const result = validatePicks(picks, mockGames, mockTeams);

      expect(result.warnings.some(w => w.type === 'missing_pick')).toBe(true);
      expect(result.summary.coverage).toBe('50.0');
    });

    it('handles empty picks array', () => {
      const result = validatePicks([], mockGames, mockTeams);

      expect(result.validPicks).toHaveLength(0);
      expect(result.warnings.filter(w => w.type === 'missing_pick')).toHaveLength(2);
    });

    it('handles empty games array', () => {
      const picks = [
        { gameId: '401845663', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2 },
      ];

      const result = validatePicks(picks, [], mockTeams);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('unknown_game');
    });
  });

  describe('transformPicksToDatabase', () => {
    const mockGames = [
      { espnEventId: '401845663', name: 'Canada vs USA', roundType: 'groupStage' },
      { espnEventId: '401845664', name: 'Gold Medal Game', roundType: 'medalRound' },
    ];

    it('transforms picks to database format', () => {
      const picks = [
        { gameId: '401845663', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2, predictedResult: 'win_a' },
      ];

      const result = transformPicksToDatabase(picks, 'player123', mockGames);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        player_id: 'player123',
        game_espn_id: '401845663',
        predicted_team_a_score: 3,
        predicted_team_b_score: 2,
        predicted_result: 'win_a',
        confidence: 0.5,
        submitted_team_a_name: 'Canada',
        submitted_team_b_name: 'USA',
        game_round_type: 'groupStage',
      });
    });

    it('assigns correct round type from game data', () => {
      const picks = [
        { gameId: '401845664', teamA: 'Canada', teamAScore: 4, teamB: 'USA', teamBScore: 3, predictedResult: 'win_a' },
      ];

      const result = transformPicksToDatabase(picks, 'player123', mockGames);

      expect(result[0].game_round_type).toBe('medalRound');
    });

    it('defaults to groupStage if game not found', () => {
      const picks = [
        { gameId: 'unknown', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2, predictedResult: 'win_a' },
      ];

      const result = transformPicksToDatabase(picks, 'player123', mockGames);

      expect(result[0].game_round_type).toBe('groupStage');
    });

    it('transforms multiple picks', () => {
      const picks = [
        { gameId: '401845663', teamA: 'Canada', teamAScore: 3, teamB: 'USA', teamBScore: 2, predictedResult: 'win_a' },
        { gameId: '401845664', teamA: 'Finland', teamAScore: 1, teamB: 'Sweden', teamBScore: 1, predictedResult: 'tie' },
      ];

      const result = transformPicksToDatabase(picks, 'player123', mockGames);

      expect(result).toHaveLength(2);
      expect(result[0].game_espn_id).toBe('401845663');
      expect(result[1].game_espn_id).toBe('401845664');
    });
  });

  describe('generatePicksTemplate', () => {
    it('generates CSV template with headers and games', () => {
      const mockGames = [
        { espnEventId: '401845663', teamA: { name: 'Canada' }, teamB: { name: 'USA' } },
        { espnEventId: '401845664', teamA: { name: 'Finland' }, teamB: { name: 'Sweden' } },
      ];

      const template = generatePicksTemplate(mockGames);
      const lines = template.split('\n');

      expect(lines[0]).toBe('game_id,team_a,team_a_score,team_b,team_b_score,confidence');
      expect(lines[1]).toBe('401845663,Canada,,USA,,0.5');
      expect(lines[2]).toBe('401845664,Finland,,Sweden,,0.5');
    });

    it('handles games with missing team data', () => {
      const mockGames = [
        { espnEventId: '401845663' },
      ];

      const template = generatePicksTemplate(mockGames);
      const lines = template.split('\n');

      expect(lines[1]).toBe('401845663,Team A,,Team B,,0.5');
    });

    it('handles empty games array', () => {
      const template = generatePicksTemplate([]);
      const lines = template.split('\n');

      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('game_id,team_a,team_a_score,team_b,team_b_score,confidence');
    });
  });
});
