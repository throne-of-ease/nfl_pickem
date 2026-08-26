import { describe, it, expect } from 'vitest';
import { parsePlayerPicksCSV } from '../csvProcessor.js';

describe('CSV confidence parsing', () => {
  it('parses confidence from CSV correctly', () => {
    const csv = `game_id,team_a,team_a_score,team_b,team_b_score,confidence
401845663,Canada,4,USA,3,0.75
401845664,Finland,2,Sweden,2,1.0
401845665,Germany,1,Slovakia,3,50
401845666,Latvia,1,Czechia,4,80`;

    const result = parsePlayerPicksCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.picks[0].confidence).toBe(0.75);
    expect(result.picks[1].confidence).toBe(1.0);
    expect(result.picks[2].confidence).toBe(0.5); // 50 / 100 = 0.5
    expect(result.picks[3].confidence).toBe(0.8); // 80 / 100 = 0.8
  });

  it('handles missing or invalid confidence by defaulting to 0.5', () => {
    const csv = `game_id,team_a,team_a_score,team_b,team_b_score,confidence
401845663,Canada,4,USA,3,
401845664,Finland,2,Sweden,2,invalid`;

    const result = parsePlayerPicksCSV(csv);
    expect(result.picks[0].confidence).toBe(0.5);
    expect(result.picks[1].confidence).toBe(0.5);
  });

  it('bounds confidence between 0.5 and 1.0', () => {
    const csv = `game_id,team_a,team_a_score,team_b,team_b_score,confidence
401845663,Canada,4,USA,3,0.2
401845664,Finland,2,Sweden,2,1.5`;

    const result = parsePlayerPicksCSV(csv);
    expect(result.picks[0].confidence).toBe(0.5);
    expect(result.picks[1].confidence).toBe(1.0);
  });
});
