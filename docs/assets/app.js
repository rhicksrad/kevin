const weekSelect = document.querySelector('#week-select');
const generatedAtEl = document.querySelector('#generated-at');
const scheduleTableBody = document.querySelector('#schedule-table tbody');
const scheduleEmptyState = document.querySelector('#schedule-empty');
const playersTableBody = document.querySelector('#players-table tbody');
const playersEmptyState = document.querySelector('#players-empty');
const summaryContainer = document.querySelector('#player-summary');
const leaderboardTableBody = document.querySelector('#leaderboard-table tbody');
const leaderboardEmptyState = document.querySelector('#leaderboard-empty');
const heatmapTableHead = document.querySelector('#heatmap-table thead');
const heatmapTableBody = document.querySelector('#heatmap-table tbody');
const heatmapEmptyState = document.querySelector('#heatmap-empty');
const heatmapLegend = document.querySelector('#heatmap-legend .heatmap-legend__gradient');
const heatmapPanel = document.querySelector('#heatmap-panel');
const teamWeekSelect = document.querySelector('#team-week-select');
const teamSummaryContainer = document.querySelector('#team-summary');
const teamBetsTableBody = document.querySelector('#team-bets-table tbody');
const teamBetsEmptyState = document.querySelector('#team-bets-empty');
const teamPointsTableBody = document.querySelector('#team-points-table tbody');
const teamPointsEmptyState = document.querySelector('#team-points-empty');

let dataset;
let scatterChart;
let barChart;

function getThemeTokens() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => {
    const value = styles.getPropertyValue(name);
    return value ? value.trim() : fallback;
  };
  return {
    chartScatterBorder: read('--chart-scatter-border', '#db2777'),
    chartScatterFill: read('--chart-scatter-fill', 'rgba(236, 72, 153, 0.78)'),
    chartBarFill: read('--chart-bar-fill', 'rgba(79, 70, 229, 0.85)'),
    chartGrid: read('--chart-grid', 'rgba(100, 116, 139, 0.2)'),
    chartAxis: read('--chart-axis', '#1f2937'),
    chartTick: read('--chart-tick', '#475569'),
    chartTooltip: read('--chart-tooltip', 'rgba(15, 23, 42, 0.92)'),
    heatmapLow: read('--heatmap-low', '#f97316'),
    heatmapHigh: read('--heatmap-high', '#22d3ee'),
    heatmapTextDark: read('--heatmap-text-dark', '#0f172a'),
    heatmapTextLight: read('--heatmap-text-light', '#f8fafc'),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseHexChannel(channel) {
  const hex = Number.parseInt(channel, 16);
  return Number.isNaN(hex) ? 0 : hex;
}

function hexToRgba(hex) {
  const value = hex.replace('#', '').trim();
  if (![3, 4, 6, 8].includes(value.length)) return null;

  if (value.length === 3 || value.length === 4) {
    const r = parseHexChannel(value[0] + value[0]);
    const g = parseHexChannel(value[1] + value[1]);
    const b = parseHexChannel(value[2] + value[2]);
    const a = value.length === 4 ? parseHexChannel(value[3] + value[3]) / 255 : 1;
    return [r, g, b, a];
  }

  const r = parseHexChannel(value.slice(0, 2));
  const g = parseHexChannel(value.slice(2, 4));
  const b = parseHexChannel(value.slice(4, 6));
  const a = value.length === 8 ? parseHexChannel(value.slice(6, 8)) / 255 : 1;
  return [r, g, b, a];
}

function rgbaStringToArray(color) {
  const match = color
    .trim()
    .match(/^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!match) return null;

  const parseChannel = (value) => {
    if (value.endsWith('%')) {
      return clamp(Number.parseFloat(value) * 2.55, 0, 255);
    }
    return clamp(Number.parseFloat(value), 0, 255);
  };

  const r = parseChannel(match[1]);
  const g = parseChannel(match[2]);
  const b = parseChannel(match[3]);
  const a = match[4] !== undefined ? clamp(Number.parseFloat(match[4]), 0, 1) : 1;
  return [r, g, b, a];
}

function normaliseColor(color) {
  if (!color) return null;
  const trimmed = color.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) {
    return hexToRgba(trimmed);
  }

  if (/^rgba?/i.test(trimmed)) {
    return rgbaStringToArray(trimmed);
  }

  const canvas = normaliseColor.canvas || document.createElement('canvas');
  let ctx = normaliseColor.ctx;
  if (!ctx && canvas.getContext) {
    ctx = canvas.getContext('2d');
    normaliseColor.ctx = ctx;
  }

  if (ctx) {
    ctx.fillStyle = '#000';
    try {
      ctx.fillStyle = trimmed;
      const parsed = ctx.fillStyle;
      if (parsed && parsed !== trimmed) {
        return normaliseColor(parsed);
      }
    } catch (error) {
      return null;
    }
  }

  return null;
}

function mixColors(start, end, ratio) {
  const startRgba = normaliseColor(start);
  const endRgba = normaliseColor(end);
  if (!startRgba || !endRgba) return null;

  const t = clamp(ratio, 0, 1);
  const mix = startRgba.map((value, index) => value + (endRgba[index] - value) * t);
  const [r, g, b, a] = mix;
  const alpha = Math.round((Number.isFinite(a) ? a : 1) * 1000) / 1000;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function relativeLuminance(color) {
  const rgba = normaliseColor(color);
  if (!rgba) return null;
  const transform = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgba;
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

const fmtNumber = (value, digits = 0) =>
  typeof value === 'number' ? value.toFixed(digits) : value;

const FRACTION_VALUES = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

function parseScoreValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number.parseFloat(trimmed.replace(/[^0-9.+-]/g, ''));
    if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
      return null;
    }
    return numeric;
  }

  return null;
}

function computeScoreFromPicks(picks) {
  if (!Array.isArray(picks) || picks.length === 0) return null;

  let total = 0;
  let hasPick = false;

  for (const pick of picks) {
    if (!pick) continue;

    hasPick = true;

    const awarded = parseScoreValue(pick.awarded_points);
    if (awarded === null) {
      const result = typeof pick.result === 'string' ? pick.result.trim().toLowerCase() : '';
      if (!result || result === 'pending') {
        return null;
      }
      if (result === 'loss') {
        continue;
      }
      return null;
    }

    total += awarded;
  }

  return hasPick ? total : null;
}

function getWeeklyScore(player, standings, weekName) {
  if (!player) return null;

  const fromPlayer = parseScoreValue(player.total_points);
  if (fromPlayer !== null) return fromPlayer;

  const standingsEntry = standings?.[player.name];
  if (standingsEntry) {
    const fromStandings = parseScoreValue(standingsEntry[weekName]);
    if (fromStandings !== null) return fromStandings;
  }

  return computeScoreFromPicks(player.picks);
}

function computeLeaderboard(standings) {
  if (!standings) return [];

  const entries = [];
  for (const [player, weeks] of Object.entries(standings)) {
    if (!weeks || typeof weeks !== 'object') continue;
    const scores = Object.values(weeks).filter((score) =>
      typeof score === 'number' && Number.isFinite(score)
    );
    if (!scores.length) continue;

    const total = scores.reduce((sum, score) => sum + score, 0);
    entries.push({
      player,
      total,
      weeksPlayed: scores.length,
      average: total / scores.length,
    });
  }

  return entries.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.weeksPlayed !== a.weeksPlayed) return b.weeksPlayed - a.weeksPlayed;
    if (b.average !== a.average) return b.average - a.average;
    return a.player.localeCompare(b.player);
  });
}

function renderLeaderboard(standings) {
  if (!leaderboardTableBody || !leaderboardEmptyState) return;

  leaderboardTableBody.innerHTML = '';

  const leaderboard = computeLeaderboard(standings);
  if (!leaderboard.length) {
    leaderboardEmptyState.hidden = false;
    return;
  }

  leaderboardEmptyState.hidden = true;

  leaderboard.forEach((entry, index) => {
    const row = document.createElement('tr');
    if (index === 0) row.classList.add('leaderboard__row--leader');

    const cells = [
      { value: index + 1, className: 'leaderboard__rank' },
      { value: entry.player },
      { value: fmtNumber(entry.total, 0) },
      { value: entry.weeksPlayed },
      { value: fmtNumber(entry.average, 1) },
    ];

    for (const cellData of cells) {
      const cell = document.createElement('td');
      cell.textContent = cellData.value;
      if (cellData.className) {
        cell.classList.add(cellData.className);
      }
      row.appendChild(cell);
    }

    leaderboardTableBody.appendChild(row);
  });
}

function aggregateTeamStats(weeks) {
  if (!Array.isArray(weeks)) return [];

  const stats = new Map();

  for (const week of weeks) {
    if (!week || !Array.isArray(week.players)) continue;

    for (const player of week.players) {
      if (!player || !Array.isArray(player.picks)) continue;

      for (const pick of player.picks) {
        if (!pick) continue;
        const teamName = typeof pick.team === 'string' ? pick.team.trim() : '';
        if (!teamName) continue;

        const points = parseScoreValue(pick.points);
        const awarded =
          typeof pick.awarded_points === 'number' ? pick.awarded_points : null;
        let entry = stats.get(teamName);
        if (!entry) {
          entry = { team: teamName, betCount: 0, totalPoints: 0, weekNames: new Set() };
          stats.set(teamName, entry);
        }

        entry.betCount += 1;
        if (awarded !== null) {
          entry.totalPoints += awarded;
        } else if (points !== null && !Number.isNaN(points)) {
          entry.totalPoints += 0;
        }
        if (typeof week.name === 'string' && week.name.trim()) {
          entry.weekNames.add(week.name);
        }
      }
    }
  }

  return Array.from(stats.values()).map((entry) => ({
    team: entry.team,
    betCount: entry.betCount,
    totalPoints: entry.totalPoints,
    averagePoints: entry.betCount ? entry.totalPoints / entry.betCount : 0,
    weekCount: entry.weekNames ? entry.weekNames.size : 0,
  }));
}

function renderTeamStats(weeks, selectedWeek) {
  if (
    !teamBetsTableBody ||
    !teamBetsEmptyState ||
    !teamPointsTableBody ||
    !teamPointsEmptyState
  ) {
    if (teamSummaryContainer) {
      teamSummaryContainer.innerHTML = '';
    }
    return;
  }

  teamBetsTableBody.innerHTML = '';
  teamPointsTableBody.innerHTML = '';

  const filteredWeeks = Array.isArray(weeks)
    ? weeks.filter((week) => !selectedWeek || week?.name === selectedWeek)
    : [];

  const stats = aggregateTeamStats(filteredWeeks);

  if (teamSummaryContainer) {
    teamSummaryContainer.innerHTML = '';
  }

  if (!stats.length) {
    teamBetsEmptyState.hidden = false;
    teamPointsEmptyState.hidden = false;
    return;
  }

  teamBetsEmptyState.hidden = true;
  teamPointsEmptyState.hidden = true;

  const formatPoints = (value) => fmtNumber(value, Number.isInteger(value) ? 0 : 1);

  const byCount = [...stats].sort((a, b) => {
    if (b.betCount !== a.betCount) return b.betCount - a.betCount;
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.team.localeCompare(b.team);
  });

  const byPoints = [...stats].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.weekCount !== a.weekCount) return b.weekCount - a.weekCount;
    if (b.betCount !== a.betCount) return b.betCount - a.betCount;
    return a.team.localeCompare(b.team);
  });

  const maxRows = 25;

  byCount.slice(0, maxRows).forEach((entry, index) => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    rankCell.textContent = String(index + 1);
    row.appendChild(rankCell);

    const teamCell = document.createElement('td');
    teamCell.textContent = entry.team;
    row.appendChild(teamCell);

    const pickedCell = document.createElement('td');
    pickedCell.textContent = fmtNumber(entry.betCount);
    row.appendChild(pickedCell);

    const weeksCell = document.createElement('td');
    weeksCell.textContent = fmtNumber(entry.weekCount);
    row.appendChild(weeksCell);

    const pointsCell = document.createElement('td');
    pointsCell.textContent = formatPoints(entry.totalPoints);
    row.appendChild(pointsCell);

    teamBetsTableBody.appendChild(row);
  });

  byPoints.slice(0, maxRows).forEach((entry, index) => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    rankCell.textContent = String(index + 1);
    row.appendChild(rankCell);

    const teamCell = document.createElement('td');
    teamCell.textContent = entry.team;
    row.appendChild(teamCell);

    const totalPointsCell = document.createElement('td');
    totalPointsCell.textContent = formatPoints(entry.totalPoints);
    row.appendChild(totalPointsCell);

    const weeksCell = document.createElement('td');
    weeksCell.textContent = fmtNumber(entry.weekCount);
    row.appendChild(weeksCell);

    const timesPickedCell = document.createElement('td');
    timesPickedCell.textContent = fmtNumber(entry.betCount);
    row.appendChild(timesPickedCell);

    const avgPointsCell = document.createElement('td');
    avgPointsCell.textContent = fmtNumber(
      entry.averagePoints,
      Number.isInteger(entry.averagePoints) ? 0 : 1
    );
    row.appendChild(avgPointsCell);

    teamPointsTableBody.appendChild(row);
  });

  if (teamSummaryContainer) {
    const totalPicks = stats.reduce((acc, entry) => acc + entry.betCount, 0);
    const totalPoints = stats.reduce((acc, entry) => acc + entry.totalPoints, 0);
    const avgPointsPerPick = totalPicks ? totalPoints / totalPicks : 0;
    const topByCount = byCount[0];
    const topByPoints = byPoints[0];

    const cards = [
      {
        title: 'Most Picked Team',
        value: `${topByCount.team} (${fmtNumber(topByCount.betCount)} picks)`,
      },
      {
        title: 'Top Point-Earning Team',
        value: `${topByPoints.team} (${formatPoints(topByPoints.totalPoints)} pts · ${fmtNumber(
          topByPoints.weekCount
        )} wks)`,
      },
      { title: 'Unique Teams Picked', value: fmtNumber(stats.length) },
      { title: 'Total Picks Logged', value: fmtNumber(totalPicks) },
      {
        title: 'Average Points per Pick',
        value: fmtNumber(avgPointsPerPick, Number.isInteger(avgPointsPerPick) ? 0 : 1),
      },
    ];

    for (const card of cards) {
      const div = document.createElement('div');
      div.className = 'summary-card';
      const heading = document.createElement('h3');
      heading.textContent = card.title;
      const value = document.createElement('p');
      value.textContent = card.value;
      div.append(heading, value);
      teamSummaryContainer.appendChild(div);
    }
  }
}

function normaliseLineValue(line) {
  if (typeof line === 'number' && Number.isFinite(line)) {
    return line;
  }
  if (typeof line !== 'string') return null;

  const trimmed = line.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  const normalised = trimmed.replace(/[\u2212\u2013\u2014]/g, '-');
  const fractionMatch = normalised.match(/[¼½¾⅛⅜⅝⅞]$/u);
  const fractionValue = fractionMatch ? FRACTION_VALUES[fractionMatch[0]] : 0;

  let numeric = Number.parseFloat(normalised);
  if (Number.isNaN(numeric)) {
    if (!fractionMatch) return null;
    numeric = 0;
  }

  if (fractionValue) {
    const sign = normalised.startsWith('-') ? -1 : 1;
    numeric += sign * fractionValue;
  }

  if (!Number.isFinite(numeric)) return null;
  return Number.parseFloat(numeric.toFixed(3));
}

function buildOption(weekName) {
  const option = document.createElement('option');
  option.value = weekName;
  option.textContent = weekName;
  return option;
}

function formatLine(line) {
  const numeric = normaliseLineValue(line);
  if (typeof numeric === 'number' && Number.isFinite(numeric)) {
    const display = numeric.toFixed(3).replace(/\.?0+$/, '');
    return numeric > 0 ? `+${display}` : display;
  }
  if (line === null || line === undefined || line === '') return '—';
  return line;
}

function buildScheduleFromBestBets(week) {
  if (!week?.players) return [];

  const entries = [];

  for (const player of week.players) {
    const bestBet = player.best_bet;
    if (!bestBet) continue;

    const hasTeam = typeof bestBet.team === 'string' && bestBet.team.trim();
    const hasLine =
      bestBet.line !== null && bestBet.line !== undefined && `${bestBet.line}`.trim();
    const hasTime = typeof bestBet.time === 'string' && bestBet.time.trim();

    if (!hasTeam && !hasLine && !hasTime) continue;

    let timeValue = bestBet.time ?? null;
    let dateValue = null;

    if (typeof bestBet.time === 'string') {
      const trimmedTime = bestBet.time.trim();
      if (trimmedTime.includes('T')) {
        const parsed = new Date(trimmedTime);
        if (!Number.isNaN(parsed.getTime())) {
          dateValue = trimmedTime;
          if (/T00:00(?::00)?/.test(trimmedTime)) {
            timeValue = null;
          }
        }
      }
    }

    entries.push({
      team: hasTeam ? bestBet.team : '',
      line: bestBet.line ?? null,
      time: timeValue,
      opponent: '',
      opponent_line: null,
      date: dateValue,
      player: player.name,
    });
  }

  const parseTime = (value) => {
    if (!value) return Number.POSITIVE_INFINITY;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }

    if (typeof value === 'string') {
      const match = value
        .toLowerCase()
        .trim()
        .match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])m?$/i);
      if (match) {
        const [, hours, minutes, period] = match;
        let hour = Number.parseInt(hours, 10) % 12;
        if (period === 'p') hour += 12;
        const minute = Number.parseInt(minutes ?? '0', 10);
        return hour * 60 + minute;
      }
      const numeric = Number.parseFloat(value);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }

    return Number.POSITIVE_INFINITY;
  };

  entries.sort((a, b) => {
    const timeDiff = parseTime(a.time ?? a.date) - parseTime(b.time ?? b.date);
    if (timeDiff !== 0) return timeDiff;
    return a.player.localeCompare(b.player);
  });

  return entries;
}

function formatTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    return trimmed;
  }
  return String(value);
}

function renderSchedule(week) {
  if (!scheduleTableBody || !scheduleEmptyState) return;

  scheduleTableBody.innerHTML = '';
  if (!week) {
    scheduleEmptyState.hidden = false;
    return;
  }

  const officialSchedule = Array.isArray(week.schedule) ? week.schedule : [];
  let schedule = officialSchedule.filter((game) => game);

  if (schedule.length === 0) {
    schedule = buildScheduleFromBestBets(week);
  }

  if (!schedule || schedule.length === 0) {
    scheduleEmptyState.hidden = false;
    return;
  }
  scheduleEmptyState.hidden = true;

  for (const game of schedule) {
    const row = document.createElement('tr');
    let dateDisplay = '—';
    if (game.date) {
      const parsed = new Date(game.date);
      dateDisplay = Number.isNaN(parsed.getTime())
        ? game.date
        : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    const timeDisplay = formatTime(game.time);
    const opponentDisplay = game.opponent || (game.player ? `Best bet · ${game.player}` : '—');
    const cells = [
      game.team || '—',
      opponentDisplay,
      formatLine(game.line ?? game.opponent_line),
      dateDisplay,
      timeDisplay,
    ];
    for (const value of cells) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    }
    scheduleTableBody.appendChild(row);
  }
}

function renderSummary(players, scoresByPlayer) {
  if (!summaryContainer) return;

  summaryContainer.innerHTML = '';
  if (!players.length) return;

  const scoredPlayers = players.filter((player) => scoresByPlayer.has(player.name));
  const playersWithLines = players.filter(
    (player) => normaliseLineValue(player.best_bet?.line) !== null
  );
  const totalScore = scoredPlayers.reduce(
    (acc, player) => acc + (scoresByPlayer.get(player.name) ?? 0),
    0
  );
  const avgScore = scoredPlayers.length
    ? totalScore / scoredPlayers.length
    : null;

  const cards = [
    { title: 'Players Tracked', value: players.length },
    { title: 'With Official Scores', value: scoredPlayers.length },
    { title: 'Best Bets Logged', value: playersWithLines.length },
    {
      title: 'Average Score',
      value: avgScore === null ? '—' : fmtNumber(avgScore, 1),
    },
  ];

  for (const card of cards) {
    const div = document.createElement('div');
    div.className = 'summary-card';
    const heading = document.createElement('h3');
    heading.textContent = card.title;
    const value = document.createElement('p');
    value.textContent = card.value;
    div.append(heading, value);
    summaryContainer.appendChild(div);
  }
}

function renderPlayers(week, standings, weekName) {
  if (!playersTableBody || !playersEmptyState) return;

  playersTableBody.innerHTML = '';
  if (!week.players || week.players.length === 0) {
    playersEmptyState.hidden = false;
    if (summaryContainer) {
      summaryContainer.innerHTML = '';
    }
    return;
  }
  playersEmptyState.hidden = true;

  const scoresByPlayer = new Map();
  for (const player of week.players) {
    const score = getWeeklyScore(player, standings, weekName);
    if (typeof score === 'number' && Number.isFinite(score)) {
      scoresByPlayer.set(player.name, score);
    }
  }

  renderSummary(week.players, scoresByPlayer);

  const playersForTable = week.players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      const scoreA = scoresByPlayer.get(a.player.name);
      const scoreB = scoresByPlayer.get(b.player.name);

      const hasScoreA = Number.isFinite(scoreA);
      const hasScoreB = Number.isFinite(scoreB);

      if (hasScoreA && hasScoreB) {
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.player.name.localeCompare(b.player.name);
      }

      if (hasScoreA) return -1;
      if (hasScoreB) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.player);

  for (const player of playersForTable) {
    const row = document.createElement('tr');
    const picksSummary = (Array.isArray(player.picks) ? player.picks : [])
      .map((pick) => {
        const totalPoints = fmtNumber(parseScoreValue(pick.points) ?? pick.points, 0);
        const awarded =
          typeof pick.awarded_points === 'number' ? pick.awarded_points : null;
        const result = typeof pick.result === 'string' ? pick.result : '';

        const parts = [];
        if (awarded !== null) {
          parts.push(`${fmtNumber(awarded, 0)} / ${totalPoints} pts`);
        } else {
          parts.push(`${totalPoints} pts`);
        }
        parts.push('–');
        parts.push(pick.team || '—');

        if (result) {
          let label;
          if (result === 'win') label = 'Win';
          else if (result === 'loss') label = 'Loss';
          else if (result === 'pending') label = 'Pending';
          else label = result;
          parts.push(`(${label})`);
        }

        return parts.join(' ');
      })
      .join('\n');
    let weeklyScore = '—';
    if (scoresByPlayer.has(player.name)) {
      const score = scoresByPlayer.get(player.name);
      weeklyScore = fmtNumber(score, Number.isInteger(score) ? 0 : 1);
    }
    const bestBet = player.best_bet
      ? `${player.best_bet.team || '—'} (${formatLine(player.best_bet.line)})`
      : '—';

    const cells = [player.name, weeklyScore, bestBet, picksSummary || '—'];
    cells.forEach((value, index) => {
      const cell = document.createElement('td');
      if (index === 3 && value !== '—') {
        cell.textContent = '';
        const list = document.createElement('ul');
        list.className = 'picks-list';
        for (const entry of value.split('\n')) {
          const item = document.createElement('li');
          item.textContent = entry;
          list.appendChild(item);
        }
        cell.appendChild(list);
      } else {
        cell.textContent = value;
      }
      row.appendChild(cell);
    });
    playersTableBody.appendChild(row);
  }
}

function computeHeatmapColor(score, minScore, maxScore, theme) {
  if (!Number.isFinite(score)) return null;
  const range = maxScore - minScore;
  const ratio = range === 0 ? 0.5 : (score - minScore) / range;
  const background =
    mixColors(theme.heatmapLow, theme.heatmapHigh, clamp(ratio, 0, 1)) ||
    theme.heatmapLow;
  const luminance = relativeLuminance(background);
  const textColor =
    luminance !== null && luminance < 0.55
      ? theme.heatmapTextLight
      : theme.heatmapTextDark;
  return { background, text: textColor };
}

function renderHeatmap(week, standings, weekName) {
  if (!heatmapTableHead || !heatmapTableBody || !heatmapEmptyState || !heatmapPanel)
    return;

  heatmapTableHead.innerHTML = '';
  heatmapTableBody.innerHTML = '';

  const entries = [];
  for (const player of week.players || []) {
    const originalLine = player.best_bet?.line;
    const line = normaliseLineValue(originalLine);
    const score = getWeeklyScore(player, standings, weekName);
    if (
      typeof line !== 'number' ||
      !Number.isFinite(line) ||
      typeof score !== 'number' ||
      !Number.isFinite(score)
    )
      continue;
    entries.push({
      player: player.name,
      line,
      originalLine,
      score,
    });
  }

  if (entries.length === 0) {
    heatmapEmptyState.hidden = false;
    heatmapPanel.setAttribute('data-empty', 'true');
    if (heatmapLegend) {
      heatmapLegend.style.background = '';
    }
    return;
  }

  heatmapEmptyState.hidden = true;
  heatmapPanel.removeAttribute('data-empty');

  const uniqueLines = Array.from(new Set(entries.map((entry) => entry.line))).sort(
    (a, b) => a - b
  );

  const headerRow = document.createElement('tr');
  const playerHeader = document.createElement('th');
  playerHeader.scope = 'col';
  playerHeader.textContent = 'Player';
  headerRow.appendChild(playerHeader);
  for (const line of uniqueLines) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = formatLine(line);
    headerRow.appendChild(th);
  }
  heatmapTableHead.appendChild(headerRow);

  const players = Array.from(new Set(entries.map((entry) => entry.player))).sort((a, b) =>
    a.localeCompare(b)
  );

  const minScore = Math.min(...entries.map((entry) => entry.score));
  const maxScore = Math.max(...entries.map((entry) => entry.score));
  const theme = getThemeTokens();

  if (heatmapLegend) {
    const lowColor =
      computeHeatmapColor(minScore, minScore, maxScore, theme)?.background || theme.heatmapLow;
    const highColor =
      computeHeatmapColor(maxScore, minScore, maxScore, theme)?.background || theme.heatmapHigh;
    heatmapLegend.style.background = `linear-gradient(90deg, ${lowColor}, ${highColor})`;
  }

  for (const player of players) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('th');
    nameCell.scope = 'row';
    nameCell.textContent = player;
    row.appendChild(nameCell);

    for (const line of uniqueLines) {
      const cell = document.createElement('td');
      const match = entries.find(
        (entry) => entry.player === player && entry.line === line
      );
      if (match) {
        const color = computeHeatmapColor(match.score, minScore, maxScore, theme);
        if (color) {
          cell.style.setProperty('--heatmap-color', color.background);
          cell.style.background = color.background;
          cell.style.color = color.text;
        }
        cell.textContent = fmtNumber(match.score, 0);
        cell.setAttribute('data-score', match.score);
        cell.setAttribute('data-line', formatLine(match.originalLine ?? match.line));
        cell.title = `${player} best bet ${formatLine(
          match.originalLine ?? match.line
        )} → score ${fmtNumber(
          match.score,
          0
        )}`;
      } else {
        cell.textContent = '—';
        cell.classList.add('heatmap-cell--empty');
      }
      row.appendChild(cell);
    }

    heatmapTableBody.appendChild(row);
  }
}

function prepareScatterData(week, standings, weekName) {
  const points = [];
  for (const player of week.players || []) {
    const lineValue = normaliseLineValue(player.best_bet?.line);
    if (!player.best_bet || typeof lineValue !== 'number' || !Number.isFinite(lineValue)) continue;
    const score = getWeeklyScore(player, standings, weekName);
    if (typeof score !== 'number' || !Number.isFinite(score)) continue;
    points.push({
      x: lineValue,
      y: score,
      label: player.name,
    });
  }
  return points;
}

function prepareBarData(scatterPoints) {
  const buckets = new Map();
  for (const point of scatterPoints) {
    const key = Math.round(Math.abs(point.x));
    const bucket = buckets.get(key) || { total: 0, count: 0 };
    bucket.total += point.y;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const labels = Array.from(buckets.keys()).sort((a, b) => a - b);
  const averages = labels.map((label) =>
    buckets.get(label) ? buckets.get(label).total / buckets.get(label).count : 0
  );
  return { labels, averages };
}

function renderCharts(week, standings, weekName) {
  const scatterCtx = document.querySelector('#scatter-chart');
  const barCtx = document.querySelector('#bar-chart');

  if (!scatterCtx || !barCtx || typeof Chart === 'undefined') {
    if (scatterChart) {
      scatterChart.destroy();
      scatterChart = null;
    }
    if (barChart) {
      barChart.destroy();
      barChart = null;
    }
    return;
  }

  const scatterData = prepareScatterData(week, standings, weekName);
  const barData = prepareBarData(scatterData);
  const theme = getThemeTokens();

  if (scatterChart) scatterChart.destroy();
  if (barChart) barChart.destroy();

  scatterChart = new Chart(scatterCtx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Line vs. Score',
          data: scatterData,
          parsing: false,
          borderColor: theme.chartScatterBorder,
          backgroundColor: theme.chartScatterFill,
          pointBackgroundColor: theme.chartScatterFill,
          pointBorderColor: theme.chartScatterBorder,
          pointRadius: 6,
          pointHoverRadius: 9,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          backgroundColor: theme.chartTooltip,
          borderColor: theme.chartScatterBorder,
          borderWidth: 1,
          titleColor: theme.chartAxis,
          bodyColor: theme.chartAxis,
          callbacks: {
            label(context) {
              const point = context.raw;
              return `${point.label}: line ${formatLine(point.x)} → score ${point.y}`;
            },
          },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'Best Bet Line', color: theme.chartAxis },
          grid: { color: theme.chartGrid },
          ticks: { color: theme.chartTick },
        },
        y: {
          title: { display: true, text: 'Weekly Score', color: theme.chartAxis },
          beginAtZero: true,
          grid: { color: theme.chartGrid },
          ticks: { color: theme.chartTick },
        },
      },
    },
  });

  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: barData.labels.map((label) => `${label}-pt swings`),
      datasets: [
        {
          label: 'Average Score',
          data: barData.averages,
          backgroundColor: theme.chartBarFill,
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Average Weekly Score', color: theme.chartAxis },
          grid: { color: theme.chartGrid },
          ticks: { color: theme.chartTick },
        },
        x: {
          title: { display: true, text: 'Absolute Line (rounded)', color: theme.chartAxis },
          grid: { display: false },
          ticks: { color: theme.chartTick },
        },
      },
    },
  });

  const scatterCard = scatterCtx.closest('.chart-card');
  if (scatterCard) {
    if (scatterData.length === 0) {
      scatterCard.classList.add('chart-card--empty');
      scatterCard.setAttribute('data-empty', 'No best bet lines with scores to show.');
    } else {
      scatterCard.classList.remove('chart-card--empty');
      scatterCard.removeAttribute('data-empty');
    }
  }

  const barCard = barCtx.closest('.chart-card');
  if (barCard) {
    if (barData.labels.length === 0) {
      barCard.classList.add('chart-card--empty');
      barCard.setAttribute('data-empty', 'No line buckets available.');
    } else {
      barCard.classList.remove('chart-card--empty');
      barCard.removeAttribute('data-empty');
    }
  }
}

function updateWeek(weekName) {
  if (!dataset || !dataset.weeks) return;

  const week = dataset.weeks.find((entry) => entry.name === weekName);
  if (!week) return;

  renderSchedule(week);
  renderPlayers(week, dataset.standings, weekName);
  renderCharts(week, dataset.standings, weekName);
  renderHeatmap(week, dataset.standings, weekName);
}

async function init() {
  const response = await fetch('assets/grid-data.json');
  dataset = await response.json();

  if (dataset.generatedAt && generatedAtEl) {
    const generated = new Date(dataset.generatedAt);
    generatedAtEl.textContent = `Data refreshed ${generated.toLocaleString()}`;
  }

  renderLeaderboard(dataset.standings);

  const weeks = Array.isArray(dataset.weeks) ? dataset.weeks : [];
  const availableWeeks = weeks.filter((week) => week.players?.length || week.schedule?.length);
  const defaultWeekName = availableWeeks[0]?.name || weeks[0]?.name || null;

  if (teamWeekSelect) {
    teamWeekSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All weeks';
    allOption.selected = true;
    teamWeekSelect.appendChild(allOption);

    const weeksForSelect = availableWeeks.length ? availableWeeks : weeks;
    weeksForSelect.forEach((week) => {
      if (!week?.name) return;
      const option = buildOption(week.name);
      teamWeekSelect.appendChild(option);
    });

    teamWeekSelect.disabled = !weeksForSelect.length;

    teamWeekSelect.addEventListener('change', (event) => {
      const selected = event.target.value;
      renderTeamStats(weeks, selected || null);
    });
  }

  renderTeamStats(weeks, teamWeekSelect?.value || null);

  if (weekSelect && weeks.length) {
    availableWeeks.forEach((week, index) => {
      const option = buildOption(week.name);
      if (index === 0) option.selected = true;
      weekSelect.appendChild(option);
    });

    if (!weekSelect.value && defaultWeekName) {
      weekSelect.appendChild(buildOption(defaultWeekName));
      weekSelect.value = defaultWeekName;
    }

    weekSelect.addEventListener('change', (event) => updateWeek(event.target.value));
  }

  const initialWeek = weekSelect?.value || defaultWeekName;
  if (initialWeek) {
    updateWeek(initialWeek);
  }

  const refreshForTheme = () => {
    if (!dataset) return;
    const activeWeek = weekSelect?.value || defaultWeekName;
    if (activeWeek) {
      updateWeek(activeWeek);
    }
  };

  const themeMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  if (themeMedia) {
    if (typeof themeMedia.addEventListener === 'function') {
      themeMedia.addEventListener('change', refreshForTheme);
    } else if (typeof themeMedia.addListener === 'function') {
      themeMedia.addListener(refreshForTheme);
    }
  }
}

init().catch((error) => {
  console.error('Unable to initialise dashboard', error);
  if (scheduleEmptyState) {
    scheduleEmptyState.hidden = false;
    scheduleEmptyState.textContent = 'Failed to load grid data.';
  }
  if (playersEmptyState) {
    playersEmptyState.hidden = false;
    playersEmptyState.textContent = 'Failed to load grid data.';
  }
  if (leaderboardEmptyState) {
    leaderboardEmptyState.hidden = false;
    leaderboardEmptyState.textContent = 'Failed to load grid data.';
  }
  if (teamBetsEmptyState) {
    teamBetsEmptyState.hidden = false;
    teamBetsEmptyState.textContent = 'Failed to load grid data.';
  }
  if (teamPointsEmptyState) {
    teamPointsEmptyState.hidden = false;
    teamPointsEmptyState.textContent = 'Failed to load grid data.';
  }
  if (teamBetsTableBody) {
    teamBetsTableBody.innerHTML = '';
  }
  if (teamPointsTableBody) {
    teamPointsTableBody.innerHTML = '';
  }
  if (teamSummaryContainer) {
    teamSummaryContainer.innerHTML = '';
  }
  if (teamWeekSelect) {
    teamWeekSelect.disabled = true;
  }
});
