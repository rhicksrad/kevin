import json
from datetime import UTC, datetime, time
from pathlib import Path
from typing import Any, Dict, List, Optional

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
GRID_PATH = ROOT / "2025 Grid.xlsm"
OUTPUT_PATH = ROOT / "docs" / "assets" / "grid-data.json"


def serialise_datetime(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if value is None:
        return None
    return str(value)


SCHEDULE_COLUMN_GROUPS = ((9, 10, 11), (13, 14, 15))


def normalise_schedule_line(value: Any) -> Any:
    if isinstance(value, (int, float)):
        return float(value)
    return value


def parse_schedule_rows(rows: List[tuple], header_index: int) -> List[Dict[str, Any]]:
    schedule: List[Dict[str, Any]] = []
    current_rows: List[Dict[str, Any]] = [{} for _ in SCHEDULE_COLUMN_GROUPS]

    for row in rows[:header_index]:
        for idx, columns in enumerate(SCHEDULE_COLUMN_GROUPS):
            cells = [row[col] if col < len(row) else None for col in columns]
            if not any(cell is not None for cell in cells):
                continue

            date_or_time, team, line = cells
            if team is None and line is None and date_or_time is None:
                continue

            entry = current_rows[idx]
            if not entry:
                entry.update(
                    {
                        "team": serialise_datetime(team) if team is not None else "",
                        "line": normalise_schedule_line(line),
                        "date": serialise_datetime(date_or_time),
                    }
                )
            else:
                entry.update(
                    {
                        "opponent": serialise_datetime(team) if team is not None else "",
                        "time": serialise_datetime(date_or_time),
                        "opponent_line": normalise_schedule_line(line),
                    }
                )
                schedule.append(entry.copy())
                current_rows[idx] = {}

    for entry in current_rows:
        if entry:
            schedule.append(entry.copy())

    return [
        item
        for item in schedule
        if any(value not in (None, "") for value in item.values())
    ]


def detect_header_row(rows: List[tuple]) -> Optional[int]:
    for idx, row in enumerate(rows):
        if row and row[0] is None and sum(isinstance(cell, (int, float)) for cell in row) >= 2:
            return idx
    for idx, row in enumerate(rows):
        if any(isinstance(cell, (int, float)) for cell in row):
            return idx
    return None


def parse_week_sheet(sheet) -> Dict[str, Any]:
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return {"name": sheet.title, "players": [], "schedule": [], "confidence_points": []}

    header_index = detect_header_row(rows)
    if header_index is None:
        return {
            "name": sheet.title,
            "players": [],
            "schedule": parse_schedule_rows(rows, 0),
            "confidence_points": [],
        }

    header_row = rows[header_index]

    # Confidence point slots live immediately after the first numeric cell.
    confidence_points: List[int] = []
    start_col: Optional[int] = None
    for idx, value in enumerate(header_row):
        if isinstance(value, (int, float)):
            if start_col is None:
                start_col = idx
            confidence_points.append(int(value))
        elif start_col is not None:
            # stop once we hit a non-numeric cell after the numeric streak
            break

    if start_col is None:
        start_col = 1

    total_col = start_col + len(confidence_points)
    best_bet_time_col = total_col + 3
    best_bet_team_col = best_bet_time_col + 1
    best_bet_line_col = best_bet_team_col + 1

    players: List[Dict[str, Any]] = []
    for row in rows[header_index + 1 :]:
        player = row[0]
        if not player:
            continue
        selections = []
        for offset, points in enumerate(confidence_points):
            col_idx = start_col + offset
            pick = row[col_idx]
            if pick:
                selections.append({"team": pick, "points": points})
        total = row[total_col] if total_col < len(row) else None
        best_bet = {
            "time": row[best_bet_time_col] if best_bet_time_col < len(row) else None,
            "team": row[best_bet_team_col] if best_bet_team_col < len(row) else None,
            "line": row[best_bet_line_col] if best_bet_line_col < len(row) else None,
        }
        if not any(best_bet.values()):
            best_bet = None
        else:
            best_bet = {
                "time": serialise_datetime(best_bet.get("time")),
                "team": best_bet.get("team"),
                "line": float(best_bet["line"]) if isinstance(best_bet.get("line"), (int, float)) else best_bet.get("line"),
            }
        players.append(
            {
                "name": player,
                "picks": selections,
                "total_points": total,
                "best_bet": best_bet,
            }
        )

    schedule = parse_schedule_rows(rows, header_index)

    return {
        "name": sheet.title,
        "players": players,
        "schedule": schedule,
        "confidence_points": confidence_points,
    }


def parse_standings(sheet) -> Dict[str, Dict[str, Any]]:
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return {}
    header_row = rows[0]
    try:
        player_col = header_row.index("Player")
    except ValueError as exc:
        raise ValueError("Unable to locate Player column in standings") from exc

    week_columns: Dict[str, int] = {}
    for idx, value in enumerate(header_row):
        if isinstance(value, str) and value.startswith("Week"):
            week_columns[value] = idx

    standings: Dict[str, Dict[str, Any]] = {}
    for row in rows[1:]:
        player = row[player_col]
        if not isinstance(player, str):
            continue
        player_data: Dict[str, Any] = {}
        for week, col_idx in week_columns.items():
            score = row[col_idx] if col_idx < len(row) else None
            if score is not None:
                player_data[week] = score
        standings[player] = player_data
    return standings


def main() -> None:
    workbook = openpyxl.load_workbook(GRID_PATH, data_only=True, read_only=True)

    week_sheets = [
        workbook[sheet]
        for sheet in workbook.sheetnames
        if sheet.startswith("Week ")
    ]
    week_sheets.sort(key=lambda ws: int(ws.title.split()[1]))

    weeks_data = [parse_week_sheet(sheet) for sheet in week_sheets]

    standings_sheet = workbook["Standings"] if "Standings" in workbook.sheetnames else None
    standings = parse_standings(standings_sheet) if standings_sheet else {}

    dataset = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "weeks": weeks_data,
        "standings": standings,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(dataset, indent=2), encoding="utf-8")
    print(f"Wrote data for {len(weeks_data)} weeks to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
