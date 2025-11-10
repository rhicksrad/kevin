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

let dataset;
let scatterChart;
let barChart;

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

function renderSummary(players, standingsForWeek) {
  if (!summaryContainer) return;

  summaryContainer.innerHTML = '';
  if (!players.length) return;

  const activePlayers = players.filter((player) => standingsForWeek.has(player.name));
  const scoredPlayers = activePlayers.filter((player) =>
    typeof standingsForWeek.get(player.name) === 'number'
  );
  const playersWithLines = players.filter(
    (player) => normaliseLineValue(player.best_bet?.line) !== null
  );
  const avgScore =
    scoredPlayers.reduce((acc, player) => acc + standingsForWeek.get(player.name), 0) /
    (scoredPlayers.length || 1);

  const cards = [
    { title: 'Players Tracked', value: players.length },
    { title: 'With Official Scores', value: scoredPlayers.length },
    { title: 'Best Bets Logged', value: playersWithLines.length },
    { title: 'Average Score', value: fmtNumber(avgScore, 1) },
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

  const standingsForWeek = new Map();
  for (const [playerName, scores] of Object.entries(standings)) {
    if (scores && weekName in scores) {
      standingsForWeek.set(playerName, scores[weekName]);
    }
  }

  renderSummary(week.players, standingsForWeek);

  for (const player of week.players) {
    const row = document.createElement('tr');
    const picksSummary = player.picks
      .map((pick) => `${pick.points} pts – ${pick.team}`)
      .join('\n');
    const weeklyScore = standingsForWeek.has(player.name)
      ? standingsForWeek.get(player.name)
      : '—';
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

function computeHeatmapColor(score, minScore, maxScore) {
  if (!Number.isFinite(score)) return null;
  const range = maxScore - minScore;
  const ratio = range === 0 ? 0.5 : (score - minScore) / range;
  const hue = 10 + ratio * 120; // red to green range
  const lightness = 55;
  return {
    background: `hsl(${hue}, 78%, ${lightness}%)`,
    text: ratio < 0.35 ? '#f8fafc' : '#0f172a',
  };
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
    const score = standings[player.name]?.[weekName];
    if (typeof line !== 'number' || !Number.isFinite(line) || typeof score !== 'number') continue;
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

  if (heatmapLegend) {
    const lowColor = computeHeatmapColor(minScore, minScore, maxScore)?.background || '#fee2e2';
    const highColor = computeHeatmapColor(maxScore, minScore, maxScore)?.background || '#bbf7d0';
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
        const color = computeHeatmapColor(match.score, minScore, maxScore);
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
    const score = standings[player.name]?.[weekName];
    if (typeof score !== 'number') continue;
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
          borderColor: 'rgba(14, 165, 233, 0.95)',
          backgroundColor: 'rgba(14, 165, 233, 0.65)',
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
          title: { display: true, text: 'Best Bet Line' },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
        },
        y: {
          title: { display: true, text: 'Weekly Score' },
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
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
          backgroundColor: 'rgba(34, 211, 238, 0.65)',
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
          title: { display: true, text: 'Average Weekly Score' },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
        },
        x: {
          title: { display: true, text: 'Absolute Line (rounded)' },
          grid: { display: false },
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

  const availableWeeks = Array.isArray(dataset.weeks)
    ? dataset.weeks.filter((week) => (week.players?.length || week.schedule?.length))
    : [];
  const defaultWeekName =
    availableWeeks[0]?.name || dataset.weeks?.[0]?.name || null;

  if (weekSelect && Array.isArray(dataset.weeks)) {
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
});
