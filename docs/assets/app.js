const weekSelect = document.querySelector('#week-select');
const generatedAtEl = document.querySelector('#generated-at');
const scheduleTableBody = document.querySelector('#schedule-table tbody');
const scheduleEmptyState = document.querySelector('#schedule-empty');
const playersTableBody = document.querySelector('#players-table tbody');
const playersEmptyState = document.querySelector('#players-empty');
const summaryContainer = document.querySelector('#player-summary');
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

function buildOption(weekName) {
  const option = document.createElement('option');
  option.value = weekName;
  option.textContent = weekName;
  return option;
}

function formatLine(line) {
  if (line === null || line === undefined || line === '') return '—';
  if (typeof line === 'number') {
    return line > 0 ? `+${line}` : line.toString();
  }
  return line;
}

function renderSchedule(schedule) {
  scheduleTableBody.innerHTML = '';
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
    const cells = [
      game.team || '—',
      game.opponent || '—',
      formatLine(game.line ?? game.opponent_line),
      dateDisplay,
      game.time || '—',
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
  summaryContainer.innerHTML = '';
  if (!players.length) return;

  const activePlayers = players.filter((player) => standingsForWeek.has(player.name));
  const scoredPlayers = activePlayers.filter((player) =>
    typeof standingsForWeek.get(player.name) === 'number'
  );
  const playersWithLines = players.filter(
    (player) => player.best_bet && typeof player.best_bet.line === 'number'
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
  playersTableBody.innerHTML = '';
  if (!week.players || week.players.length === 0) {
    playersEmptyState.hidden = false;
    summaryContainer.innerHTML = '';
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
  heatmapTableHead.innerHTML = '';
  heatmapTableBody.innerHTML = '';

  if (!heatmapPanel) return;

  const entries = [];
  for (const player of week.players || []) {
    const line = player.best_bet?.line;
    const score = standings[player.name]?.[weekName];
    if (typeof line !== 'number' || typeof score !== 'number') continue;
    entries.push({
      player: player.name,
      line,
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
        cell.setAttribute('data-line', formatLine(match.line));
        cell.title = `${player} best bet ${formatLine(match.line)} → score ${fmtNumber(
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
  for (const player of week.players) {
    if (!player.best_bet || typeof player.best_bet.line !== 'number') continue;
    const score = standings[player.name]?.[weekName];
    if (typeof score !== 'number') continue;
    points.push({
      x: player.best_bet.line,
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
  const scatterData = prepareScatterData(week, standings, weekName);
  const barData = prepareBarData(scatterData);

  const scatterCtx = document.querySelector('#scatter-chart');
  const barCtx = document.querySelector('#bar-chart');

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
  if (scatterData.length === 0) {
    scatterCard.classList.add('chart-card--empty');
    scatterCard.setAttribute('data-empty', 'No best bet lines with scores to show.');
  } else {
    scatterCard.classList.remove('chart-card--empty');
    scatterCard.removeAttribute('data-empty');
  }

  const barCard = barCtx.closest('.chart-card');
  if (barData.labels.length === 0) {
    barCard.classList.add('chart-card--empty');
    barCard.setAttribute('data-empty', 'No line buckets available.');
  } else {
    barCard.classList.remove('chart-card--empty');
    barCard.removeAttribute('data-empty');
  }
}

function updateWeek(weekName) {
  const week = dataset.weeks.find((entry) => entry.name === weekName);
  if (!week) return;

  renderSchedule(week.schedule);
  renderPlayers(week, dataset.standings, weekName);
  renderCharts(week, dataset.standings, weekName);
  renderHeatmap(week, dataset.standings, weekName);
}

async function init() {
  const response = await fetch('assets/grid-data.json');
  dataset = await response.json();

  if (dataset.generatedAt) {
    const generated = new Date(dataset.generatedAt);
    generatedAtEl.textContent = `Data refreshed ${generated.toLocaleString()}`;
  }

  dataset.weeks
    .filter((week) => week.players.length || week.schedule.length)
    .forEach((week, index) => {
      const option = buildOption(week.name);
      if (index === 0) option.selected = true;
      weekSelect.appendChild(option);
    });

  if (!weekSelect.value && dataset.weeks.length) {
    weekSelect.appendChild(buildOption(dataset.weeks[0].name));
    weekSelect.value = dataset.weeks[0].name;
  }

  weekSelect.addEventListener('change', (event) => updateWeek(event.target.value));

  if (weekSelect.value) {
    updateWeek(weekSelect.value);
  }
}

init().catch((error) => {
  console.error('Unable to initialise dashboard', error);
  scheduleEmptyState.hidden = false;
  scheduleEmptyState.textContent = 'Failed to load grid data.';
});
