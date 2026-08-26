/**
 * Country flag utilities for Olympic hockey teams
 * Uses Unicode emoji flags (Regional Indicator Symbols)
 */

// Map team abbreviations to ISO country codes for flag emojis
const COUNTRY_CODE_MAP = {
  CAN: 'CA', // Canada
  USA: 'US', // United States
  FIN: 'FI', // Finland
  SWE: 'SE', // Sweden
  SUI: 'CH', // Switzerland
  GER: 'DE', // Germany
  CZE: 'CZ', // Czech Republic
  SVK: 'SK', // Slovakia
  RUS: 'RU', // Russia (or ROC for Olympic Athletes from Russia)
  ROC: 'RU', // Russian Olympic Committee
  NOR: 'NO', // Norway
  LAT: 'LV', // Latvia
  DEN: 'DK', // Denmark
  AUT: 'AT', // Austria
  SLO: 'SI', // Slovenia
  KAZ: 'KZ', // Kazakhstan
  CHN: 'CN', // China
  JPN: 'JP', // Japan
  KOR: 'KR', // South Korea
  ITA: 'IT', // Italy
  FRA: 'FR', // France
  POL: 'PL', // Poland
  BLR: 'BY', // Belarus
  HUN: 'HU', // Hungary
  GBR: 'GB', // Great Britain
  BEL: 'BE', // Belgium
  NED: 'NL', // Netherlands
  ESP: 'ES', // Spain
  AUS: 'AU', // Australia
  NZL: 'NZ', // New Zealand
};

/**
 * Convert country code to flag emoji
 * Uses Regional Indicator Symbols (U+1F1E6 - U+1F1FF)
 */
function countryCodeToEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';

  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0)); // Regional Indicator Symbol offset

  return String.fromCodePoint(...codePoints);
}

/**
 * Get flag emoji for a team abbreviation (e.g., 'CAN' -> '🇨🇦')
 */
export function getTeamFlag(teamAbbreviation) {
  if (!teamAbbreviation) return '';

  const countryCode = COUNTRY_CODE_MAP[teamAbbreviation.toUpperCase()];
  if (!countryCode) return '';

  return countryCodeToEmoji(countryCode);
}

/**
 * Get flag emoji from team name (tries to extract abbreviation)
 */
export function getFlagFromTeamName(teamName) {
  if (!teamName) return '';

  // Common team name patterns
  const patterns = [
    /\b(CAN|USA|FIN|SWE|SUI|GER|CZE|SVK|RUS|ROC|NOR|LAT|DEN|AUT|SLO|KAZ|CHN|JPN|KOR|ITA|FRA|POL|BLR|HUN|GBR|BEL|NED|ESP|AUS|NZL)\b/i,
  ];

  for (const pattern of patterns) {
    const match = teamName.match(pattern);
    if (match) {
      return getTeamFlag(match[1]);
    }
  }

  // Try to match full country names
  const nameMap = {
    'Canada': 'CAN',
    'United States': 'USA',
    'Finland': 'FIN',
    'Sweden': 'SWE',
    'Switzerland': 'SUI',
    'Germany': 'GER',
    'Czech Republic': 'CZE',
    'Czechia': 'CZE',
    'Slovakia': 'SVK',
    'Russia': 'RUS',
    'Norway': 'NOR',
    'Latvia': 'LAT',
    'Denmark': 'DEN',
    'Austria': 'AUT',
    'Slovenia': 'SLO',
    'Kazakhstan': 'KAZ',
    'China': 'CHN',
    'Japan': 'JPN',
    'South Korea': 'KOR',
    'Korea': 'KOR',
    'Italy': 'ITA',
    'France': 'FRA',
    'Poland': 'POL',
    'Belarus': 'BLR',
    'Hungary': 'HUN',
    'Great Britain': 'GBR',
    'Belgium': 'BEL',
    'Netherlands': 'NED',
    'Spain': 'ESP',
    'Australia': 'AUS',
    'New Zealand': 'NZL',
  };

  for (const [fullName, abbr] of Object.entries(nameMap)) {
    if (teamName.toLowerCase().includes(fullName.toLowerCase())) {
      return getTeamFlag(abbr);
    }
  }

  return '';
}

/**
 * Get flag for team object (tries abbreviation, then name)
 */
export function getTeamFlagFromObject(team) {
  if (!team) return '';

  // Try abbreviation first
  if (team.abbreviation) {
    const flag = getTeamFlag(team.abbreviation);
    if (flag) return flag;
  }

  // Fall back to name
  if (team.name || team.displayName) {
    return getFlagFromTeamName(team.name || team.displayName);
  }

  return '';
}
