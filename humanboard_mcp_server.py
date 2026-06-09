from __future__ import annotations

import json
import os
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

SNAPSHOT_PATH = Path(os.environ.get("HUMANBOARD_SNAPSHOT_PATH", r"F:\backtest\humanboard\snapshot.json"))
SNAPSHOT_BACKUP_PATH = SNAPSHOT_PATH.with_suffix(SNAPSHOT_PATH.suffix + ".bak")
CORRUPT_SNAPSHOT_DIR = SNAPSHOT_PATH.parent / "corrupt-snapshots"

DEFAULT_SECTIONS = [
    {
        "id": "sec1",
        "name": "Technology & Tools",
        "color": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    {
        "id": "sec2",
        "name": "Finance",
        "color": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
    {
        "id": "sec3",
        "name": "Health & Wellness",
        "color": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    },
    {
        "id": "sec4",
        "name": "Lifestyle & Home",
        "color": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    },
]

DEFAULT_SNAPSHOT = {
    "notes": [],
    "ideas": [],
    "projects": [],
    "sections": DEFAULT_SECTIONS,
    "goals": [],
    "isDarkMode": False,
}

mcp = FastMCP(
    name="HumanBoard",
    instructions=(
        "HumanBoard board access over a snapshot JSON file. "
        "Use these tools to inspect notes, ideas, goals, and projects and to make small, direct updates."
    ),
)


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _clone_default_snapshot() -> dict[str, Any]:
    return deepcopy(DEFAULT_SNAPSHOT)


def _normalize_snapshot(raw: dict[str, Any] | None) -> dict[str, Any]:
    snapshot = _clone_default_snapshot()
    if raw:
        snapshot.update(raw)
    snapshot["notes"] = list(snapshot.get("notes") or [])
    snapshot["ideas"] = list(snapshot.get("ideas") or [])
    snapshot["projects"] = list(snapshot.get("projects") or [])
    snapshot["goals"] = list(snapshot.get("goals") or [])
    snapshot["sections"] = list(snapshot.get("sections") or DEFAULT_SECTIONS)
    snapshot["isDarkMode"] = bool(snapshot.get("isDarkMode", False))
    return snapshot


def _snapshot_archive_suffix() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def _read_snapshot_file(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Snapshot root must be a JSON object: {path}")
    return _normalize_snapshot(raw)


def _archive_snapshot_file(path: Path, reason: str) -> Path:
    CORRUPT_SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    archived_path = CORRUPT_SNAPSHOT_DIR / f"{path.stem}-{_snapshot_archive_suffix()}-{reason}{path.suffix}"
    os.replace(path, archived_path)
    return archived_path


def load_snapshot() -> dict[str, Any]:
    if not SNAPSHOT_PATH.exists():
        snapshot = _clone_default_snapshot()
        save_snapshot(snapshot)
        return snapshot

    try:
        return _read_snapshot_file(SNAPSHOT_PATH)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        _archive_snapshot_file(SNAPSHOT_PATH, "corrupt")
        if SNAPSHOT_BACKUP_PATH.exists():
            try:
                snapshot = _read_snapshot_file(SNAPSHOT_BACKUP_PATH)
                save_snapshot(snapshot)
                return snapshot
            except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
                _archive_snapshot_file(SNAPSHOT_BACKUP_PATH, "backup-corrupt")

        snapshot = _clone_default_snapshot()
        save_snapshot(snapshot)
        return snapshot


def save_snapshot(snapshot: dict[str, Any]) -> None:
    normalized = _normalize_snapshot(snapshot)
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = SNAPSHOT_PATH.with_suffix(SNAPSHOT_PATH.suffix + ".tmp")
    tmp_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    if SNAPSHOT_PATH.exists():
        SNAPSHOT_BACKUP_PATH.write_text(SNAPSHOT_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    os.replace(tmp_path, SNAPSHOT_PATH)


def _sort_key(item: dict[str, Any], primary: str, fallback: str = "id") -> str:
    return str(item.get(primary) or item.get(fallback) or "")


def _match_text(values: list[Any], query: str) -> bool:
    haystack = " ".join(str(v or "") for v in values).casefold()
    return query.casefold() in haystack


def _board_summary(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "snapshot_path": str(SNAPSHOT_PATH),
        "notes": len(snapshot["notes"]),
        "ideas": len(snapshot["ideas"]),
        "projects": len(snapshot["projects"]),
        "goals": len(snapshot["goals"]),
        "sections": len(snapshot["sections"]),
        "idea_stages": _count_by(snapshot["ideas"], "stage"),
        "idea_types": _count_by(snapshot["ideas"], "type"),
        "goal_statuses": _count_by(snapshot["goals"], "status"),
        "project_statuses": _count_by(snapshot["projects"], "status"),
    }


def _count_by(items: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        value = str(item.get(key) or "unknown")
        counts[value] = counts.get(value, 0) + 1
    return counts


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@mcp.tool()
def get_board_summary() -> dict[str, Any]:
    """Return compact HumanBoard counts and category summaries."""
    return _board_summary(load_snapshot())


@mcp.tool()
def get_snapshot() -> dict[str, Any]:
    """Return the full HumanBoard snapshot JSON."""
    return load_snapshot()


@mcp.tool()
def list_notes(limit: int = 50, newest_first: bool = True) -> list[dict[str, Any]]:
    """List notes from HumanBoard."""
    notes = sorted(load_snapshot()["notes"], key=lambda n: _sort_key(n, "createdAt"), reverse=newest_first)
    return notes[: max(0, limit)]


@mcp.tool()
def add_note(content: str) -> dict[str, Any]:
    """Add a raw note to HumanBoard and persist it immediately."""
    snapshot = load_snapshot()
    note = {
        "id": _new_id("note"),
        "content": content,
        "createdAt": now_iso(),
        "layer": "raw",
    }
    snapshot["notes"].insert(0, note)
    save_snapshot(snapshot)
    return note


@mcp.tool()
def delete_note(note_id: str) -> dict[str, Any]:
    """Delete a note by id."""
    snapshot = load_snapshot()
    before = len(snapshot["notes"])
    snapshot["notes"] = [note for note in snapshot["notes"] if str(note.get("id")) != note_id]
    removed = before - len(snapshot["notes"])
    save_snapshot(snapshot)
    return {"deleted": removed > 0, "removed_count": removed, "note_id": note_id}


@mcp.tool()
def list_ideas(limit: int = 100, stage: str | None = None, idea_type: str | None = None) -> list[dict[str, Any]]:
    """List ideas, optionally filtered by stage and/or type."""
    ideas = load_snapshot()["ideas"]
    if stage:
        ideas = [idea for idea in ideas if str(idea.get("stage")) == stage]
    if idea_type:
        ideas = [idea for idea in ideas if str(idea.get("type")) == idea_type]
    ideas = sorted(ideas, key=lambda i: (_sort_key(i, "lastReviewed"), _sort_key(i, "title")), reverse=True)
    return ideas[: max(0, limit)]


@mcp.tool()
def search_board(query: str, limit: int = 25) -> dict[str, Any]:
    """Search notes, ideas, goals, and projects by substring match."""
    snapshot = load_snapshot()
    notes = [
        note for note in snapshot["notes"]
        if _match_text([note.get("content"), note.get("id")], query)
    ][:limit]
    ideas = [
        idea for idea in snapshot["ideas"]
        if _match_text([
            idea.get("title"),
            idea.get("summary"),
            idea.get("content"),
            idea.get("nextAction"),
            " ".join(idea.get("tags") or []),
        ], query)
    ][:limit]
    goals = [
        goal for goal in snapshot["goals"]
        if _match_text([goal.get("title"), goal.get("description"), json.dumps(goal.get("roadmap") or {})], query)
    ][:limit]
    projects = [
        project for project in snapshot["projects"]
        if _match_text([project.get("title"), project.get("description"), project.get("status")], query)
    ][:limit]
    return {
        "query": query,
        "counts": {
            "notes": len(notes),
            "ideas": len(ideas),
            "goals": len(goals),
            "projects": len(projects),
        },
        "notes": notes,
        "ideas": ideas,
        "goals": goals,
        "projects": projects,
    }


@mcp.tool()
def add_idea(
    title: str,
    summary: str,
    content: str,
    idea_type: str = "Concept",
    stage: str = "Seed",
    section_id: str | None = None,
    confidence: int = 5,
    maturity: int = 0,
    next_action: str = "",
) -> dict[str, Any]:
    """Create a new HumanBoard idea."""
    snapshot = load_snapshot()
    idea = {
        "id": _new_id("idea"),
        "title": title,
        "summary": summary,
        "content": content,
        "layer": "knowledge",
        "type": idea_type,
        "stage": stage,
        "sectionId": section_id,
        "confidence": max(1, min(10, int(confidence))),
        "maturity": max(0, min(100, int(maturity))),
        "nextAction": next_action or None,
        "lastReviewed": now_iso(),
        "linkedNoteIds": [],
        "relatedIdeaIds": [],
    }
    snapshot["ideas"].insert(0, idea)
    save_snapshot(snapshot)
    return idea


@mcp.tool()
def update_idea(
    idea_id: str,
    title: str | None = None,
    summary: str | None = None,
    content: str | None = None,
    stage: str | None = None,
    idea_type: str | None = None,
    next_action: str | None = None,
    confidence: int | None = None,
    maturity: int | None = None,
) -> dict[str, Any]:
    """Update selected fields on an existing idea."""
    snapshot = load_snapshot()
    for idea in snapshot["ideas"]:
        if str(idea.get("id")) != idea_id:
            continue
        if title is not None:
            idea["title"] = title
        if summary is not None:
            idea["summary"] = summary
        if content is not None:
            idea["content"] = content
        if stage is not None:
            idea["stage"] = stage
        if idea_type is not None:
            idea["type"] = idea_type
        if next_action is not None:
            idea["nextAction"] = next_action
        if confidence is not None:
            idea["confidence"] = max(1, min(10, int(confidence)))
        if maturity is not None:
            idea["maturity"] = max(0, min(100, int(maturity)))
        idea["lastReviewed"] = now_iso()
        save_snapshot(snapshot)
        return idea
    raise ValueError(f"Idea not found: {idea_id}")


@mcp.tool()
def list_goals(limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
    """List goals, optionally filtered by status."""
    goals = load_snapshot()["goals"]
    if status:
        goals = [goal for goal in goals if str(goal.get("status")) == status]
    goals = sorted(goals, key=lambda g: _sort_key(g, "createdAt"), reverse=True)
    return goals[: max(0, limit)]


@mcp.tool()
def add_goal(title: str, description: str = "", status: str = "Active") -> dict[str, Any]:
    """Create a HumanBoard goal."""
    snapshot = load_snapshot()
    goal = {
        "id": _new_id("goal"),
        "title": title,
        "description": description,
        "status": status,
        "createdAt": now_iso(),
    }
    snapshot["goals"].insert(0, goal)
    save_snapshot(snapshot)
    return goal


@mcp.tool()
def update_goal(
    goal_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    roadmap_knowledge: list[str] | None = None,
    roadmap_ideas: list[str] | None = None,
    roadmap_todos: list[str] | None = None,
) -> dict[str, Any]:
    """Update a HumanBoard goal and optionally replace its roadmap fields."""
    snapshot = load_snapshot()
    for goal in snapshot["goals"]:
        if str(goal.get("id")) != goal_id:
            continue
        if title is not None:
            goal["title"] = title
        if description is not None:
            goal["description"] = description
        if status is not None:
            goal["status"] = status
        if any(value is not None for value in (roadmap_knowledge, roadmap_ideas, roadmap_todos)):
            goal["roadmap"] = {
                "knowledge": roadmap_knowledge or [],
                "ideas": roadmap_ideas or [],
                "todos": roadmap_todos or [],
            }
        save_snapshot(snapshot)
        return goal
    raise ValueError(f"Goal not found: {goal_id}")


@mcp.tool()
def list_projects(limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
    """List HumanBoard projects."""
    projects = load_snapshot()["projects"]
    if status:
        projects = [project for project in projects if str(project.get("status")) == status]
    projects = sorted(projects, key=lambda p: _sort_key(p, "title"))
    return projects[: max(0, limit)]


if __name__ == "__main__":
    mcp.run()
