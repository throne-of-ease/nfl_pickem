// Python script to extract FPI data from ESPN for manual update of fpi_data.json
/*
import re
import json

content = """
    <PASTE THE ENTIRE HTML CONTENT OF https://www.espn.com/nfl/fpi/_/season/2025 HERE>
"""

# Extract team names
team_names_start_idx = content.find("Team\\n") + len("Team\\n")
team_names_end_idx = content.find("POWER INDEXRANKSW-L-TFPIRKTRENDOFFDEFSTSOSREM SOSAVGWP")
team_names_block = content[team_names_start_idx:team_names_end_idx].strip()
team_names = [name.strip() for name in team_names_block.split('\\n') if name.strip()]

# Extract numerical data lines
data_start_idx = content.find("POWER INDEXRANKSW-L-TFPIRKTRENDOFFDEFSTSOSREM SOSAVGWP") + len("POWER INDEXRANKSW-L-TFPIRKTRENDOFFDEFSTSOSREM SOSAVGWP")
data_end_idx = content.find("Last Updated:")
numerical_data_block = content[data_start_idx:data_end_idx].strip()
numerical_data_lines = [line.strip() for line in numerical_data_block.split('\\n') if line.strip()]

# Regex pattern to parse each numerical data line
data_pattern = re.compile(
    r'(\d+-\d+-\d+)\\s+'      # W-L-T (e.g., 5-5-0)
    r'(-?\\d+\\.\\d+)\\s+'       # FPI (e.g., 7.3, -1.5)
    r'(\\d+)\\s+'              # Rank (e.g., 1)
    r'(--|-?\\d+)\\s+'         # Trend (e.g., --, 1, -1)
    r'(-?\\d+\\.\\d+)\\s+'       # OFF (e.g., 5.4)
    r'(-?\\d+\\.\\d+)\\s+'       # DEF (e.g., 2.1)
    r'(-?\\d+\\.\\d+)\\s+'       # STS (e.g., -0.2)
    r'(\\d+)\\s+'              # SOS (e.g., 6)
    r'(\\d+)\\s+'              # REM SOS (e.g., 21)
    r'(\\d+)'                 # AVG WP (e.g., 8)
)

extracted_data = []

# Pair team names with their corresponding numerical data and parse
if len(team_names) == len(numerical_data_lines):
    for i, team_name in enumerate(team_names):
        data_line = numerical_data_lines[i]
        match = data_pattern.match(data_line)
        if match:
            values = match.groups()
            team_dict = {
                'Team': team_name,
                'W-L-T': values[0],
                'FPI': float(values[1]),
                'Rank': int(values[2]),
                'Trend': values[3],
                'OFF': float(values[4]),
                'DEF': float(values[5]),
                'STS': float(values[6]),
                'SOS': int(values[7]),
                'REM SOS': int(values[8]),
                'AVG WP': int(values[9])
            }
            extracted_data.append(team_dict)
        else:
            print(f"Warning: Could not parse data line for team '{team_name}': '{data_line}'")
else:
    print(f"Error: Mismatch between number of team names ({len(team_names)}) and data lines ({len(numerical_data_lines)}).")

print(json.dumps(extracted_data, indent=2))
*/

const { useState, useEffect, useCallback } = React;

const convertOddsToProbability = (odds) => {
  if (typeof odds === 'string') {
    if (odds.toUpperCase() === 'EVEN') {
      odds = 100;
    } else {
      odds = parseFloat(odds);
    }
  }

  if (isNaN(odds)) {
    return null;
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  } else if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  } else { // odds === 0 or was 'EVEN' which becomes 100
    return 0.5;
  }
};

const fetchOdds = async (gameId) => {
    try {
        const response = await fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${gameId}/competitions/${gameId}/odds`);
        const data = await response.json();

        if (data && data.items) {
            const targetProviders = ["Draft Kings", "ESPN BET"];
            // Exclude "ESPN Bet - Live Odds" implicitly by checking against exact strings in targetProviders
            
            const oddsItem = data.items.find(item =>
                item.provider &&
                targetProviders.includes(item.provider.name) &&
                item.homeTeamOdds && item.homeTeamOdds.moneyLine != null &&
                item.awayTeamOdds && item.awayTeamOdds.moneyLine != null
            );

            if (oddsItem) {
                return {
                    homeMoneyLine: oddsItem.homeTeamOdds.moneyLine,
                    awayMoneyLine: oddsItem.awayTeamOdds.moneyLine
                };
            }
        }
    } catch (error) {
        // console.error(`Error fetching odds for game ${gameId}:`, error);
    }
    return { homeMoneyLine: null, awayMoneyLine: null };
};

const calculateGameConfidence = (games) => {
  let processedGames = games.map(game => {
    const homeWP = game.initialHomeWinProbability ?? game.homeWinProbability;
    const awayWP = game.initialAwayWinProbability ?? game.awayWinProbability;

    const absDiff = (homeWP && awayWP)
      ? Math.abs(homeWP - awayWP)
      : -1;

    const rawAwayML_WP = convertOddsToProbability(game.awayMoneyLine);
    const rawHomeML_WP = convertOddsToProbability(game.homeMoneyLine);

    let awayML_WP = null;
    let homeML_WP = null;

    if (rawAwayML_WP !== null && rawHomeML_WP !== null) {
      const totalProb = rawAwayML_WP + rawHomeML_WP;
      if (totalProb > 0) {
        awayML_WP = rawAwayML_WP / totalProb;
        homeML_WP = rawHomeML_WP / totalProb;
      } else {
        awayML_WP = rawAwayML_WP;
        homeML_WP = rawHomeML_WP;
      }
    }

    const absMlDiff = (awayML_WP && homeML_WP) ? Math.abs(awayML_WP - homeML_WP) : -1;

    const fpiPick = (homeWP !== null && awayWP !== null)
      ? (homeWP > awayWP ? game.home : game.away)
      : null;
    const mlPick = (rawAwayML_WP !== null && rawHomeML_WP !== null)
      ? (rawAwayML_WP < rawHomeML_WP ? game.home : game.away)
      : null;

    // Aggregate calculations (these are not strictly needed for FPI/ML players but are part of the original logic)
    const aggAwayScore = (awayWP || 0) + ((awayML_WP || 0) * 100);
    const aggHomeScore = (homeWP || 0) + ((homeML_WP || 0) * 100);
    const totalScore = aggAwayScore + aggHomeScore;

    const aggAwayWP = totalScore > 0 ? (aggAwayScore / totalScore) * 100 : null;
    const aggHomeWP = totalScore > 0 ? (aggHomeScore / totalScore) * 100 : null;
    const aggAbsDiff = (aggAwayWP !== null && aggHomeWP !== null) ? Math.abs(aggAwayWP - aggHomeWP) : -1;
    const aggPick = aggAwayWP > aggHomeWP ? game.away : game.home;


    return { ...game, absDiff, awayML_WP, homeML_WP, absMlDiff, fpiPick, mlPick, aggAwayWP, aggHomeWP, aggAbsDiff, aggPick };
  });

  // Create ranks for fpiConfidence
  const rankedByFpi = [...processedGames].sort((a, b) => a.absDiff - b.absDiff);
  const fpiRanks = {};
  rankedByFpi.forEach((game, index) => {
    fpiRanks[game.id] = game.absDiff === -1 ? Infinity : index + 1;
  });

  // Create ranks for mlConfidence
  const rankedByMl = [...processedGames].sort((a, b) => a.absMlDiff - b.absMlDiff);
  const mlRanks = {};
  rankedByMl.forEach((game, index) => {
    mlRanks[game.id] = game.absMlDiff === -1 ? Infinity : index + 1;
  });

  // Create ranks for aggConfidence
  const rankedByAgg = [...processedGames].sort((a, b) => a.aggAbsDiff - b.aggAbsDiff);
  const aggRanks = {};
  rankedByAgg.forEach((game, index) => {
    aggRanks[game.id] = game.aggAbsDiff === -1 ? Infinity : index + 1;
  });

  processedGames = processedGames.map(game => ({
    ...game,
    fpiConfidence: fpiRanks[game.id],
    mlConfidence: mlRanks[game.id],
    aggConfidence: aggRanks[game.id]
  }));

  // Calculate modelDisagreement (also part of original logic, keep for now)
  processedGames = processedGames.map(game => {
    let modelDisagreement = null;
    if (game.homeWinProbability !== null && game.homeML_WP !== null) {
      const homeWP = game.initialHomeWinProbability ?? game.homeWinProbability;
      const awayWP = game.initialAwayWinProbability ?? game.awayWinProbability;

      const fpiPickWp = game.fpiPick === game.home ? homeWP : awayWP;
      const mlPickWp = game.mlPick === game.home ? (game.homeML_WP * 100) : (game.awayML_WP * 100);

      if (game.fpiPick === game.mlPick) {
        modelDisagreement = Math.abs(fpiPickWp - mlPickWp);
      } else {
        modelDisagreement = (fpiPickWp + mlPickWp-100);
      }
    }

    let confidenceDisagreement = null;
    if (isFinite(game.fpiConfidence) && isFinite(game.mlConfidence)) {
      if (game.fpiPick === game.mlPick) {
        confidenceDisagreement = Math.abs(game.fpiConfidence - game.mlConfidence);
      } else {
        confidenceDisagreement = (game.fpiConfidence + game.mlConfidence);
      }
    }

    return { ...game, modelDisagreement, confidenceDisagreement };
  });

  return processedGames;
};

const teamAbbreviations = {
  "Kansas City Chiefs": "KC",
  "Los Angeles Rams": "LAR",
  "Detroit Lions": "DET",
  "Indianapolis Colts": "IND",
  "Philadelphia Eagles": "PHI",
  "Green Bay Packers": "GB",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Seattle Seahawks": "SEA",
  "San Francisco 49ers": "SF",
  "Denver Broncos": "DEN",
  "Houston Texans": "HOU",
  "Los Angeles Chargers": "LAC",
  "Tampa Bay Buccaneers": "TB",
  "Dallas Cowboys": "DAL",
  "New England Patriots": "NE",
  "Pittsburgh Steelers": "PIT",
  "Jacksonville Jaguars": "JAX",
  "New York Giants": "NYG",
  "Chicago Bears": "CHI",
  "Washington Commanders": "WSH",
  "Atlanta Falcons": "ATL",
  "Minnesota Vikings": "MIN",
  "Miami Dolphins": "MIA",
  "Arizona Cardinals": "ARI",
  "Carolina Panthers": "CAR",
  "Cincinnati Bengals": "CIN",
  "Las Vegas Raiders": "LV",
  "New Orleans Saints": "NO",
  "New York Jets": "NYJ",
  "Tennessee Titans": "TEN",
  "Cleveland Browns": "CLE"
};

const fullTeamNames = Object.entries(teamAbbreviations).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

function WeeklyPointsChart({ confidenceResults, selectedWeek, weeks: allWeeks, gamesOfTheWeek, pointsPerWeekDisplayMode }) {
  const [activePoint, setActivePoint] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const players = Object.keys(confidenceResults);

  const maxPointsPerWeek = React.useMemo(() => {
    const result = {};
    if (!allWeeks) return result;
    allWeeks.forEach(weekData => {
        const numGames = weekData.games.length;
        const gotwBonus = weekData.games.some(g => gamesOfTheWeek.includes(g.id)) ? 5 : 0;
        result[weekData.week] = (numGames * (numGames + 1) / 2) + gotwBonus;
    });
    return result;
  }, [allWeeks, gamesOfTheWeek]);

  const processedConfidenceResults = React.useMemo(() => {
    const processed = {};
    players.forEach(player => {
      if (confidenceResults[player]) {
        let processedPoints;
        const filteredPoints = confidenceResults[player].pointsPerWeek.filter(p => p.week <= selectedWeek);

        switch (pointsPerWeekDisplayMode) {
          case 'points_percentage':
            processedPoints = filteredPoints.map(p => ({
              ...p,
              points: maxPointsPerWeek[p.week] ? (p.points / maxPointsPerWeek[p.week]) * 100 : 0
            }));
            break;
          case 'correct_percentage':
            const correctPicksData = confidenceResults[player].correctPicksPerWeek.filter(p => p.week <= selectedWeek);
            processedPoints = correctPicksData.map(p => {
                const weekInfo = allWeeks.find(w => w.week === p.week);
                const numGames = weekInfo ? weekInfo.games.length : 0;
                return {
                    ...p,
                    points: numGames > 0 ? (p.correctPicks / numGames) * 100 : 0
                }
            });
            break;
          case 'absolute':
          default:
            processedPoints = filteredPoints;
            break;
        }
        processed[player] = { ...confidenceResults[player], pointsPerWeek: processedPoints };
      }
    });
    return processed;
  }, [confidenceResults, selectedWeek, pointsPerWeekDisplayMode, maxPointsPerWeek, players, allWeeks]);

  const weeks = processedConfidenceResults[players[0]]?.pointsPerWeek.map(p => p.week) || [];
  
  const allPoints = Object.values(processedConfidenceResults).flatMap(p => p.pointsPerWeek.map(w => w.points));
  const dataMin = allPoints.length > 0 ? Math.min(...allPoints) : 0;
  const dataMax = allPoints.length > 0 ? Math.max(...allPoints) : 1;
  const buffer = (dataMax - dataMin) * 0.1 || 1;
  const chartMin = dataMin - buffer;
  const chartMax = dataMax + buffer;

  const chartWidth = 800;
  const chartHeight = isMobile ? 800 : 400;
  const padding = 70;
  const rightMargin = 70;

  const plotAreaWidth = chartWidth - padding - rightMargin;
  const xScale = (week) => padding + (week - 1) * (plotAreaWidth) / (weeks.length > 1 ? weeks.length - 1 : 1);
  const yScale = (points) => chartHeight - padding - ((points - chartMin) / (chartMax - chartMin)) * (chartHeight - 2 * padding);

  const colors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#F0E442"];

  const finalLabels = React.useMemo(() => {
    if (players.length === 0 || weeks.length === 0) return [];

    const initialLabels = players.map((player, playerIndex) => {
      const playerPoints = processedConfidenceResults[player]?.pointsPerWeek;
      if (!playerPoints || playerPoints.length === 0) return null;
      
      const lastPoint = playerPoints[playerPoints.length - 1];
      return {
        player,
        value: lastPoint.points,
        idealY: yScale(lastPoint.points),
        finalY: yScale(lastPoint.points),
        color: colors[playerIndex % colors.length]
      };
    }).filter(Boolean);

    initialLabels.sort((a, b) => a.idealY - b.idealY);

    const minSpacing = 16;
    for (let i = 1; i < initialLabels.length; i++) {
      const prevLabel = initialLabels[i - 1];
      const currentLabel = initialLabels[i];
      
      const requiredY = prevLabel.finalY + minSpacing;
      if (currentLabel.finalY < requiredY) {
        currentLabel.finalY = requiredY;
      }
    }
    
    const maxChartY = chartHeight - padding;
    for (let i = initialLabels.length - 1; i >= 0; i--) {
        if (initialLabels[i].finalY > maxChartY) {
            initialLabels[i].finalY = maxChartY;
            if (i > 0) {
                const prevLabel = initialLabels[i-1];
                const requiredY = initialLabels[i].finalY - minSpacing;
                if(prevLabel.finalY > requiredY) {
                    prevLabel.finalY = requiredY;
                }
            }
        }
    }

    return initialLabels;
  }, [processedConfidenceResults, players, selectedWeek, weeks, chartMin, chartMax]);

  const handleMouseMove = (e) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;

    const scaleX = chartWidth / svgRect.width;
    const scaleY = chartHeight / svgRect.height;
    const transformedX = x * scaleX;
    const transformedY = y * scaleY;

    let closestPoint = null;
    let minDistance = Infinity;

    players.forEach((player, playerIndex) => {
      if (processedConfidenceResults[player]) {
        processedConfidenceResults[player].pointsPerWeek.forEach(d => {
          const pointX = xScale(d.week);
          const pointY = yScale(d.points);
          const distance = Math.sqrt(Math.pow(transformedX - pointX, 2) + Math.pow(transformedY - pointY, 2));

          if (distance < minDistance && distance < 20) {
            minDistance = distance;
            closestPoint = { player, week: d.week, points: d.points, x: pointX, y: pointY, color: colors[playerIndex % colors.length] };
          }
        });
      }
    });

    setActivePoint(closestPoint);
  };

  const handleMouseLeave = () => {
    setActivePoint(null);
  };

  return (
    React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 p-6" },
      React.createElement("svg", {
        viewBox: `0 0 ${chartWidth} ${chartHeight}`,
        className: "w-full h-auto",
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave
      },
        // Legend
        React.createElement("g", { transform: `translate(${padding}, ${padding / 2})`}, 
            players.map((player, playerIndex) => (
              React.createElement("g", { key: player, transform: `translate(${playerIndex * 110}, 0)` },
                React.createElement("rect", { x: 0, y: -10, width: 10, height: 10, fill: colors[playerIndex % colors.length] }),
                React.createElement("text", { x: 15, y: 0, fill: "#94a3b8", className: "chart-text" }, player)
              )
            ))
        ),

        // X-axis
        React.createElement("line", { x1: padding, y1: chartHeight - padding, x2: plotAreaWidth + padding, y2: chartHeight - padding, stroke: "#64748b" }),
        weeks.map(week => (
          React.createElement("text", { key: week, x: xScale(week), y: chartHeight - padding + 20, fill: "#94a3b8", textAnchor: "middle", className: "chart-text" }, `W${week}`)
        )),

        // Y-axis
        React.createElement("line", { x1: padding, y1: padding, x2: padding, y2: chartHeight - padding, stroke: "#64748b" }),
        Array.from({ length: 5 }).map((_, i) => {
          const range = chartMax - chartMin;
          const points = chartMin + (i * range / 4);
          const displayPoints = pointsPerWeekDisplayMode === 'absolute' ? Math.round(points) : points.toFixed(1);
          return React.createElement("text", { key: i, x: padding - 10, y: yScale(points), fill: "#94a3b8", textAnchor: "end", className: "chart-text" }, `${displayPoints}${pointsPerWeekDisplayMode !== 'absolute' ? '%' : ''}`);
        }),

        // Lines
        players.map((player, playerIndex) => {
          const playerPoints = processedConfidenceResults[player]?.pointsPerWeek;
          if (!playerPoints || playerPoints.length === 0) return null;
          
          return React.createElement("polyline", {
            key: `${player}-line`,
            fill: "none",
            stroke: colors[playerIndex % colors.length],
            strokeWidth: 4,
            points: playerPoints.map(d => `${xScale(d.week)},${yScale(d.points)}`).join(' ')
          });
        }),

        // Labels
        finalLabels.map(label => {
          const displayValue = pointsPerWeekDisplayMode === 'absolute' ? Math.round(label.value) : `${label.value.toFixed(1)}%`;
          return React.createElement("text", {
            key: `${label.player}-label`,
            x: plotAreaWidth + padding + 10,
            y: label.finalY,
            fill: label.color,
            className: "chart-text",
            textAnchor: "start",
            alignmentBaseline: "middle"
          }, displayValue);
        }),

        // Active point
        activePoint && React.createElement("g", null,
          React.createElement("circle", { cx: activePoint.x, cy: activePoint.y, r: 5, fill: activePoint.color }),
          React.createElement("rect", { x: activePoint.x > chartWidth - 150 ? activePoint.x - 130 : activePoint.x + 10, y: activePoint.y - 20, width: 120, height: 40, fill: "#1e293b", stroke: activePoint.color, rx: 5 }),
          React.createElement("text", { x: activePoint.x > chartWidth - 150 ? activePoint.x - 120 : activePoint.x + 20, y: activePoint.y - 5, fill: "#fff", className: "chart-text" }, `${activePoint.player}`),
          React.createElement("text", { x: activePoint.x > chartWidth - 150 ? activePoint.x - 120 : activePoint.x + 20, y: activePoint.y + 10, fill: "#94a3b8", className: "chart-text" }, `W${activePoint.week}: ${activePoint.points.toFixed(pointsPerWeekDisplayMode !== 'absolute' ? 1 : 0)}${pointsPerWeekDisplayMode !== 'absolute' ? '%' : ' pts'}`)
        )
      )
    )
  );
}

function WeeklyPointsTable({ confidenceResults, weeks: allWeeks, gamesOfTheWeek, pointsPerWeekDisplayMode }) {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
    const players = Object.keys(confidenceResults);
    const weeks = confidenceResults[players[0]]?.pointsPerWeek.map(p => p.week) || [];

    const maxPointsPerWeek = React.useMemo(() => {
        const result = {};
        if (!allWeeks) return result;
        allWeeks.forEach(weekData => {
            const numGames = weekData.games.length;
            const gotwBonus = weekData.games.some(g => gamesOfTheWeek.includes(g.id)) ? 5 : 0;
            result[weekData.week] = (numGames * (numGames + 1) / 2) + gotwBonus;
        });
        return result;
    }, [allWeeks, gamesOfTheWeek]);

    const sortedWeeks = React.useMemo(() => {
        let sortableWeeks = [...weeks];
        if (sortConfig.key !== null) {
            sortableWeeks.sort((a, b) => {
                let aValue, bValue;
                
                switch (pointsPerWeekDisplayMode) {
                    case 'points_percentage':
                        const aPoints = confidenceResults[sortConfig.key].pointsPerWeek.find(d => d.week === a)?.points || 0;
                        const bPoints = confidenceResults[sortConfig.key].pointsPerWeek.find(d => d.week === b)?.points || 0;
                        aValue = maxPointsPerWeek[a] ? (aPoints / maxPointsPerWeek[a]) * 100 : 0;
                        bValue = maxPointsPerWeek[b] ? (bPoints / maxPointsPerWeek[b]) * 100 : 0;
                        break;
                    case 'correct_percentage':
                        const aCorrect = confidenceResults[sortConfig.key].correctPicksPerWeek.find(d => d.week === a)?.correctPicks || 0;
                        const bCorrect = confidenceResults[sortConfig.key].correctPicksPerWeek.find(d => d.week === b)?.correctPicks || 0;
                        const aNumGames = allWeeks.find(w => w.week === a)?.games.length || 0;
                        const bNumGames = allWeeks.find(w => w.week === b)?.games.length || 0;
                        aValue = aNumGames > 0 ? (aCorrect / aNumGames) * 100 : 0;
                        bValue = bNumGames > 0 ? (bCorrect / bNumGames) * 100 : 0;
                        break;
                    case 'absolute':
                    default:
                        aValue = confidenceResults[sortConfig.key].pointsPerWeek.find(d => d.week === a)?.points || 0;
                        bValue = confidenceResults[sortConfig.key].pointsPerWeek.find(d => d.week === b)?.points || 0;
                        break;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableWeeks;
    }, [weeks, sortConfig, confidenceResults, pointsPerWeekDisplayMode, maxPointsPerWeek, allWeeks]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    return (
        React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden mt-6" },
            React.createElement("table", { className: "w-full" },
                React.createElement("thead", null,
                    React.createElement("tr", { className: "bg-slate-700/50 border-b border-slate-700" },
                        React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm" }, "Week"),
                        players.map(player => 
                            React.createElement("th", { key: player, className: "px-1 py-1 text-center text-white font-semibold text-sm cursor-pointer", onClick: () => requestSort(player) }, 
                                player,
                                sortConfig.key === player && (sortConfig.direction === 'ascending' ? ' \u25B2' : ' \u25BC')
                            )
                        )
                    )
                ),
                React.createElement("tbody", null,
                    sortedWeeks.map(week => (
                        React.createElement("tr", { key: week, className: "border-b border-slate-700/50 hover:bg-slate-700/20" },
                            React.createElement("td", { className: "px-1 py-1 text-white font-semibold" }, `Week ${week}`),
                            players.map(player => {
                                let displayValue;
                                switch (pointsPerWeekDisplayMode) {
                                    case 'points_percentage':
                                        const points = confidenceResults[player].pointsPerWeek.find(d => d.week === week)?.points || 0;
                                        const percentage = maxPointsPerWeek[week] ? (points / maxPointsPerWeek[week]) * 100 : 0;
                                        displayValue = `${percentage.toFixed(1)}%`;
                                        break;
                                    case 'correct_percentage':
                                        const correctPicks = confidenceResults[player].correctPicksPerWeek.find(d => d.week === week)?.correctPicks || 0;
                                        const numGames = allWeeks.find(w => w.week === week)?.games.length || 0;
                                        const correctPercentage = numGames > 0 ? (correctPicks / numGames) * 100 : 0;
                                        displayValue = `${correctPercentage.toFixed(1)}%`;
                                        break;
                                    case 'absolute':
                                    default:
                                        displayValue = confidenceResults[player].pointsPerWeek.find(d => d.week === week)?.points || 0;
                                        break;
                                }
                                return React.createElement("td", { key: player, className: "px-1 py-1 text-center text-slate-300" }, displayValue)
                            })
                        )
                    ))
                )
            )
        )
    );
}

function CumulativePointsChart({ confidenceResults, selectedWeek }) {
  const [activePoint, setActivePoint] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showPotential, setShowPotential] = useState(true);
  const chartRef = React.useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const downloadChart = () => {
    if (!chartRef.current) return;
    const svg = chartRef.current;

    const canvas = document.createElement("canvas");
    const bbox = svg.getBoundingClientRect();
    const width = bbox.width * 2;
    const height = bbox.height * 2;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);

    const style = `
      <style>
        .chart-text { font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; fill: #94a3b8; }
      </style>
    `;
    svgString = svgString.replace(/^<svg[^>]*>/, `$&${style}`);

    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, bbox.width, bbox.height);
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `Cumulative_Points_vs_Leader_Week_${selectedWeek}.png`;
      link.href = pngUrl;
      link.click();
    };
    img.src = url;
  };

  const shareChart = () => {
    if (!chartRef.current) return;
    const svg = chartRef.current;

    const canvas = document.createElement("canvas");
    const bbox = svg.getBoundingClientRect();
    const width = bbox.width * 2;
    const height = bbox.height * 2;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);

    const style = `
      <style>
        .chart-text { font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; fill: #94a3b8; }
      </style>
    `;
    svgString = svgString.replace(/^<svg[^>]*>/, `$&${style}`);

    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, bbox.width, bbox.height);
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(async (blob) => {
        if (blob) {
            const file = new File([blob], `Cumulative_Points_vs_Leader_Week_${selectedWeek}.png`, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: `Cumulative Points vs Leader (Week ${selectedWeek})`
                    });
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('Error sharing:', error);
                    }
                }
            }
        }
      }, 'image/png');
    };
    img.src = url;
  };

  const players = Object.keys(confidenceResults);

  const filteredConfidenceResults = {};
  players.forEach(player => {
    if (confidenceResults[player]) {
      filteredConfidenceResults[player] = {
        ...confidenceResults[player],
        pointsPerWeek: confidenceResults[player].pointsPerWeek.filter(p => p.week <= selectedWeek)
      };
    }
  });

  const weeks = filteredConfidenceResults[players[0]]?.pointsPerWeek.map(p => p.week) || [];
  
  const allPoints = React.useMemo(() => {
    const points = Object.values(filteredConfidenceResults).flatMap(p => p.pointsPerWeek.map(w => w.relativePoints));
    if (showPotential) {
        const potentialPoints = Object.values(filteredConfidenceResults).flatMap(p => p.pointsPerWeek.map(w => w.relativePotentialPoints));
        return points.concat(potentialPoints);
    }
    return points;
  }, [filteredConfidenceResults, showPotential]);

  const dataMin = allPoints.length > 0 ? Math.min(...allPoints.filter(p => isFinite(p))) : 0;
  const dataMax = allPoints.length > 0 ? Math.max(...allPoints.filter(p => isFinite(p))) : 1;
  const buffer = (dataMax - dataMin) * 0.1 || 1;
  const chartMin = dataMin - buffer;
  const chartMax = dataMax + buffer;

  const chartWidth = 800;
  const chartHeight = isMobile ? 800 : 400;
  const padding = 60;
  const rightMargin = 70;

  const plotAreaWidth = chartWidth - padding - rightMargin;
  const xScale = (week) => padding + (week - 1) * (plotAreaWidth) / (weeks.length > 1 ? weeks.length - 1 : 1);
  const yScale = (points) => chartHeight - padding - ((points - chartMin) / (chartMax - chartMin)) * (chartHeight - 2 * padding);

  const colors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#F0E442"];

  const finalLabels = React.useMemo(() => {
    if (players.length === 0 || weeks.length === 0) return [];

    const initialLabels = players.map((player, playerIndex) => {
      const playerPoints = filteredConfidenceResults[player]?.pointsPerWeek;
      if (!playerPoints || playerPoints.length === 0) return null;
      
      const lastPoint = playerPoints[playerPoints.length - 1];
      return {
        player,
        value: lastPoint.relativePoints,
        idealY: yScale(lastPoint.relativePoints),
        finalY: yScale(lastPoint.relativePoints),
        color: colors[playerIndex % colors.length]
      };
    }).filter(Boolean);

    initialLabels.sort((a, b) => a.idealY - b.idealY);

    const minSpacing = 16;
    for (let i = 1; i < initialLabels.length; i++) {
      const prevLabel = initialLabels[i - 1];
      const currentLabel = initialLabels[i];
      
      const requiredY = prevLabel.finalY + minSpacing;
      if (currentLabel.finalY < requiredY) {
        currentLabel.finalY = requiredY;
      }
    }
    
    const maxChartY = chartHeight - padding;
    for (let i = initialLabels.length - 1; i >= 0; i--) {
        if (initialLabels[i].finalY > maxChartY) {
            initialLabels[i].finalY = maxChartY;
            if (i > 0) {
                const prevLabel = initialLabels[i-1];
                const requiredY = initialLabels[i].finalY - minSpacing;
                if(prevLabel.finalY > requiredY) {
                    prevLabel.finalY = requiredY;
                }
            }
        }
    }

    return initialLabels;
  }, [filteredConfidenceResults, players, selectedWeek, weeks, chartMin, chartMax]);

  const handleMouseMove = (e) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;

    const scaleX = chartWidth / svgRect.width;
    const scaleY = chartHeight / svgRect.height;
    const transformedX = x * scaleX;
    const transformedY = y * scaleY;

    let closestPoint = null;
    let minDistance = Infinity;

    players.forEach((player, playerIndex) => {
      if (filteredConfidenceResults[player]) {
        filteredConfidenceResults[player].pointsPerWeek.forEach(d => {
          const pointX = xScale(d.week);
          const pointY = yScale(d.relativePoints);
          const distance = Math.sqrt(Math.pow(transformedX - pointX, 2) + Math.pow(transformedY - pointY, 2));

          if (distance < minDistance && distance < 20) {
            minDistance = distance;
            closestPoint = { player, week: d.week, relativePoints: d.relativePoints, x: pointX, y: pointY, color: colors[playerIndex % colors.length] };
          }
        });
      }
    });

    setActivePoint(closestPoint);
  };

  const handleMouseLeave = () => {
    setActivePoint(null);
  };

  return (
    React.createElement(React.Fragment, null,
      React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 p-6 mt-6" },
        React.createElement("svg", {
          ref: chartRef,
          viewBox: `0 0 ${chartWidth} ${chartHeight}`,
          className: "w-full h-auto",
          onMouseMove: handleMouseMove,
          onMouseLeave: handleMouseLeave
        },
          // Legend
          React.createElement("g", { transform: `translate(${padding}, ${padding / 2})`}, 
              players.map((player, playerIndex) => (
                React.createElement("g", { key: player, transform: `translate(${playerIndex * 110}, 0)` },
                  React.createElement("rect", { x: 0, y: -10, width: 10, height: 10, fill: colors[playerIndex % colors.length] }),
                  React.createElement("text", { x: 15, y: 0, fill: "#94a3b8", className: "chart-text" }, player)
                )
              ))
          ),

          // X-axis
          React.createElement("line", { x1: padding, y1: chartHeight - padding, x2: plotAreaWidth + padding, y2: chartHeight - padding, stroke: "#64748b" }),
          weeks.map(week => (
            React.createElement("text", { key: week, x: xScale(week), y: chartHeight - padding + 20, fill: "#94a3b8", textAnchor: "middle", className: "chart-text" }, `W${week}`)
          )),

          // Y-axis
          React.createElement("line", { x1: padding, y1: padding, x2: padding, y2: chartHeight - padding, stroke: "#64748b" }),
          Array.from({ length: 5 }).map((_, i) => {
            const range = chartMax - chartMin;
            const points = Math.round(chartMin + (i * range / 4));
            return React.createElement("text", { key: i, x: padding - 10, y: yScale(points), fill: "#94a3b8", textAnchor: "end", className: "chart-text" }, points);
          }),

          // Lines
          players.map((player, playerIndex) => {
            const playerPoints = filteredConfidenceResults[player]?.pointsPerWeek;
            if (!playerPoints || playerPoints.length === 0) return null;
            
            return React.createElement(React.Fragment, { key: player },
              React.createElement("polyline", {
                key: `${player}-line-earned`,
                fill: "none",
                stroke: colors[playerIndex % colors.length],
                strokeWidth: 4,
                points: playerPoints.map(d => `${xScale(d.week)},${yScale(d.relativePoints)}`).join(' ')
              }),
              showPotential && React.createElement("polyline", {
                key: `${player}-line-potential`,
                fill: "none",
                stroke: colors[playerIndex % colors.length],
                strokeWidth: 4,
                strokeDasharray: "5,5",
                points: playerPoints.map(d => isFinite(d.relativePotentialPoints) ? `${xScale(d.week)},${yScale(d.relativePotentialPoints)}` : '').join(' ')
              })
            );
          }),

          // Labels
          finalLabels.map(label => (
            React.createElement("text", {
              key: `${label.player}-label`,
              x: plotAreaWidth + padding + 10,
              y: label.finalY,
              fill: label.color,
              className: "chart-text",
              textAnchor: "start",
              alignmentBaseline: "middle"
            }, label.value)
          )),

          // Active point
          activePoint && React.createElement("g", null,
            React.createElement("circle", { cx: activePoint.x, cy: activePoint.y, r: 5, fill: activePoint.color }),
            React.createElement("rect", { x: activePoint.x > chartWidth - 150 ? activePoint.x - 130 : activePoint.x + 10, y: activePoint.y - 20, width: 120, height: 40, fill: "#1e293b", stroke: activePoint.color, rx: 5 }),
            React.createElement("text", { x: activePoint.x > chartWidth - 150 ? activePoint.x - 120 : activePoint.x + 20, y: activePoint.y - 5, fill: "#fff", className: "chart-text" }, `${activePoint.player}`),
            React.createElement("text", { x: activePoint.x > chartWidth - 150 ? activePoint.x - 120 : activePoint.x + 20, y: activePoint.y + 10, fill: "#94a3b8", className: "chart-text" }, `W${activePoint.week}: ${activePoint.relativePoints} pts`)
          )
        )
      ),
      React.createElement("div", { className: "flex justify-end gap-2 mt-2" },
                      isMobile && navigator.share && React.createElement("button", {
                          onClick: shareChart,
                          className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
                          title: "Share"
                      }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
                          React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" })
                      )),          React.createElement("button", {
              onClick: downloadChart,
              className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
              title: "Export as PNG"
          }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
              React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" })
          ))
      ),
      React.createElement("div", { className: "flex justify-center mt-4" },
        React.createElement("button", {
          onClick: () => setShowPotential(!showPotential),
          className: `px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
            showPotential
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
          }`
        },
          showPotential ? "Hide Potential" : "Show Potential"
        )
      )
    )
  );
}

function CumulativePointsTable({ confidenceResults }) {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
    const players = Object.keys(confidenceResults);
    const weeks = confidenceResults[players[0]]?.pointsPerWeek.map(p => p.week) || [];

    const sortedWeeks = React.useMemo(() => {
        let sortableWeeks = [...weeks];
        if (sortConfig.key !== null) {
            sortableWeeks.sort((a, b) => {
                const aPoints = confidenceResults[sortConfig.key].pointsPerWeek.find(d => d.week === a)?.cumulativePoints || 0;
                const bPoints = confidenceResults[sortConfig.key].pointsPerWeek.find(d => d.week === b)?.cumulativePoints || 0;
                if (aPoints < bPoints) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aPoints > bPoints) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableWeeks;
    }, [weeks, sortConfig, confidenceResults]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    return (
        React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden mt-6" },
            React.createElement("h2", { className: "text-xl font-bold text-white mb-4 p-6" }, "Cumulative Points Table"),
            React.createElement("table", { className: "w-full" },
                React.createElement("thead", null,
                    React.createElement("tr", { className: "bg-slate-700/50 border-b border-slate-700" },
                        React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm" }, "Week"),
                        players.map(player => 
                            React.createElement("th", { key: player, className: "px-1 py-1 text-center text-white font-semibold text-sm cursor-pointer", onClick: () => requestSort(player) }, 
                                player,
                                sortConfig.key === player && (sortConfig.direction === 'ascending' ? ' \u25B2' : ' \u25BC')
                            )
                        )
                    )
                ),
                React.createElement("tbody", null,
                    sortedWeeks.map(week => (
                        React.createElement("tr", { key: week, className: "border-b border-slate-700/50 hover:bg-slate-700/20" },
                            React.createElement("td", { className: "px-1 py-1 text-white font-semibold" }, `Week ${week}`),
                            players.map(player => (
                                React.createElement("td", { key: player, className: "px-1 py-1 text-center text-slate-300" }, 
                                    confidenceResults[player].pointsPerWeek.find(d => d.week === week)?.relativePoints || 0
                                )
                            ))
                        )
                    ))
                )
            )
        )
    );
}

function GamesOfTheWeekPointsChart({ confidenceResults, allPicks, weeks, gamesOfTheWeek, includeLiveGames, gotwDisplayMode }) {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
      const handleResize = () => {
        setIsMobile(window.innerWidth < 768);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    const players = Object.keys(confidenceResults);

    const chartData = React.useMemo(() => {
        let data = players.map(player => {
            let value;
            switch (gotwDisplayMode) {
                case 'points_percentage':
                    const playedGotwGames = weeks.flatMap(w => w.games).filter(g => gamesOfTheWeek.includes(g.id) && (g.status === 'final' || g.status === 'post' || (includeLiveGames && (g.status === 'in' || g.status === 'live'))));
                    const possiblePoints = playedGotwGames.reduce((acc, game) => {
                        const pick = allPicks[player]?.find(p => p.gameId === game.id);
                        return acc + (pick ? Number(pick.confidence) + 5 : 0);
                    }, 0);
                    value = possiblePoints > 0 ? (confidenceResults[player].gotwPoints / possiblePoints) * 100 : 0;
                    break;
                case 'correct_percentage':
                    const playedGames = weeks.flatMap(w => w.games).filter(g => gamesOfTheWeek.includes(g.id) && (g.status === 'final' || g.status === 'post' || (includeLiveGames && (g.status === 'in' || g.status === 'live'))));
                    const correctPicks = playedGames.filter(game => {
                        const pick = allPicks[player]?.find(p => p.gameId === game.id);
                        if (!pick) return false;
                        const pickAbbreviation = teamAbbreviations[pick.pick] || pick.pick;
                        return pickAbbreviation === game.winner;
                    }).length;
                    value = playedGames.length > 0 ? (correctPicks / playedGames.length) * 100 : 0;
                    break;
                case 'absolute':
                default:
                    value = confidenceResults[player].gotwPoints;
                    break;
            }
            return { player, value};
        });

        // Sort data
        data.sort((a, b) => b.value - a.value);
        return data;

    }, [confidenceResults, allPicks, weeks, gamesOfTheWeek, includeLiveGames, gotwDisplayMode, players]);


    const maxPoints = gotwDisplayMode === 'absolute' ? Math.max(1, ...chartData.map(d => d.value)) : 100;

    const chartWidth = 800;
    const chartHeight = isMobile ? 800 : 400;
    const padding = 50;

    const xScale = (index) => padding + index * (chartWidth - 2 * padding) / (chartData.length - 1);
    const yScale = (points) => chartHeight - padding - (points / maxPoints) * (chartHeight - 2 * padding);

    const colors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#F0E442"];

    return (
        React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 p-6 mt-6" },
            React.createElement("svg", {
                viewBox: `0 0 ${chartWidth} ${chartHeight}`,
                className: "w-full h-auto"
            },
                // X-axis
                React.createElement("line", { x1: padding, y1: chartHeight - padding, x2: chartWidth - padding, y2: chartHeight - padding, stroke: "#64748b" }),
                chartData.map(({ player }, index) => (
                    React.createElement("text", { key: player, x: xScale(index), y: chartHeight - padding + 20, fill: "#94a3b8", textAnchor: "middle", className: "chart-text" }, player)
                )),

                // Y-axis
                /* React.createElement("line", { x1: padding, y1: padding, x2: padding, y2: chartHeight - padding, stroke: "#64748b" }),
                Array.from({ length: 5 }).map((_, i) => {
                    const points = Math.round(maxPoints / 4 * i);
                    return React.createElement("text", { key: i, x: padding - 10, y: yScale(points), fill: "#94a3b8", textAnchor: "end" }, `${points}${gotwDisplayMode !== 'absolute' ? '%' : ''}`);
                }), */

                // Bars
                chartData.map(({ player, value, potential }, index) => {
                    const barWidth = (chartWidth - 2 * padding) / chartData.length / 2;
                    const barX = xScale(index) - barWidth / 2;
                    const barHeight = chartHeight - padding - yScale(value);
                    const barY = yScale(value);

                    return (
                        React.createElement("g", { key: player },
                            React.createElement("rect", {
                                x: barX,
                                y: barY,
                                width: barWidth,
                                height: barHeight,
                                fill: colors[index % colors.length],
                                rx: 4 // rounded corners
                            }),
                            React.createElement("text", {
                                x: barX + barWidth / 2,
                                y: barY - 5,
                                fill: "#fff",
                                textAnchor: "middle",
                                className: "chart-text"
                            }, gotwDisplayMode === 'absolute' ? value : `${value.toFixed(1)}%`)
                        )
                    );
                })
            )
        )
    );
}

function GamesOfTheWeekPointsTable({ allPicks, confidenceResults, weeks, gamesOfTheWeek, includeLiveGames }) {
    const players = Object.keys(confidenceResults);

    const gotwGames = weeks.flatMap(weekData =>
        weekData.games
            .filter(game => gamesOfTheWeek.includes(game.id))
            .map(game => ({ ...game, week: weekData.week }))
    );

    return (
        React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden mt-6" },
            React.createElement("h2", { className: "text-xl font-bold text-white mb-4 p-6" }, "GotW Points Details"),
            React.createElement("table", { className: "w-full" },
                React.createElement("thead", null,
                    React.createElement("tr", { className: "bg-slate-700/50 border-b border-slate-700" },
                        React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm sticky top-0 bg-slate-800 z-10" }, "Week"),
                        React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm sticky top-0 bg-slate-800 z-10" }, "Game"),
                        players.map(player =>
                            React.createElement("th", { key: player, className: "px-1 py-1 text-center text-white font-semibold text-sm sticky top-0 bg-slate-800 z-10" }, player)
                        )
                    )
                ),
                React.createElement("tbody", null,
                    gotwGames.map(game => (
                        React.createElement("tr", { key: game.id, className: "border-b border-slate-700/50 hover:bg-slate-700/20" },
                            React.createElement("td", { className: "px-1 py-1 text-white" }, game.week),
                            React.createElement("td", { className: "px-1 py-1 text-white" }, `${game.away} @ ${game.home}`),
                            players.map(player => {
                                const playerPicks = allPicks[player];
                                const pick = playerPicks?.find(p => p.gameId === game.id);
                                if (!pick) return React.createElement("td", { key: player, className: "px-1 py-1 text-center text-slate-300" }, "-");

                                const isComplete = game.status === 'final' || game.status === 'post';
                                const isLiveGame = includeLiveGames && (game.status === 'in' || game.status === 'live');

                                let winner = null;
                                if (isComplete) {
                                    winner = game.winner;
                                } else if (includeLiveGames && isLiveGame) {
                                    if (game.homeScore > game.awayScore) winner = game.home;
                                    else if (game.awayScore > game.homeScore) winner = game.away;
                                }

                                const pickAbbreviation = teamAbbreviations[pick.pick] || pick.pick;
                                const isCorrect = winner === pickAbbreviation;

                                let points = 0;
                                if ((isComplete || (includeLiveGames && isLiveGame)) && isCorrect) {
                                    points = Number(pick.confidence) + 5;
                                }

                                return React.createElement("td", { key: player, className: "px-1 py-1 text-center text-slate-300" }, points);
                            })
                        )
                    ))
                )
            )
        )
    );
}

function WeeklyBarChart({ confidenceResults, selectedWeek, weeks: allWeeks, gamesOfTheWeek, weekPointsDisplayMode }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const chartRef = React.useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const downloadChart = () => {
    if (!chartRef.current) return;
    const svg = chartRef.current;

    const canvas = document.createElement("canvas");
    const bbox = svg.getBoundingClientRect();
    const width = bbox.width * 2;
    const height = bbox.height * 2;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);

    const style = `
      <style>
        .chart-text { font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; fill: #94a3b8; }
      </style>
    `;
    svgString = svgString.replace(/^<svg[^>]*>/, `$&${style}`);

    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, bbox.width, bbox.height);
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `Week_${selectedWeek}_Points_Chart.png`;
      link.href = pngUrl;
      link.click();
    };
    img.src = url;
  };

  const shareChart = () => {
    if (!chartRef.current) return;
    const svg = chartRef.current;

    const canvas = document.createElement("canvas");
    const bbox = svg.getBoundingClientRect();
    const width = bbox.width * 2;
    const height = bbox.height * 2;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);

    const style = `
      <style>
        .chart-text { font-size: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; fill: #94a3b8; }
      </style>
    `;
    svgString = svgString.replace(/^<svg[^>]*>/, `$&${style}`);

    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, bbox.width, bbox.height);
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(async (blob) => {
        if (blob) {
            const file = new File([blob], `Week_${selectedWeek}_Points_Chart.png`, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: `Week ${selectedWeek} Points`
                    });
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('Error sharing:', error);
                    }
                }
            }
        }
      }, 'image/png');
    };
    img.src = url;
  };



  const players = Object.keys(confidenceResults);
  const weekData = allWeeks.find(w => w.week === selectedWeek);

  const maxPointsPerWeek = React.useMemo(() => {
    const result = {};
    if (!allWeeks) return result;
    allWeeks.forEach(weekData => {
        const numGames = weekData.games.length;
        const gotwBonus = weekData.games.filter(g => gamesOfTheWeek.includes(g.id)).length * 5;
        result[weekData.week] = (numGames * (numGames + 1) / 2) + gotwBonus;
    });
    return result;
  }, [allWeeks, gamesOfTheWeek]);


  const chartData = React.useMemo(() => {
    if (!weekData) return [];

    let data = players.map(player => {
      let value = 0;
      const playerWeekPoints = confidenceResults[player]?.pointsPerWeek.find(p => p.week === selectedWeek);
      const playerCorrectPicks = confidenceResults[player]?.correctPicksPerWeek.find(p => p.week === selectedWeek);
      const remainingPossible = confidenceResults[player]?.remainingPossible || 0;

      switch (weekPointsDisplayMode) {
        case 'absolute':
          value = playerWeekPoints?.points || 0;
          break;
        case 'points_percentage':
          const possiblePoints = maxPointsPerWeek[selectedWeek] || 0;
          value = possiblePoints > 0 ? ((playerWeekPoints?.points || 0) / possiblePoints) * 100 : 0;
          break;
        case 'correct_percentage':
          const numGames = weekData.games.length;
          value = numGames > 0 ? ((playerCorrectPicks?.correctPicks || 0) / numGames) * 100 : 0;
          break;
        case 'vs_leader':
        case 'vs_total_leader':
          value = playerWeekPoints?.points || 0;
          break;
        default:
          break;
      }
      return { player, value , potential: remainingPossible };
    });

    if (weekPointsDisplayMode === 'vs_leader') {
      const leader = data.reduce((l, p) => (p.value || 0) > (l.value || 0) ? p : l, data[0] || { value: 0, potential: 0 });
      const leaderTotalPotential = (leader.value || 0) + (leader.potential || 0);

      data = data.map(d => {
        const playerTotalPotential = (d.value || 0) + (d.potential || 0);
        return {
          ...d,
          value: (d.value || 0) - (leader.value || 0), // Relative earned points
          potential_top: playerTotalPotential - leaderTotalPotential // Relative total potential
        };
      });
    }

    if (weekPointsDisplayMode === 'vs_total_leader') {
        let totalLeaderName = '';
        let maxTotalPoints = -1;

        players.forEach(player => {
            const playerWeekData = confidenceResults[player]?.pointsPerWeek.find(p => p.week === selectedWeek);
            if (playerWeekData && playerWeekData.cumulativePoints > maxTotalPoints) {
                maxTotalPoints = playerWeekData.cumulativePoints;
                totalLeaderName = player;
            }
        });

        // Find the total leader's data for the current week from the 'data' array
        const totalLeaderData = data.find(d => d.player === totalLeaderName);
        const totalLeaderWeeklyPoints = totalLeaderData?.value || 0;
        const totalLeaderPotential = totalLeaderData?.potential || 0;
        const leaderTotalPotential = totalLeaderWeeklyPoints + totalLeaderPotential;

        data = data.map(d => {
            const playerTotalPotential = (d.value || 0) + (d.potential || 0);
            return {
                ...d,
                value: (d.value || 0) - totalLeaderWeeklyPoints, // Relative earned points
                potential_top: playerTotalPotential - leaderTotalPotential // Relative total potential
            }
        });
    }

    if (weekPointsDisplayMode === 'vs_total_leader') {
        // Find leader name again to use for sorting
        let totalLeaderName = '';
        let maxTotalPoints = -1;
        players.forEach(player => {
            const playerWeekData = confidenceResults[player]?.pointsPerWeek.find(p => p.week === selectedWeek);
            if (playerWeekData && playerWeekData.cumulativePoints > maxTotalPoints) {
                maxTotalPoints = playerWeekData.cumulativePoints;
                totalLeaderName = player;
            }
        });
        
        data.sort((a, b) => {
            if (a.player === totalLeaderName) return -1;
            if (b.player === totalLeaderName) return 1;
            return b.value - a.value;
        });
    } else {
        // For all other modes, sort by value descending
        data.sort((a, b) => b.value - a.value);
    }


    return data;
  }, [confidenceResults, selectedWeek, allWeeks, gamesOfTheWeek, weekPointsDisplayMode, players, maxPointsPerWeek, weekData]);

  const isVsMode = weekPointsDisplayMode === 'vs_leader' || weekPointsDisplayMode === 'vs_total_leader';

  const dataMax = isVsMode
    ? Math.max(0, ...chartData.map(d => d.potential_top ?? d.value))
    : (weekPointsDisplayMode === 'absolute'
        ? Math.max(1, ...chartData.map(d => d.value + (d.potential || 0)))
        : 100);

  const dataMin = isVsMode
    ? Math.min(0, ...chartData.map(d => d.value))
    : 0;

  const { chartMin, chartMax } = React.useMemo(() => {
    const range = dataMax - dataMin;
    // New, more aggressive buffer: 20% of the range PLUS a fixed 10 points.
    const buffer = (range * 0.2) + 10; 

    if (isVsMode) {
      return { chartMin: dataMin - buffer, chartMax: dataMax + buffer };
    }
    if (weekPointsDisplayMode === 'absolute') {
      return { chartMin: dataMin, chartMax: dataMax + buffer };
    }
    return { chartMin: dataMin, chartMax: dataMax };
  }, [dataMin, dataMax, isVsMode, weekPointsDisplayMode]);

  const chartWidth = 800;
  const chartHeight = isMobile ? 800 : 400;
  const padding = 50;

  const yScale = (points) => {
    const range = chartMax - chartMin;
    if (range === 0) {
        return chartHeight / 2;
    }
    return chartHeight - padding - ((points - chartMin) / range) * (chartHeight - 2 * padding);
  };
  
  const colors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#F0E442"];

  if (isVsMode) {
    // --- GROUPED BAR CHART for 'vs' modes ---
    const groupWidth = (chartWidth - 2 * padding) / chartData.length;
    const barPadding = 4;
    const originalBarWidth = Math.max(1, (groupWidth / 2) - barPadding); // Old barWidth
    const singleBarWidth = originalBarWidth / 2; // New, narrower bar width
    const xScale = (index) => padding + index * groupWidth;

    return (
      React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 p-6 mt-6" },
        React.createElement("svg", { ref: chartRef, viewBox: `0 0 ${chartWidth} ${chartHeight}`, className: "w-full h-auto" },
          // Legend
          React.createElement("g", { transform: `translate(${padding}, 30)` },
              React.createElement("g", { transform: `translate(0, 0)` },
                  React.createElement("rect", { x: 0, y: -10, width: 10, height: 10, fill: "white" }),
                  React.createElement("text", { x: 15, y: 0, fill: "#94a3b8", className: "chart-text" }, "Earned Diff.")
              ),
              React.createElement("g", { transform: `translate(150, 0)` },
                  React.createElement("rect", { x: 0, y: -10, width: 10, height: 10, fill: "transparent", stroke: "white", strokeWidth: 1 }),
                  React.createElement("text", { x: 15, y: 0, fill: "#94a3b8", className: "chart-text" }, "Potential Diff.")
              )
          ),
          // Y-Axis
          Array.from({ length: 5 }).map((_, i) => {
              const range = chartMax - chartMin;
              const point = chartMin + (i * range / 4);
              return React.createElement("text", { key: i, x: padding - 10, y: yScale(point), fill: "#94a3b8", textAnchor: "end", className: "chart-text" }, point.toFixed(0));
          }),
          // X-Axis Line & Zero Line
          React.createElement("line", { x1: padding, y1: chartHeight - padding, x2: chartWidth - padding, y2: chartHeight - padding, stroke: "#64748b" }),
          React.createElement("line", { x1: padding, y1: yScale(0), x2: chartWidth - padding, y2: yScale(0), stroke: "#64748b", strokeDasharray: "5,5" }),

          // Bars and Labels
          chartData.map(({ player, value, potential_top }, index) => {
            const playerIndex = players.indexOf(player);
            const color = colors[playerIndex % colors.length];
            const groupX = xScale(index);
            const playerLabel = React.createElement("text", { x: groupX + groupWidth / 2, y: chartHeight - padding + 20, fill: "#94a3b8", textAnchor: "middle", className: "chart-text" }, player);

            // Special handling for the leader
            if (value === 0 && potential_top === 0) {
                const leaderLabel = React.createElement("text", {
                    key: `${player}-leader-label`,
                    x: groupX + groupWidth / 2,
                    y: yScale(0) - 5,
                    fill: "#fff", textAnchor: "middle", className: "chart-text"
                }, "0");
                return React.createElement("g", { key: player }, playerLabel, leaderLabel);
            }

            // Layout for other players


            // Calculate new X positions for the two bars to be centered in their group
            const totalGroupBarWidth = (singleBarWidth * 2) + barPadding;
            const groupBarStartX = groupX + (groupWidth / 2) - (totalGroupBarWidth / 2);

            const bar1X = groupBarStartX;
            const bar2X = groupBarStartX + singleBarWidth + barPadding;
            
            let earnedBar, potentialBar, earnedLabel, potentialLabel;

            // Bar 1: Earned Difference
            if (typeof value !== 'undefined') {
                earnedBar = React.createElement("rect", {
                    key: `${player}-earned-bar`,
                    x: bar1X,
                    y: value >= 0 ? yScale(value) : yScale(0),
                    width: singleBarWidth,
                    height: Math.abs(yScale(0) - yScale(value)),
                    fill: color,
                    rx: 4
                });
                earnedLabel = React.createElement("text", {
                    key: `${player}-earned-label`,
                    x: bar1X + singleBarWidth / 2,
                    y: yScale(value) + (value < 0 ? 15 : -5),
                    fill: "#fff", textAnchor: "middle", className: "chart-text"
                }, value.toFixed(0));
            }

            // Bar 2: Potential Difference (Half-width and Hollow)
            if (typeof potential_top !== 'undefined') {
                potentialBar = React.createElement("rect", {
                    key: `${player}-potential-bar`,
                    x: bar2X,
                    y: potential_top >= 0 ? yScale(potential_top) : yScale(0),
                    width: singleBarWidth,
                    height: Math.abs(yScale(0) - yScale(potential_top)),
                    fill: 'transparent',
                    stroke: color,
                    strokeWidth: 2,
                    rx: 4
                });
                potentialLabel = React.createElement("text", {
                    key: `${player}-potential-label`,
                    x: bar2X + singleBarWidth / 2,
                    y: yScale(potential_top) + (potential_top < 0 ? 15 : -5),
                    fill: "#a0a0a0", textAnchor: "middle", className: "chart-text"
                }, potential_top.toFixed(0));
            }

            return React.createElement("g", { key: player },
                playerLabel,
                earnedBar,
                potentialBar,
                earnedLabel,
                potentialLabel
            );
          })
        ),
        React.createElement("div", { className: "flex justify-end gap-2 mt-2" },
            isMobile && navigator.share && React.createElement("button", {
                onClick: shareChart,
                className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
                title: "Share"
            }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
                React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" })
            )),
            React.createElement("button", {
                onClick: downloadChart,
                className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
                title: "Export as PNG"
            }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
                React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" })
            ))
        )
      )
    );
  } else {
    // --- STACKED/ABSOLUTE BAR CHART (existing logic) ---
    const barWidth = (chartWidth - 2 * padding) / chartData.length / 1.5;
    const xScale = (index) => padding + index * (chartWidth - 2 * padding) / chartData.length + (barWidth / 2);

    return (
      React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 p-6 mt-6" },
        React.createElement("svg", { ref: chartRef, viewBox: `0 0 ${chartWidth} ${chartHeight}`, className: "w-full h-auto" },
          // X-Axis
          React.createElement("line", { x1: padding, y1: chartHeight - padding, x2: chartWidth - padding, y2: chartHeight - padding, stroke: "#64748b" }),
          chartData.map(({ player }, index) => React.createElement("text", { key: player, x: xScale(index), y: chartHeight - padding + 20, fill: "#94a3b8", textAnchor: "middle", className: "chart-text" }, player)),
          // Y-Axis
          Array.from({ length: 5 }).map((_, i) => {
              const point = (chartMax / 4) * i;
              return React.createElement("text", { key: i, x: padding - 10, y: yScale(point), fill: "#94a3b8", textAnchor: "end", className: "chart-text" }, `${point.toFixed(0)}${weekPointsDisplayMode !== 'absolute' ? '%' : ''}`);
          }),
          // Bars and Labels
          chartData.map(({ player, value, potential }, index) => {
            const playerIndex = players.indexOf(player);
            const color = colors[playerIndex % colors.length];
            const barX = xScale(index) - barWidth / 2;
            let earnedBar = null, earnedLabel = null, potentialBar = null, potentialLabel = null;

            const barY = yScale(value);
            const barHeight = chartHeight - padding - barY;
            
            earnedBar = React.createElement("rect", { key: `${player}-earned-bar`, x: barX, y: barY, width: barWidth, height: barHeight, fill: color, rx: 4 });
            earnedLabel = React.createElement("text", { key: `${player}-earned-label`, x: barX + barWidth / 2, y: barY - 5, fill: "#fff", textAnchor: "middle", className: "chart-text" }, weekPointsDisplayMode === 'absolute' ? value.toFixed(0) : `${value.toFixed(1)}%`);

            if (weekPointsDisplayMode === 'absolute' && potential && potential > 0) {
                potentialLabel = React.createElement("text", { key: `${player}-potential-label`, x: barX + barWidth / 2, y: yScale(value + potential) - 5, fill: "#a0a0a0", textAnchor: "middle", className: "chart-text" }, (value + potential).toFixed(0));
                potentialBar = React.createElement("rect", { key: `${player}-potential-bar`, x: barX, y: yScale(value + potential), width: barWidth, height: yScale(value) - yScale(value + potential), fill: "transparent", stroke: color, strokeWidth: 2, rx: 4 });
            }

            return React.createElement("g", { key: player }, earnedBar, potentialBar, earnedLabel, potentialLabel);
          })
        ),
        React.createElement("div", { className: "flex justify-end gap-2 mt-2" },
            isMobile && navigator.share && React.createElement("button", {
                onClick: shareChart,
                className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
                title: "Share"
            }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
                React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" })
            )),
            React.createElement("button", {
                onClick: downloadChart,
                className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
                title: "Export as PNG"
            }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
                React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" })
            ))
        )
      )
    );
  }
}

function ConfidencePicksSummaryTable({ games, showDisagreement }) {
  const [sortConfig, setSortConfig] = useState({ key: 'aggConfidence', direction: 'ascending' });

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? ' \u25B2' : ' \u25BC';
    }
    return null;
  };

  const summaryGames = React.useMemo(() => {
    const validGames = games.filter(game => game.aggConfidence !== Infinity);
    
    if (sortConfig.key !== null) {
        validGames.sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (aValue < bValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });
    }
    
    return validGames;
  }, [games, sortConfig]);

  if (summaryGames.length === 0) {
    return null;
  }

  return (
    React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden mb-6" },

      React.createElement("div", { className: "overflow-x-auto" },
        React.createElement("table", { className: "w-full" },
          React.createElement("thead", null,
            React.createElement("tr", { className: "bg-slate-700/50 border-b border-slate-700" },
              React.createElement("th", { className: "px-1 py-0 text-center text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('aggConfidence') }, "Agg Pick", getSortIndicator('aggConfidence')),
              React.createElement("th", { className: "px-1 py-0 text-center text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('fpiConfidence') }, "FPI Pick", getSortIndicator('fpiConfidence')),
              React.createElement("th", { className: "px-1 py-0 text-center text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('mlConfidence') }, "ML Pick", getSortIndicator('mlConfidence'))
            )
          ),
          React.createElement("tbody", null,
            summaryGames.map(game => {
              const aggPickWP = game.aggPick === game.away ? game.aggAwayWP : game.aggHomeWP;
              const fpiPickWP = game.fpiPick === game.away
                ? (game.initialAwayWinProbability ?? game.awayWinProbability)
                : (game.initialHomeWinProbability ?? game.homeWinProbability);
              const mlPickWP = game.mlPick === game.away ? game.awayML_WP : game.homeML_WP;

              return (
                React.createElement("tr", { key: game.id, className: "border-b border-slate-700/50 hover:bg-slate-700/20" },
                  React.createElement("td", { className: "px-1 py-0 text-white" },
                    React.createElement("div", { className: "flex items-center justify-center gap-4" },
                      React.createElement("span", { className: "font-bold text-lg" }, game.aggConfidence),
                      React.createElement("div", { className: "flex flex-col items-center text-center" },
                        game.aggPick ? React.createElement("img", {
                          src: `https://a.espncdn.com/i/teamlogos/nfl/500/${game.aggPick.toLowerCase()}.png`,
                          alt: game.aggPick,
                          className: "w-8 h-8 mx-auto",
                          onError: (e) => { e.target.src = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png?w=100&h=100&transparent=true'; }
                        }) : React.createElement("div", { className: "w-8 h-8 mx-auto" }, "-"),
                        React.createElement("div", { className: "text-xs text-slate-400 mt-1" }, aggPickWP ? `${aggPickWP.toFixed(1)}%` : "N/A"),
                        showDisagreement === 'wp' && game.modelDisagreement !== null && React.createElement("div", { className: "text-xs text-slate-400 mt-1" }, `(${game.modelDisagreement.toFixed(1)}%)`),
                        showDisagreement === 'confidence' && game.confidenceDisagreement !== null && React.createElement("div", { className: "text-xs text-slate-400 mt-1" }, `(${game.confidenceDisagreement})`)
                      )
                    )
                  ),
                  React.createElement("td", { className: "px-1 py-0 text-white" },
                    React.createElement("div", { className: "flex items-center justify-center gap-4" },
                      React.createElement("span", { className: "font-bold text-lg" }, game.fpiConfidence === Infinity ? "N/A" : game.fpiConfidence),
                      React.createElement("div", { className: "flex flex-col items-center text-center" },
                        game.fpiPick ? React.createElement("img", {
                          src: `https://a.espncdn.com/i/teamlogos/nfl/500/${game.fpiPick.toLowerCase()}.png`,
                          alt: game.fpiPick,
                          className: "w-8 h-8 mx-auto",
                          onError: (e) => { e.target.src = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png?w=100&h=100&transparent=true'; }
                        }) : React.createElement("div", { className: "w-8 h-8 mx-auto" }, "-"),
                        React.createElement("span", { className: "text-xs text-slate-400 mt-1" }, fpiPickWP ? `${fpiPickWP.toFixed(1)}%` : "N/A")
                      )
                    )
                  ),
                  React.createElement("td", { className: "px-1 py-0 text-white" },
                    React.createElement("div", { className: "flex items-center justify-center gap-4" },
                      React.createElement("span", { className: "font-bold text-lg" }, game.mlConfidence === Infinity ? "N/A" : game.mlConfidence),
                      React.createElement("div", { className: "flex flex-col items-center text-center" },
                        game.mlPick ? React.createElement("img", {
                          src: `https://a.espncdn.com/i/teamlogos/nfl/500/${game.mlPick.toLowerCase()}.png`,
                          alt: game.mlPick,
                          className: "w-8 h-8 mx-auto",
                          onError: (e) => { e.target.src = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png?w=100&h=100&transparent=true'; }
                        }) : React.createElement("div", { className: "w-8 h-8 mx-auto" }, "-"),
                        React.createElement("span", { className: "text-xs text-slate-400 mt-1" }, mlPickWP ? `${(mlPickWP * 100).toFixed(1)}%` : "N/A")
                      )
                    )
                  )
                )
              )
            })
          )
        )
      )
    )
  );
}

function OddsTable({ weeks, selectedWeek, showDisagreement, setShowDisagreement }) {
  const [sortConfig, setSortConfig] = useState({ key: 'fpiConfidence', direction: 'ascending' });

  if (!selectedWeek) return null;

  const weekData = weeks.find(w => w.week === selectedWeek);

  if (!weekData) {
    return React.createElement("div", { className: "text-white text-center py-10" }, "Data for this week is not available yet.");
  }

  const sortedGames = React.useMemo(() => {
    let sortableGames = calculateGameConfidence([...weekData.games]);

    if (sortConfig.key !== null) {
      sortableGames.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle N/A or null values
        if (aValue === null || aValue === "N/A" || aValue === Infinity || isNaN(aValue)) aValue = sortConfig.direction === 'ascending' ? Infinity : -Infinity;
        if (bValue === null || bValue === "N/A" || bValue === Infinity || isNaN(bValue)) bValue = sortConfig.direction === 'ascending' ? Infinity : -Infinity;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return sortableGames;
  }, [weekData.games, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? ' \u25B2' : ' \u25BC';
    }
    return null;
  };

  return (
    React.createElement(React.Fragment, null,
      React.createElement(ConfidencePicksSummaryTable, { games: sortedGames, showDisagreement: showDisagreement }),
      React.createElement("div", { className: "flex justify-end mb-2" },
        React.createElement("button", {
          onClick: () => {
            const modes = ['hidden', 'wp', 'confidence'];
            const nextIndex = (modes.indexOf(showDisagreement) + 1) % modes.length;
            setShowDisagreement(modes[nextIndex]);
          },
          className: `px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
            showDisagreement !== 'hidden'
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700'
          }`
        },
          showDisagreement === 'hidden' ? 'Show Disagreement' : `Disagreement: ${showDisagreement.toUpperCase()}`
        )
      ),
      React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden" },
        React.createElement("h2", { className: "text-xl font-bold text-white p-6" }, `Full Data for Week ${selectedWeek}`),
        React.createElement("div", { className: "overflow-x-auto" },
          React.createElement("table", { className: "w-full" },
            React.createElement("thead", null,
              React.createElement("tr", { className: "bg-slate-700/50 border-b border-slate-700" },
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('away') }, "Game", getSortIndicator('away')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('awayWinProbability') }, "Away FPI WP", getSortIndicator('awayWinProbability')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('homeWinProbability') }, "Home FPI WP", getSortIndicator('homeWinProbability')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('absDiff') }, "Abs FPI Diff", getSortIndicator('absDiff')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('fpiConfidence') }, "FPI Conf.", getSortIndicator('fpiConfidence')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('fpiPick') }, "FPI Pick", getSortIndicator('fpiPick')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('awayMoneyLine') }, "Away ML", getSortIndicator('awayMoneyLine')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('homeMoneyLine') }, "Home ML", getSortIndicator('homeMoneyLine')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('awayML_WP') }, "Away ML WP", getSortIndicator('awayML_WP')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('homeML_WP') }, "Home ML WP", getSortIndicator('homeML_WP')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('absMlDiff') }, "Abs ML Diff", getSortIndicator('absMlDiff')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('mlConfidence') }, "ML Conf.", getSortIndicator('mlConfidence')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('mlPick') }, "ML Pick", getSortIndicator('mlPick')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('aggAwayWP') }, "Agg Away WP", getSortIndicator('aggAwayWP')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('aggHomeWP') }, "Agg Home WP", getSortIndicator('aggHomeWP')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('aggAbsDiff') }, "Agg Abs Diff", getSortIndicator('aggAbsDiff')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('aggConfidence') }, "Agg Conf.", getSortIndicator('aggConfidence')),
                React.createElement("th", { className: "px-1 py-1 text-left text-white font-semibold text-sm cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestSort('aggPick') }, "Agg Pick", getSortIndicator('aggPick'))
              )
            ),
            React.createElement("tbody", null,
              sortedGames.map(game => {
                const absDiffDisplay = game.absDiff !== -1 ? game.absDiff.toFixed(1) + '%' : "N/A";
                const absMlDiffDisplay = game.absMlDiff !== -1 ? `${(game.absMlDiff * 100).toFixed(1)}%` : "N/A";

                return (
                  React.createElement("tr", { key: game.id, className: "border-b border-slate-700/50 hover:bg-slate-700/20" },
                    React.createElement("td", { className: "px-1 py-1 text-white" }, `${game.away} @ ${game.home}`),
                    React.createElement("td", { className: "px-1 py-1 text-white" },
                      (game.initialAwayWinProbability ?? game.awayWinProbability) ? `${(game.initialAwayWinProbability ?? game.awayWinProbability).toFixed(1)}%` : "N/A"
                    ),
                    React.createElement("td", { className: "px-1 py-1 text-white" },
                      (game.initialHomeWinProbability ?? game.homeWinProbability) ? `${(game.initialHomeWinProbability ?? game.homeWinProbability).toFixed(1)}%` : "N/A"
                    ),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, absDiffDisplay),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.fpiConfidence === Infinity ? "N/A" : game.fpiConfidence),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.fpiPick || "N/A"),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.awayMoneyLine || "N/A"),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.homeMoneyLine || "N/A"),
                    React.createElement("td", { className: "px-1 py-1 text-white" },
                      game.awayML_WP ? `${(game.awayML_WP * 100).toFixed(1)}%` : "N/A"
                    ),
                    React.createElement("td", { className: "px-1 py-1 text-white" },
                      game.homeML_WP ? `${(game.homeML_WP * 100).toFixed(1)}%` : "N/A"
                    ),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, absMlDiffDisplay),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.mlConfidence === Infinity ? "N/A" : game.mlConfidence),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.mlPick || "N/A"),
                    React.createElement("td", { className: "px-1 py-1 text-white" },
                      game.aggAwayWP ? `${game.aggAwayWP.toFixed(1)}%` : "N/A"
                    ),
                    React.createElement("td", { className: "px-1 py-1 text-white" },
                      game.aggHomeWP ? `${game.aggHomeWP.toFixed(1)}%` : "N/A"
                    ),
                    React.createElement("td", { className: "px-1 py-1 text-white" },
                      game.aggAbsDiff !== -1 ? `${game.aggAbsDiff.toFixed(1)}%` : "N/A"
                    ),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.aggConfidence === Infinity ? "N/A" : game.aggConfidence),
                    React.createElement("td", { className: "px-1 py-1 text-white" }, game.aggPick || "N/A")
                  )
                )
              })
            )
          )
        )
      )
    )
  );
}

function NFLScoresTracker() {
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('week-overview');
  const [includeLiveGames, setIncludeLiveGames] = useState(true);
  const [mockPicks, setMockPicks] = useState({});
  const [gamesOfTheWeek, setGamesOfTheWeek] = useState([]);
  const [deviationData, setDeviationData] = useState([]);
  const [deviationSortConfig, setDeviationSortConfig] = useState({ key: null, direction: 'ascending' });
  const [playerSortConfig, setPlayerSortConfig] = useState({ key: null, direction: 'ascending' });
  const [showLogos, setShowLogos] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showModelPicks, setShowModelPicks] = useState(false);
    const [activeChartTab, setActiveChartTab] = useState('cumulative-points');
    const [pointsPerWeekDisplayMode, setPointsPerWeekDisplayMode] = useState('absolute');
      const [gotwDisplayMode, setGotwDisplayMode] = useState('absolute');
      const [showDisagreement, setShowDisagreement] = useState('hidden'); // 'hidden', 'wp', 'confidence'
      const [fpiData, setFpiData] = useState({});
      const [matchupQualitySortConfig, setMatchupQualitySortConfig] = useState({ key: null, direction: 'ascending' });    
      const [weekPointsDisplayMode, setWeekPointsDisplayMode] = useState('absolute');
      const weekOverviewRef = React.useRef(null);

      const downloadOverview = () => {
        if (!weekOverviewRef.current) return;
        
        const table = weekOverviewRef.current.querySelector('table');
        if (!table) return;

        const fullWidth = table.scrollWidth + 10;
        const fullHeight = table.scrollHeight + 10; // Reduced height padding as well

        window.html2canvas(table, { // Target the table directly
            backgroundColor: '#1e293b', // slate-800
            scale: 2,
            useCORS: true,
            width: fullWidth,
            height: fullHeight,
            windowWidth: fullWidth,
            onclone: (clonedDoc) => {
                // Fix sticky headers (these are on TH elements)
                const stickyElements = clonedDoc.querySelectorAll('.sticky');
                stickyElements.forEach(el => {
                    el.style.position = 'static';
                });

                // The table itself is the target, so no need to adjust its parents' overflow. 
                // However, the cloned table might inherit styles from cloned parents, 
                // so ensure the table itself has fit-content width if needed.
                const clonedTable = clonedDoc.querySelector('table');
                if (clonedTable) {
                    clonedTable.style.width = 'fit-content';
                }
            }
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Week_${selectedWeek}_Overview.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
      };
  
      const shareOverview = () => {
        if (!weekOverviewRef.current) return;

        const table = weekOverviewRef.current.querySelector('table');
        if (!table) return;

        const fullWidth = table.scrollWidth + 10;
        const fullHeight = table.scrollHeight + 10;

        window.html2canvas(table, {
            backgroundColor: '#1e293b', // slate-800
            scale: 2,
            useCORS: true,
            width: fullWidth,
            height: fullHeight,
            windowWidth: fullWidth,
            onclone: (clonedDoc) => {
                // Fix sticky headers
                const stickyElements = clonedDoc.querySelectorAll('.sticky');
                stickyElements.forEach(el => {
                    el.style.position = 'static';
                });

                const clonedTable = clonedDoc.querySelector('table');
                if (clonedTable) {
                    clonedTable.style.width = 'fit-content';
                }
            }
        }).then(canvas => {
            canvas.toBlob(async (blob) => {
              if (blob) {
                  const file = new File([blob], `Week_${selectedWeek}_Overview.png`, { type: "image/png" });
                  const shareData = {
                      files: [file],
                      title: `Week ${selectedWeek} Overview`
                  };

                  if (navigator.share) {
                      if (navigator.canShare && navigator.canShare({ files: [file] })) {
                          try {
                              await navigator.share(shareData);
                          } catch (error) {
                              if (error.name !== 'AbortError') {
                                  console.error('Error sharing:', error);
                                  alert(`Error sharing: ${error.message}`);
                              }
                          }
                      } else {
                          console.error("Your browser doesn't support sharing this file.");
                          alert("Your browser says it cannot share this generated image (canShare=false). It might be too large.");
                      }
                  } else {
                      console.log("Web Share API not supported.");
                      alert("Web Share API not supported on this browser.");
                  }
              } else {
                  alert("Failed to create image blob.");
              }
            }, 'image/png');
        }).catch(err => {
            console.error("html2canvas error:", err);
            alert(`Image generation failed: ${err.message}`);
        });
      };

                  const transformEspnData = (data, fpiDataMap) => {
                    return data.events.map(event => {
                      const competition = event.competitions[0];
                      const homeTeam = competition.competitors.find(t => t.homeAway === 'home');
                      const awayTeam = competition.competitors.find(t => t.homeAway === 'away');
                
                                              const homeTeamFpi = fpiDataMap[homeTeam.team.abbreviation];
                
                                              const awayTeamFpi = fpiDataMap[awayTeam.team.abbreviation];
                
                                        
                
                                              const matchupQuality = (homeTeamFpi !== undefined && awayTeamFpi !== undefined)
                
                                                ? (homeTeamFpi + awayTeamFpi) / 2
                
                                                : null;
                      return {
                        id: parseInt(event.id),
                        date: event.date,
                        home: homeTeam.team.abbreviation,
                        away: awayTeam.team.abbreviation,
                        status: event.status.type.state,            winner: (event.status.type.state === 'post' || event.status.type.state === 'final')
              ? (parseInt(homeTeam.score) > parseInt(awayTeam.score) ? homeTeam.team.abbreviation : (parseInt(awayTeam.score) > parseInt(homeTeam.score) ? awayTeam.team.abbreviation : null))
              : null,
            homeScore: parseInt(homeTeam.score),
            awayScore: parseInt(awayTeam.score),
            displayClock: event.status.type.detail, // Assuming this path for clock
            period: event.status.period, // Assuming this path for period
            matchupQuality: matchupQuality
          };
        });
      };

  const fetchScores = async () => {
    setLoading(true);
    setError(null);
    try {
      const gamesOfTheWeekResponse = await fetch('data/games_of_the_week.txt').then(res => res.text());
      const gamesOfTheWeekIds = gamesOfTheWeekResponse.split(",").map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      setGamesOfTheWeek(gamesOfTheWeekIds);

      // Load FPI data from local file
      const fpiDataResponse = await fetch('fpi_data.json').then(res => res.json());
      const fpiDataMap = fpiDataResponse.reduce((map, team) => {
        const teamAbbr = teamAbbreviations[team.team];
        if (teamAbbr) {
          map[teamAbbr] = team.fpi;
        }
        return map;
      }, {});
      setFpiData(fpiDataMap);


      const weekPromises = Array.from({ length: 18 }, (_, i) => i + 1).map(weekNum =>
        fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${weekNum}`)
          .then(res => res.json())
          .then(data => ({ week: weekNum, games: transformEspnData(data, fpiDataMap) }))
      );
      const allWeeks = await Promise.all(weekPromises);
      setWeeks(allWeeks);
      if (allWeeks.length > 0 && !selectedWeek) {
        const seasonOrigin = new Date('2025-09-04');
        const today = new Date();
        seasonOrigin.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const dayDiff = (today - seasonOrigin) / (1000 * 60 * 60 * 24);
        const currentWeek = Math.ceil((dayDiff + 1) / 7);
        const maxWeek = allWeeks[allWeeks.length - 1].week;
        const defaultWeek = Math.max(1, Math.min(currentWeek, maxWeek));
        setSelectedWeek(defaultWeek);
      }

      // Fetch win probabilities for all games across all weeks
      const allGamesWithSummaryPromises = allWeeks.flatMap(weekData =>
        weekData.games.map(async (game) => {
          try {
            const summaryResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.id}`);
            const summaryData = await summaryResponse.json();
            if (game.id === 401547394) { // Log summary for a specific game to avoid flooding the console
                console.log(summaryData);
            }
            
            // Debug logging for Moneyline investigation
            // console.log(`Game ${game.id} Summary Data:`, JSON.stringify(summaryData).substring(0, 500) + "..."); 

            let homeWinProbability = null;
            let awayWinProbability = null;
            let initialHomeWinProbability = null;
            let initialAwayWinProbability = null;
            
            // Fetch odds from new endpoint
            const oddsData = await fetchOdds(game.id);
            let homeMoneyLine = oddsData.homeMoneyLine;
            let awayMoneyLine = oddsData.awayMoneyLine;

            const gameStatus = game.status;

            if (gameStatus === 'scheduled' || gameStatus === 'pre') {
                // For games that have not started, use the predictor
                if (summaryData.predictor && summaryData.predictor.homeTeam && summaryData.predictor.awayTeam) {
                    homeWinProbability = summaryData.predictor.homeTeam.gameProjection * 1;
                    awayWinProbability = summaryData.predictor.awayTeam.gameProjection * 1;
                    initialHomeWinProbability = homeWinProbability;
                    initialAwayWinProbability = awayWinProbability;
                }
            } else { // Game is 'in', 'live', 'post', or other state
                if (summaryData.winprobability && summaryData.winprobability.length > 0) {
                    const winProbabilities = summaryData.winprobability;
                    const firstWinProbability = winProbabilities[0];

                    initialHomeWinProbability = firstWinProbability.homeWinPercentage * 100;
                    initialAwayWinProbability = (1 - firstWinProbability.homeWinPercentage) * 100;
            
                    if (game.status === 'post') {
                        homeWinProbability = winProbabilities[0].homeWinPercentage * 100;
                        awayWinProbability = (1 - winProbabilities[0].homeWinPercentage) * 100;
                    } else if (game.status === 'in' || game.status === 'live') {
                        const latestWinProbability = winProbabilities[winProbabilities.length - 1];
                        homeWinProbability = latestWinProbability.homeWinPercentage * 100;
                        awayWinProbability = (1 - latestWinProbability.homeWinPercentage) * 100;
                    }
                }
            }

            return { ...game, homeWinProbability, awayWinProbability, initialHomeWinProbability, initialAwayWinProbability, homeMoneyLine, awayMoneyLine };
          } catch (summaryError) {
            return game; // Return original game if summary fetch fails
          }
        })
      );
      const allGamesWithSummaries = await Promise.all(allGamesWithSummaryPromises);

      const updatedWeeks = allWeeks.map(weekData => ({
        ...weekData,
        games: weekData.games.map(game => {
          const summaryGame = allGamesWithSummaries.find(sg => sg.id === game.id);
          return summaryGame || game;
        })
      }));
      setWeeks(updatedWeeks);

      // When using live data, we still need mock picks
      const picksResponse = await fetch('picks.json').then(res => res.json());
      const transformedPicks = {};
      picksResponse.forEach(pick => {
        if (!transformedPicks[pick.name]) {
          transformedPicks[pick.name] = [];
        }
        transformedPicks[pick.name].push({
          gameId: pick.game_id,
          pick: pick.picked,
          confidence: pick.confidence
        });
      });
      setMockPicks(transformedPicks);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Unable to fetch data. Please try again or use mock data.");
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  };

  const refreshWeek = useCallback(async (weekNumber) => {
    if (!weekNumber) return;

    setIsRefreshing(true);
    try {
      // 1. Fetch scoreboard for the selected week
      const weekResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${weekNumber}`);
      const data = await weekResponse.json();
      const refreshedGames = transformEspnData(data, fpiData);

      // 2. Fetch summary data for games in that week
      const gamesWithSummaryPromises = refreshedGames.map(async (game) => {
        try {
          const summaryResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.id}`);
          const summaryData = await summaryResponse.json();

          let homeWinProbability = null;
          let awayWinProbability = null;
          let initialHomeWinProbability = null;
          let initialAwayWinProbability = null;
          
          // Fetch odds from new endpoint
          const oddsData = await fetchOdds(game.id);
          let homeMoneyLine = oddsData.homeMoneyLine;
          let awayMoneyLine = oddsData.awayMoneyLine;

          const gameStatus = game.status;

          if (gameStatus === 'scheduled' || gameStatus === 'pre') {
              if (summaryData.predictor && summaryData.predictor.homeTeam && summaryData.predictor.awayTeam) {
                  homeWinProbability = summaryData.predictor.homeTeam.gameProjection * 1;
                  awayWinProbability = summaryData.predictor.awayTeam.gameProjection * 1;
                  initialHomeWinProbability = homeWinProbability;
                  initialAwayWinProbability = awayWinProbability;
              }
          } else {
              if (summaryData.winprobability && summaryData.winprobability.length > 0) {
                  const winProbabilities = summaryData.winprobability;
                  const firstWinProbability = winProbabilities[0];

                  initialHomeWinProbability = firstWinProbability.homeWinPercentage * 100;
                  initialAwayWinProbability = (1 - firstWinProbability.homeWinPercentage) * 100;

                  if (game.status === 'post') {
                      homeWinProbability = winProbabilities[0].homeWinPercentage * 100;
                      awayWinProbability = (1 - winProbabilities[0].homeWinPercentage) * 100;
                  } else if (game.status === 'in' || game.status === 'live') {
                      const latestWinProbability = winProbabilities[winProbabilities.length - 1];
                      homeWinProbability = latestWinProbability.homeWinPercentage * 100;
                      awayWinProbability = (1 - latestWinProbability.homeWinPercentage) * 100;
                  }
              }
          }

          return { ...game, homeWinProbability, awayWinProbability, initialHomeWinProbability, initialAwayWinProbability, homeMoneyLine, awayMoneyLine };
        } catch (summaryError) {
          return game; // Return original game if summary fetch fails
        }
      });
      const gamesWithSummaries = await Promise.all(gamesWithSummaryPromises);

      // 3. Update the weeks state immutably
      setWeeks(currentWeeks => {
        const newWeeks = [...currentWeeks];
        const weekIndex = newWeeks.findIndex(w => w.week === weekNumber);
        if (weekIndex !== -1) {
          newWeeks[weekIndex] = {
            ...newWeeks[weekIndex],
            games: gamesWithSummaries
          };
        }
        return newWeeks;
      });

    } catch (err) {
      console.error("Refresh error:", err);
      // Optionally set a temporary error message
    } finally {
      setIsRefreshing(false);
      setLastUpdate(new Date());
    }
  }, [fpiData]);

  useEffect(() => {
    fetchScores(); // Initial fetch
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      const intervalId = setInterval(() => {
        refreshWeek(selectedWeek);
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(intervalId); // Cleanup on unmount
    }
  }, [selectedWeek, refreshWeek]);

  useEffect(() => {
    if (weeks.length > 0 && Object.keys(mockPicks).length > 0) {
      calculateDeviation();
    }
  }, [weeks, mockPicks]); // Re-run if weeks or mockPicks changes

  const calculateConfidencePoints = (allPlayers) => {
    const results = {};
    const playerNames = Object.keys(allPlayers);

    // 1. Initialize results object for each player
    playerNames.forEach(player => {
      const details = allPlayers[player] ? JSON.parse(JSON.stringify(allPlayers[player])) : [];
      const pointsPerWeekMap = new Map();
      weeks.forEach(w => pointsPerWeekMap.set(w.week, { week: w.week, points: 0, correctPicks: 0 }));

      results[player] = {
        total: 0,
        weekly: 0,
        details: details,
        pointsPerWeekMap: pointsPerWeekMap, // Temporary map for aggregation
        gotwPoints: 0,
        pointsLost: 0,
        remainingPossible: 0,
        pointsPerWeek: [],
        correctPicksPerWeek: []
      };
    });

    // 2. Main scoring loop
    weeks.forEach(weekData => {
      weekData.games.forEach(game => {
        playerNames.forEach(player => {
          const pick = results[player].details.find(p => p.gameId === game.id);
          if (!pick) return;

          const isComplete = game.status === 'final' || game.status === 'post';
          const isLiveGame = includeLiveGames && (game.status === 'in' || game.status === 'live');

          let winner = null;
          if (isComplete) {
            winner = game.winner;
          } else if (isLiveGame) {
            if (game.homeScore > game.awayScore) {
              winner = game.home;
            } else if (game.awayScore > game.homeScore) {
              winner = game.away;
            } else { // Tie in live game, use win probability
              if (game.homeWinProbability > game.awayWinProbability) {
                winner = game.home;
              } else if (game.awayWinProbability > game.homeWinProbability) {
                winner = game.away;
              }
            }
          }

          const pickAbbreviation = teamAbbreviations[pick.pick] || pick.pick;
          let isCorrect = (isComplete || isLiveGame) && winner ? winner === pickAbbreviation : false;

          // If game is a finished tie, everyone who made a pick gets points.
          if (isComplete && game.winner === null) {
              isCorrect = true;
          }

          pick.correct = (isComplete || isLiveGame) ? isCorrect : undefined;

          if (isCorrect) {
            let confidence = Number(pick.confidence);
            const isGameOfTheWeek = gamesOfTheWeek.includes(game.id);
            if (isGameOfTheWeek) {
              confidence += 5;
            }

            results[player].total += confidence;

            if (weekData.week === selectedWeek) {
              results[player].weekly += confidence;
            }

            const weekEntry = results[player].pointsPerWeekMap.get(weekData.week);
            if (weekEntry) {
                weekEntry.points += confidence;
                weekEntry.correctPicks++;
            }
            
            if (isGameOfTheWeek) {
              results[player].gotwPoints += confidence;
            }
          }
        });
      });
    });

    // 3. Finalize results - Step 1: Calculate cumulative points for all players
    playerNames.forEach(player => {
      const pointsPerWeekArray = Array.from(results[player].pointsPerWeekMap.values()).sort((a, b) => a.week - b.week);
      
      let cumulativePoints = 0;
      pointsPerWeekArray.forEach(weekInfo => {
          cumulativePoints += weekInfo.points;
          results[player].pointsPerWeek.push({ ...weekInfo, cumulativePoints });
          results[player].correctPicksPerWeek.push({ week: weekInfo.week, correctPicks: weekInfo.correctPicks });
      });

      delete results[player].pointsPerWeekMap;
    });

    // 3. Finalize results - Step 2: Calculate leader points for each week
    const leaderPointsPerWeek = {};
    weeks.forEach(weekData => {
      const leaderPoints = Math.max(...playerNames.map(p => results[p].pointsPerWeek.find(pw => pw.week === weekData.week)?.cumulativePoints || 0));
      leaderPointsPerWeek[weekData.week] = leaderPoints;
    });

    const getRemainingPotentialForWeek = (player, weekNum, allPlayerPicks, weeks, gamesOfTheWeek, includeLiveGames) => {
        const weekData = weeks.find(w => w.week === weekNum);
        if (!weekData) return 0;

        const numGamesInWeek = weekData.games.length;
        const numGotwGames = weekData.games.filter(g => gamesOfTheWeek.includes(g.id)).length;
        const maxPossiblePointsInWeek = (numGamesInWeek * (numGamesInWeek + 1) / 2) + (numGotwGames * 5);

        const playedGameIds = weekData.games
            .filter(g => {
                const isComplete = g.status === 'final' || g.status === 'post';
                const isLive = g.status === 'in' || g.status === 'live';
                return isComplete || (includeLiveGames && isLive);
            })
            .map(g => g.id);

        const playerPicks = allPlayerPicks[player] || [];

        const confidenceFromPlayedGames = playerPicks
            .filter(p => playedGameIds.includes(p.gameId))
            .reduce((acc, p) => {
                let conf = Number(p.confidence);
                if (gamesOfTheWeek.includes(p.gameId)) {
                    conf += 5;
                }
                return acc + conf;
            }, 0);

        return maxPossiblePointsInWeek - confidenceFromPlayedGames;
    };

    const potentialLeaderPointsPerWeek = {};
    weeks.forEach(weekData => {
        const weekNum = weekData.week;
        let maxPotentialPoints = -Infinity;

        playerNames.forEach(player => {
            const cumulative = results[player].pointsPerWeek.find(pw => pw.week === weekNum)?.cumulativePoints || 0;
            const potential = getRemainingPotentialForWeek(player, weekNum, allPlayers, weeks, gamesOfTheWeek, includeLiveGames);
            const totalPotential = cumulative + potential;

            if (totalPotential > maxPotentialPoints) {
                maxPotentialPoints = totalPotential;
            }
        });
        potentialLeaderPointsPerWeek[weekNum] = maxPotentialPoints;
    });


    // 3. Finalize results - Step 3: Calculate relative points and other week-specific stats
    playerNames.forEach(player => {
      results[player].pointsPerWeek.forEach(weekInfo => {
        weekInfo.relativePoints = weekInfo.cumulativePoints - leaderPointsPerWeek[weekInfo.week];
        
        const potential = getRemainingPotentialForWeek(player, weekInfo.week, allPlayers, weeks, gamesOfTheWeek, includeLiveGames);
        const totalPotential = weekInfo.cumulativePoints + potential;
        weekInfo.relativePotentialPoints = totalPotential - potentialLeaderPointsPerWeek[weekInfo.week];
      });

      const currentWeekData = weeks.find(w => w.week === selectedWeek);
      if (currentWeekData) {
        const numGamesInWeek = currentWeekData.games.length;
        const numGotwGames = currentWeekData.games.filter(g => gamesOfTheWeek.includes(g.id)).length;
        const maxPossiblePointsInWeek = (numGamesInWeek * (numGamesInWeek + 1) / 2) + (numGotwGames * 5);
        
        const playedGameIds = currentWeekData.games
          .filter(g => {
              const isComplete = g.status === 'final' || g.status === 'post';
              const isLive = g.status === 'in' || g.status === 'live';
              return isComplete || (includeLiveGames && isLive);
          })
          .map(g => g.id);

        const confidenceFromPlayedGames = results[player].details
          .filter(p => playedGameIds.includes(p.gameId))
          .reduce((acc, p) => {
              let conf = Number(p.confidence);
              if (gamesOfTheWeek.includes(p.gameId)) {
                  conf += 5;
              }
              return acc + conf;
          }, 0);

        results[player].remainingPossible = maxPossiblePointsInWeek - confidenceFromPlayedGames;

        const pointsLostInWeek = results[player].details
          .filter(p => {
            const game = currentWeekData.games.find(g => g.id === p.gameId);
            if (!game) return false;
            
            const isComplete = game.status === 'final' || game.status === 'post';
            const isLive = game.status === 'in' || game.status === 'live';
            const isScorable = isComplete || (includeLiveGames && isLive);

            return isScorable && p.correct === false;
          })
          .reduce((acc, p) => {
            let confidence = Number(p.confidence);
            if (gamesOfTheWeek.includes(p.gameId)) {
              confidence += 5;
            }
            return acc + confidence;
          }, 0);
        results[player].pointsLost = pointsLostInWeek;
      }
    });

    return results;
  };

  const calculateDeviation = () => {
    const deviationResults = [];
    weeks.forEach(weekData => {
      weekData.games.forEach(game => {
        const players = Object.keys(mockPicks);
        const gamePicks = [];
        let sumRelConf = 0;

        players.forEach(player => {
          const pick = mockPicks[player].find(p => p.gameId === game.id);
          if (pick) {
            const pickAbbreviation = teamAbbreviations[pick.pick] || pick.pick;
            let effectiveConfidence = pick.confidence;
            if (gamesOfTheWeek.includes(game.id)) {
                effectiveConfidence += 5;
            }
            const relConf = pickAbbreviation === game.home ? effectiveConfidence : -1 * effectiveConfidence;
            gamePicks.push({ player, relConf });
            sumRelConf += relConf;
          }
        });

        if (gamePicks.length > 1) {
          let sumOfDeviations = 0;
          gamePicks.forEach(pick => {
            const avgConfOthers = (sumRelConf - pick.relConf) / (gamePicks.length - 1);
            const deviation = Math.abs(pick.relConf - avgConfOthers);
            sumOfDeviations += deviation;
          });
          const avgDeviation = sumOfDeviations / gamePicks.length;
          deviationResults.push({ gameId: game.id, avgDeviation });
        }
      });
    });
    setDeviationData(deviationResults);
  };

  const getGameStatus = (game) => {
    if (game.status === 'final' || game.status === 'post') return 'FINAL';
    if (game.status === 'in' || game.status === 'live') return 'LIVE';
    return 'Scheduled';
  };

  const isLive = (game) => {
    return game.status === 'in' || game.status === 'live';
  };

  const displayedWeek = weeks.find(w => w.week === selectedWeek);
  const gamesByDate = displayedWeek ? displayedWeek.games.reduce((acc, game) => {
    const date = new Date(game.date || Date.now()).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(game);
    return acc;
  }, {}) : {};

  const modelPlayersData = React.useMemo(() => {
    if (!showModelPicks || weeks.length === 0) {
      return [];
    }

    const fpiPlayerPicks = [];
    const mlPlayerPicks = [];

    weeks.forEach(weekData => {
      const gamesWithConfidence = calculateGameConfidence(weekData.games);
      gamesWithConfidence.forEach(game => {
        if (game.fpiPick && isFinite(game.fpiConfidence)) {
          fpiPlayerPicks.push({
            gameId: game.id,
            pick: game.fpiPick,
            confidence: game.fpiConfidence
          });
        }
        if (game.mlPick && isFinite(game.mlConfidence)) {
          mlPlayerPicks.push({
            gameId: game.id,
            pick: game.mlPick,
            confidence: game.mlConfidence
          });
        }
      });
    });

    return [
      { name: 'FPI', picks: fpiPlayerPicks },
      { name: 'ML', picks: mlPlayerPicks }
    ];
  }, [showModelPicks, weeks]);

  const confidenceResults = React.useMemo(() => {
    const allPlayers = { ...mockPicks, ...modelPlayersData.reduce((acc, player) => ({ ...acc, [player.name]: player.picks }), {}) };
    return calculateConfidencePoints(allPlayers);
  }, [mockPicks, modelPlayersData, weeks, selectedWeek, includeLiveGames, gamesOfTheWeek]);

  const allPlayerPicks = { ...mockPicks, ...modelPlayersData.reduce((acc, player) => ({ ...acc, [player.name]: player.picks }), {}) };

  const leaderboard = Object.entries(confidenceResults)
    .sort((a, b) => b[1].total - a[1].total);

  const requestPlayerSort = (key) => {
    let direction = 'ascending';
    if (playerSortConfig.key === key && playerSortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setPlayerSortConfig({ key, direction });
    setDeviationSortConfig({ key: null, direction: 'ascending' });
  };

  return (
    React.createElement("div", { className: "min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" },
      React.createElement("div", { className: "bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10" },
        React.createElement("div", { className: "max-w-7xl mx-auto px-4 py-0" },
                      React.createElement("div", { className: "flex items-center justify-between flex-wrap gap-x-4 gap-y-1" },            React.createElement("div", { className: "flex items-center gap-3" },
              React.createElement("span", null, "\uD83C\uDFC8"),
              React.createElement("div", { className: "my-0 p-0" },
                React.createElement("h1", { className: "text-2xl font-bold text-white my-0" }, "NFL Pickem Live Tracker"),
              )
            ),
            React.createElement("div", { className: "flex gap-2" },
            React.createElement("button", {
              onClick: () => refreshWeek(selectedWeek),
              className: `px-3 py-1 text-sm rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`,
              disabled: isRefreshing
            }, isRefreshing ? "Refreshing..." : "Refresh"),
            React.createElement("button", {
              onClick: () => setShowModelPicks(!showModelPicks),
              className: `ml-2 px-3 py-1 text-sm rounded-lg transition-colors ${showModelPicks ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700'} text-white`
            }, "Incl. Models"),
              React.createElement("button", {
                onClick: () => setIncludeLiveGames(!includeLiveGames),
                className: `px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
                  includeLiveGames
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700'
                }`
              },
                React.createElement("span", { className: `w-2 h-2 rounded-full ${includeLiveGames ? 'bg-white animate-pulse' : 'bg-slate-500'}` }),
                includeLiveGames ? 'Incl. Live' : 'Final Only'
              ),
              React.createElement("select", { onChange: (e) => setSelectedWeek(parseInt(e.target.value)), value: selectedWeek, className: "bg-slate-700 text-white rounded-lg px-3 py-2" },
                weeks.map(w => React.createElement("option", { key: w.week, value: w.week }, `Week ${w.week}`))
              )
            )
          ),
          React.createElement("div", { className: "flex gap-2 mt-2" },
            React.createElement("button", {
              onClick: () => setActiveTab('week-overview'),
              className: `px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'week-overview'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`
            },
              "Week Overview"
            ),

            React.createElement("button", {
              onClick: () => setActiveTab('chart'),
              className: `px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'chart'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`
            },
              "Charts"
            ),
            React.createElement("button", {
              onClick: () => setActiveTab('odds'),
              className: `px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'odds'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`
            },
              "Win Probs."
            ),
            React.createElement("button", {
              onClick: () => setActiveTab('leaderboard'),
              className: `px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'leaderboard'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`
            },
              "Leaderboard"
            )
          )
        )
      ),
      React.createElement("div", { className: `${activeTab === 'week-overview' ? 'max-w-full' : 'max-w-7xl'} mx-auto px-4 py-6` },
        error && (
          React.createElement("div", { className: "bg-red-500/10 border border-red-500 text-red-400 px-1 py-1 rounded-lg mb-6 text-sm" },
            error
          )
        ),
        loading ? (
          React.createElement("div", { className: "flex items-center justify-center py-20" },
            React.createElement("div", { className: "text-center" },
              React.createElement("span", { className: "w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" }, "🔄"),
              React.createElement("p", { className: "text-slate-300" }, "Loading...")
            )
          )
        ) : activeTab === 'chart' ? (
          React.createElement("div", null,
            React.createElement("div", { className: "flex gap-2 mt-1" },
              React.createElement("button", {
                onClick: () => setActiveChartTab('week-points'),
                className: `px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeChartTab === 'week-points' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`
              }, "Week Points"),
              React.createElement("button", {
                onClick: () => setActiveChartTab('cumulative-points'),
                className: `px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeChartTab === 'cumulative-points' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`
              }, "Points vs. Leader"),
              React.createElement("button", {
                onClick: () => setActiveChartTab('points-per-week'),
                className: `px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeChartTab === 'points-per-week' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`
              }, "Points per Week"),
              React.createElement("button", {
                onClick: () => setActiveChartTab('gotw-points'),
                className: `px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeChartTab === 'gotw-points' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`
              }, "GotW Points")
            ),
            activeChartTab === 'week-points' && React.createElement("div", { className: "relative chart-wrapper mt-1" },
              React.createElement("div", { className: "absolute top-4 right-4 z-10" },
                React.createElement("button", {
                  onClick: () => {
                    const modes = ['absolute', 'points_percentage', 'correct_percentage', 'vs_leader', 'vs_total_leader'];
                    const nextIndex = (modes.indexOf(weekPointsDisplayMode) + 1) % modes.length;
                    setWeekPointsDisplayMode(modes[nextIndex]);
                  },
                  className: "px-4 py-2 rounded-lg font-medium transition-colors bg-slate-700/50 text-slate-300 hover:bg-slate-700"
                }, `${weekPointsDisplayMode.replace('_', ' ')}`)
              ),
              React.createElement(WeeklyBarChart, { confidenceResults: confidenceResults, selectedWeek: selectedWeek, weeks: weeks, gamesOfTheWeek: gamesOfTheWeek, weekPointsDisplayMode: weekPointsDisplayMode }),
            ),
            activeChartTab === 'points-per-week' && React.createElement("div", { className: "relative chart-wrapper mt-1" },
              React.createElement("div", { className: "absolute top-4 right-4 z-10" },
                React.createElement("button", {
                  onClick: () => {
                    const modes = ['absolute', 'points_percentage', 'correct_percentage'];
                    const nextIndex = (modes.indexOf(pointsPerWeekDisplayMode) + 1) % modes.length;
                    setPointsPerWeekDisplayMode(modes[nextIndex]);
                  },
                  className: "px-4 py-2 rounded-lg font-medium transition-colors bg-slate-700/50 text-slate-300 hover:bg-slate-700"
                }, `${pointsPerWeekDisplayMode.replace('_', ' ')}`)
              ),
              React.createElement(WeeklyPointsChart, { confidenceResults: confidenceResults, selectedWeek: selectedWeek, weeks: weeks, gamesOfTheWeek: gamesOfTheWeek, pointsPerWeekDisplayMode: pointsPerWeekDisplayMode }),
              React.createElement(WeeklyPointsTable, { confidenceResults: confidenceResults, weeks: weeks, gamesOfTheWeek: gamesOfTheWeek, pointsPerWeekDisplayMode: pointsPerWeekDisplayMode })
            ),
            activeChartTab === 'cumulative-points' && React.createElement("div", { className: "chart-wrapper" },
              React.createElement(CumulativePointsChart, { confidenceResults: confidenceResults, selectedWeek: selectedWeek }),
              React.createElement(CumulativePointsTable, { confidenceResults: confidenceResults })
            ),
            activeChartTab === 'gotw-points' && React.createElement("div", { className: "relative chart-wrapper mt-1" },
              React.createElement("div", { className: "absolute top-4 right-4 z-10" },
                React.createElement("button", {
                  onClick: () => {
                    const modes = ['absolute', 'points_percentage', 'correct_percentage'];
                    const nextIndex = (modes.indexOf(gotwDisplayMode) + 1) % modes.length;
                    setGotwDisplayMode(modes[nextIndex]);
                  },
                  className: "px-4 py-2 rounded-lg font-medium transition-colors bg-slate-700/50 text-slate-300 hover:bg-slate-700"
                }, `${gotwDisplayMode.replace('_', ' ')}`)
              ),
                            React.createElement(GamesOfTheWeekPointsChart, { 
                              confidenceResults: confidenceResults,
                              allPicks: allPlayerPicks,
                              weeks: weeks,
                              gamesOfTheWeek: gamesOfTheWeek,
                              includeLiveGames: includeLiveGames,
                              gotwDisplayMode: gotwDisplayMode
                            }),              React.createElement(GamesOfTheWeekPointsTable, { allPicks: allPlayerPicks, confidenceResults: confidenceResults, weeks: weeks, gamesOfTheWeek: gamesOfTheWeek, includeLiveGames: includeLiveGames })
            )
          )
        ) : activeTab === 'odds' ? (
          React.createElement(OddsTable, { weeks: weeks, selectedWeek: selectedWeek, showDisagreement: showDisagreement, setShowDisagreement: setShowDisagreement })
        ) : activeTab === 'week-overview' ? (
          React.createElement("div", null,
            React.createElement("div", { ref: weekOverviewRef, className: "bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden" },
              React.createElement("div", { className: "overflow-x-auto" },
                React.createElement("table", { className: "w-full" },
                  React.createElement("thead", null,
                    React.createElement("tr", { className: "bg-slate-700/50 border-b border-slate-700" },
                      React.createElement("th", { className: "px-2 py-1 text-left text-white font-semibold text-xs sticky top-0 bg-slate-800 z-10" }, "Game"),
                      React.createElement("th", { className: "px-1 py-1 text-center text-white font-semibold text-xs sticky top-0 bg-slate-800 z-10" }, "Score"),
                      leaderboard.map(([player, data], idx) => {
                        const firstPlacePoints = leaderboard.length > 0 ? leaderboard[0][1].total : 0;
                        const pointsBehind = firstPlacePoints - data.total;
                        return (
                          React.createElement("th", { key: player, className: "px-1 py-1 text-center border-l border-slate-700 cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => requestPlayerSort(player) },
                            React.createElement("div", { className: "text-white font-semibold text-xs" }, player.replace(/ /g, '\u00A0'), playerSortConfig.key === player && (playerSortConfig.direction === 'ascending' ? ' \u25B2' : ' \u25BC')),
                            React.createElement("div", { className: "text-yellow-400 text-xs font-bold mt-1", title: "Total points for the season" }, data.total),
                            idx === 0 ? React.createElement("div", { className: "text-xs text-green-400", title: "Total points behind the leader" }, "Lead") : pointsBehind > 0 && React.createElement("div", { className: "text-xs text-red-400", title: "Total points behind the leader" }, `-${pointsBehind}`),
                            React.createElement("div", { className: "text-slate-400 text-xs", title: "Points this week" }, `${data.weekly}`),
                            React.createElement("div", { className: "text-xs text-orange-400", title: "Points lost this week" }, `-${data.pointsLost}`),
                            React.createElement("div", { className: "text-xs text-blue-400", title: "Remaining potential points this week" }, `${data.remainingPossible}`)
                          )
                        );
                      }),
                      React.createElement("th", { className: "px-2 py-1 text-left text-white font-semibold text-xs cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => {
                        setDeviationSortConfig(current => ({ key: 'dev', direction: current.key === 'dev' && current.direction === 'ascending' ? 'descending' : 'ascending' }));
                        setPlayerSortConfig({ key: null, direction: 'ascending' });
                      }},
                          "Dev",
                          deviationSortConfig.key === 'dev' && (deviationSortConfig.direction === 'ascending' ? ' \u25B2' : ' \u25BC')
                      ),
                      React.createElement("th", { className: "px-2 py-1 text-left text-white font-semibold text-xs cursor-pointer sticky top-0 bg-slate-800 z-10", onClick: () => {
                        setPlayerSortConfig({ key: null, direction: 'ascending' });
                        setDeviationSortConfig({ key: null, direction: 'ascending' });
                        setMatchupQualitySortConfig(current => ({ key: 'gq', direction: current.key === 'gq' && current.direction === 'ascending' ? 'descending' : 'ascending' }));
                      }},
                          "GQ",
                          matchupQualitySortConfig.key === 'gq' && (matchupQualitySortConfig.direction === 'ascending' ? ' \u25B2' : ' \u25BC')
                      )
                    )
                  ),
                  React.createElement("tbody", null,
                                      (displayedWeek ? [...displayedWeek.games].sort((a, b) => {
                                        if (playerSortConfig.key) {
                                          const player = playerSortConfig.key;
                                          const aConfidence = confidenceResults[player]?.details.find(d => d.gameId === a.id)?.confidence || 0;
                                          const bConfidence = confidenceResults[player]?.details.find(d => d.gameId === b.id)?.confidence || 0;
                                  
                                          if (aConfidence < bConfidence) {
                                              return playerSortConfig.direction === 'ascending' ? -1 : 1;
                                          }
                                          if (aConfidence > bConfidence) {
                                              return playerSortConfig.direction === 'ascending' ? 1 : -1;
                                          }
                                        }

                                        const aIsLive = isLive(a);
                                        const bIsLive = isLive(b);

                                        if (deviationSortConfig.key === 'dev') {
                                          const aDev = deviationData.find(d => d.gameId === a.id)?.avgDeviation || 0;
                                          const bDev = deviationData.find(d => d.gameId === b.id)?.avgDeviation || 0;
                                          if (aDev < bDev) {
                                              return deviationSortConfig.direction === 'ascending' ? -1 : 1;
                                          }
                                          if (aDev > bDev) {
                                              return deviationSortConfig.direction === 'ascending' ? 1 : -1;
                                          }
                                        }

                                        if (matchupQualitySortConfig.key === 'gq') {
                                            const aGQ = a.matchupQuality || -Infinity; // Treat null/N/A as lowest for ascending
                                            const bGQ = b.matchupQuality || -Infinity;
                                            if (aGQ < bGQ) {
                                                return matchupQualitySortConfig.direction === 'ascending' ? -1 : 1;
                                            }
                                            if (aGQ > bGQ) {
                                                return matchupQualitySortConfig.direction === 'ascending' ? 1 : -1;
                                            }
                                        }


                                        if (aIsLive && !bIsLive) return -1; // a (live) comes before b (not live)
                                        if (!aIsLive && bIsLive) return 1;  // b (live) comes before a (not live)

                                        return new Date(a.date) - new Date(b.date); // Sort by date if both are live or both are not live
                                      }) : []).map((game) => {
                                        const isGameOfTheWeek = gamesOfTheWeek.includes(game.id);
                                        const live = isLive(game);
                                        const trChildren = [
                                          React.createElement("td", { className: "px-2 py-0" },
                                            React.createElement("div", { className: "text-white text-sm font-medium relative" },
                                              React.createElement("span", null, `${game.away}@${game.home}`),
                                              isGameOfTheWeek && React.createElement("span", { className: "text-yellow-400 text-[0.6rem] leading-none absolute top-0 right-0" }, "⭐"),
                                            ),
                                            game.homeWinProbability !== null && game.awayWinProbability !== null && (isLive(game) || (game.status === 'final' || game.status === 'post')) ? (
                                                React.createElement(React.Fragment, null,
                                                    React.createElement("div", { className: "text-xs text-slate-400" },
                                                        `${game.awayWinProbability.toFixed(1)}%-${game.homeWinProbability.toFixed(1)}%`
                                                    ),
                                                    (isLive(game) && game.displayClock && game.period) ? (
                                                        React.createElement("div", { className: "text-xs text-red-400 animate-pulse" }, 
                                                            `(${`Q${game.period} - ${game.displayClock.split(' - ')[0]}`})`
                                                        )
                                                    ) : null
                                                )
                                            ) : null                                          ),
                                          React.createElement("td", { className: "px-1 py-0 text-center" },
                                            React.createElement("div", { className: "text-sm" },
                                              game.status === 'final' || game.status === 'post' || (includeLiveGames && (game.status === 'in' || game.status === 'live')) ? (
                                                React.createElement("span", { className: "text-white font-semibold" }, 
                                                  `${game.awayScore}-${game.homeScore}`
                                                )
                                              ) : (
                                                getGameStatus(game) === 'Scheduled' && game.date ? (
                                                  React.createElement("span", { className: "text-slate-400 text-xs" }, new Date(game.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(game.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }))
                                                ) : (
                                                  React.createElement("span", { className: "text-slate-400 text-xs" }, "-")
                                                )
                                              )
                                            )
                                          )
                                        ];

                                        const playerTds = leaderboard.map(([player, data]) => {
                                          const detail = data.details.find(d => d.gameId === game.id);
                                          if (!detail || typeof detail.confidence !== 'number') {
                                            return React.createElement("td", { key: player, className: "px-1 py-0 text-center text-slate-500 border-l border-slate-700/50" }, "");
                                          }

                                          const isCorrect = detail.correct;
                                          const pickAbbr = detail.pick ? (teamAbbreviations[detail.pick] || detail.pick) : null;
                                          const isGameOfTheWeek = gamesOfTheWeek.includes(game.id);
                                          const displayedConfidence = isGameOfTheWeek ? detail.confidence + 5 : detail.confidence;

                                          return (
                                              React.createElement("td", { key: player, className: "px-1 py-0 text-center border-l border-slate-700/50" },
                                                  React.createElement("div", { className: `flex flex-col gap-px px-1 py-0 rounded text-sm font-semibold text-center ${
                                                      isCorrect === true ? 'bg-green-500/20 text-green-400 border border-green-500/40' :
                                                      isCorrect === false ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                                                      'bg-slate-700/50 text-slate-300 border border-slate-600'
                                                  }` },
                                                      showLogos && pickAbbr ?
                                                        React.createElement("img", {
                                                          src: `https://a.espncdn.com/i/teamlogos/nfl/500/${pickAbbr.toLowerCase()}.png`,
                                                          alt: detail.pick,
                                                          className: "w-6 h-6 mx-auto",
                                                          onError: (e) => { e.target.src = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nfl.png?w=100&h=100&transparent=true'; }
                                                        }) :
                                                        React.createElement("div", { }, pickAbbr || ''),
                                                      React.createElement("div", { className: `text-xs ${
                                                          isCorrect === true ? 'text-green-400' :
                                                          isCorrect === false ? 'text-red-400' :
                                                          'text-slate-300'
                                                      }` },
                                                          displayedConfidence
                                                      )
                                                  )
                                              )
                                          );
                                        });

                                        trChildren.push(...playerTds);

                                        trChildren.push(
                                          React.createElement("td", { className: "px-2 py-0 text-white" },
                                            (deviationData.find(d => d.gameId === game.id) && !isNaN(deviationData.find(d => d.gameId === game.id).avgDeviation)) ? deviationData.find(d => d.gameId === game.id).avgDeviation.toFixed(1) : ""
                                          )
                                        );

                                        trChildren.push(
                                          React.createElement("td", { className: "px-2 py-0 text-white" },
                                            game.matchupQuality !== null ? game.matchupQuality.toFixed(1) : "N/A"
                                          )
                                        );

                                        return React.createElement.apply(null, ["tr", { key: game.id, className: `border-b border-slate-700/50 hover:bg-slate-700/20 ${live ? 'bg-green-500/10' : ''} ${isGameOfTheWeek ? 'bg-yellow-500/10' : ''}` }].concat(trChildren));
                    })
                  )
                )
              )
            ),
            React.createElement("div", { className: "flex justify-end gap-2 mt-2" },
                (window.innerWidth < 768) && navigator.share && React.createElement("button", {
                    onClick: shareOverview,
                    className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
                    title: "Share"
                }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
                    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" })
                )),
                React.createElement("button", {
                    onClick: downloadOverview,
                    className: "p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors flex items-center justify-center",
                    title: "Export as PNG"
                }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: "w-4 h-4" },
                    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" })
                ))
            )
          )
        ) : activeTab === 'leaderboard' ? (
          React.createElement("div", { className: "space-y-6" },
            React.createElement("div", { className: "bg-slate-800/50 rounded-lg border border-slate-700 p-6" },

              React.createElement("div", { className: "space-y-2" },
                leaderboard.map(([player, data], idx) => {
                  const firstPlacePoints = leaderboard.length > 0 ? leaderboard[0][1].total : 0;
                  const pointsBehind = firstPlacePoints - data.total;
                  return (
                    React.createElement("div", { key: player, className: "flex items-center justify-between bg-slate-700/30 rounded-lg p-3" },
                      React.createElement("div", { className: "flex items-center gap-3" },
                        React.createElement("div", { className: `w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          idx === 0 ? 'bg-yellow-500 text-slate-900' :
                          idx === 1 ? 'bg-slate-400 text-slate-900' :
                          idx === 2 ? 'bg-amber-700 text-white' :
                          'bg-slate-600 text-slate-300'
                        }` },
                          idx + 1
                        ),
                        React.createElement("span", { className: "text-white font-semibold" }, player)
                      ),
                      React.createElement("div", { className: "text-right" },
                        React.createElement("div", { className: "text-2xl font-bold text-white" }, data.total),
                        pointsBehind > 0 && React.createElement("div", { className: "text-xs text-red-400" }, `-${pointsBehind} behind`),
                        React.createElement("div", { className: "text-xs text-slate-400" }, `This Week: ${data.weekly}`),
                        React.createElement("div", { className: "text-xs text-blue-400" }, `Remaining: ${data.remainingPossible}`)
                      )
                    )
                  );
                })
              )
            )
          )
        ) : null
      )
    )
  );
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(React.createElement(NFLScoresTracker));