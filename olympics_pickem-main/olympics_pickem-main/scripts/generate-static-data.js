#!/usr/bin/env node

/**
 * Build-time static data generation script
 *
 * This script fetches current game data from ESPN API and saves it as static JSON.
 * Run before build to have fresh data baked into the deployment.
 *
 * Usage:
 *   node scripts/generate-static-data.js
 *
 * Or add to package.json:
 *   "prebuild": "node scripts/generate-static-data.js"
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PUBLIC_DATA_DIR = join(PROJECT_ROOT, 'public', 'data');

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/hockey/olympics-mens-ice-hockey';
const TOURNAMENT_DATE_RANGE = '20260211-20260222';

/**
 * Fetch data from ESPN API with timeout
 */
async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Fetch current games from ESPN
 */
async function fetchGames() {
  const url = `${ESPN_BASE_URL}/scoreboard?dates=${TOURNAMENT_DATE_RANGE}`;
  console.log(`Fetching games from: ${url}`);

  try {
    const data = await fetchWithTimeout(url);
    console.log(`  Found ${data.events?.length || 0} games`);
    return data;
  } catch (error) {
    console.warn(`  ESPN API failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch standings from ESPN
 */
async function fetchStandings() {
  const url = `${ESPN_BASE_URL}/standings`;
  console.log(`Fetching standings from: ${url}`);

  try {
    const data = await fetchWithTimeout(url);
    const groupCount = data.children?.length || 0;
    console.log(`  Found ${groupCount} groups`);
    return data;
  } catch (error) {
    console.warn(`  ESPN standings API failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch teams from ESPN
 */
async function fetchTeams() {
  const url = `${ESPN_BASE_URL}/teams`;
  console.log(`Fetching teams from: ${url}`);

  try {
    const data = await fetchWithTimeout(url);
    const teamCount = data.sports?.[0]?.leagues?.[0]?.teams?.length || 0;
    console.log(`  Found ${teamCount} teams`);
    return data;
  } catch (error) {
    console.warn(`  ESPN teams API failed: ${error.message}`);
    return null;
  }
}

/**
 * Generate cache metadata
 */
function generateMetadata() {
  return {
    generatedAt: new Date().toISOString(),
    source: 'ESPN API',
    tournamentDateRange: TOURNAMENT_DATE_RANGE,
  };
}

/**
 * Write JSON file with pretty formatting
 */
function writeJsonFile(filePath, data) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(data, null, 2);
  writeFileSync(filePath, content, 'utf-8');
  console.log(`  Written: ${filePath} (${content.length} bytes)`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n========================================');
  console.log('Static Data Generation');
  console.log('========================================\n');

  const metadata = generateMetadata();
  console.log(`Generated at: ${metadata.generatedAt}\n`);

  // Fetch all data in parallel
  const [gamesData, standingsData, teamsData] = await Promise.all([
    fetchGames(),
    fetchStandings(),
    fetchTeams(),
  ]);

  console.log('\nWriting static files...\n');

  // Write current games (for pre-built static fallback)
  if (gamesData && gamesData.events?.length > 0) {
    writeJsonFile(
      join(PUBLIC_DATA_DIR, 'current-games.json'),
      { ...gamesData, _metadata: metadata }
    );
  } else {
    console.log('  Skipping current-games.json (no data from ESPN)');
  }

  // Write current standings
  if (standingsData && standingsData.children?.length > 0) {
    writeJsonFile(
      join(PUBLIC_DATA_DIR, 'current-standings.json'),
      { ...standingsData, _metadata: metadata }
    );
  } else {
    console.log('  Skipping current-standings.json (no data from ESPN)');
  }

  // Update teams.json if ESPN returned data
  if (teamsData) {
    const teams = teamsData.sports?.[0]?.leagues?.[0]?.teams || [];
    if (teams.length > 0) {
      const processedTeams = teams.map(t => ({
        id: t.team.id,
        name: t.team.displayName,
        displayName: t.team.displayName,
        abbreviation: t.team.abbreviation,
        logo: t.team.logos?.[0]?.href || null,
        color: t.team.color || null,
        alternateColor: t.team.alternateColor || null,
      }));

      writeJsonFile(
        join(PUBLIC_DATA_DIR, 'teams.json'),
        { teams: processedTeams, lastUpdated: metadata.generatedAt }
      );
    }
  }

  // Generate build info for cache busting
  writeJsonFile(
    join(PUBLIC_DATA_DIR, 'build-info.json'),
    {
      buildTime: metadata.generatedAt,
      hasGames: !!(gamesData?.events?.length),
      hasStandings: !!(standingsData?.children?.length),
      hasTeams: !!(teamsData?.sports?.[0]?.leagues?.[0]?.teams?.length),
    }
  );

  console.log('\n========================================');
  console.log('Static data generation complete!');
  console.log('========================================\n');
}

main().catch(error => {
  console.error('Static data generation failed:', error);
  // Don't fail the build - just warn
  process.exit(0);
});
