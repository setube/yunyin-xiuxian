#!/usr/bin/env python3
"""RIL — Repository Intelligence Layer.

Typed engineering graph for the autonomous engineering loop.
Single source of truth: .planning/ril/graph.json (committed, auditable).

All reads/writes go through this CLI so schema, edge typing, optimistic
locking, lifecycle and consistency rules are enforced in one place.

Node types: component, issue, hypothesis, evidence, decision, change, task.
Edge types (directed, typed — no untyped "related" edges):
  depends_on  task->task | component->component
  causes      issue->issue            (meta.root_cause: bool)
  blocks      task->task
  validates   evidence->hypothesis
  refutes     evidence->hypothesis
  resolves    change->issue
  supersedes  decision->decision
  addresses   task->issue             (task works the issue)
  located_in  issue->component        (where the issue lives)
  part_of     component->component    (subsystem hierarchy)
  implements  change->task            (change delivers the task)
  governs     decision->component|task (decision constrains target)

Lifecycle: status in active|stale|resolved|superseded|abandoned.
  - hypothesis/evidence carry confidence (0..1); evidence is append-only.
  - decision is immutable once written; change requires a new decision
    plus a supersedes edge.
  - stale: hypothesis/task untouched for N rounds (default 10) is marked
    stale (never deleted — audit trail). EVALUATE skips stale by default.

Concurrency: every node carries a monotonically increasing `version`.
Mutations require --expect-version; mismatch exits non-zero so callers
re-read and merge instead of clobbering. Task locks: `lock_owner` +
`lock_until` (ISO-8601); expired locks are ignored/auto-released.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


def _repo_root() -> Path:
    """Locate the repository root owning .planning/ril (or nearest git root)."""
    here = Path(__file__).resolve()
    for parent in (here, *here.parents):
        if (parent / ".planning" / "ril").exists():
            return parent
    git = shutil.which("git")
    if git is not None:
        with contextlib.suppress(OSError, subprocess.CalledProcessError):
            out = subprocess.run(  # noqa: S603 — fixed git argv, not user input
                [git, "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
                check=True,
            )
            root = Path(out.stdout.strip())
            if root.is_dir():
                return root
    print(f"ril: error: cannot locate repository root (.planning/ril) from {here}", file=sys.stderr)
    sys.exit(1)


STORE = _repo_root() / ".planning" / "ril" / "graph.json"

NODE_TYPES = {"component", "issue", "hypothesis", "evidence", "decision", "change", "task"}
STATUSES = {"active", "stale", "resolved", "superseded", "abandoned"}

EDGE_TYPES = {
    "depends_on": {("task", "task"), ("component", "component")},
    "causes": {("issue", "issue")},
    "blocks": {("task", "task")},
    "validates": {("evidence", "hypothesis")},
    "refutes": {("evidence", "hypothesis")},
    "resolves": {("change", "issue")},
    "supersedes": {("decision", "decision")},
    "addresses": {("task", "issue")},
    "located_in": {("issue", "component")},
    "part_of": {("component", "component")},
    "implements": {("change", "task")},
    "governs": {("decision", "component"), ("decision", "task")},
}

PREFIX = {
    "component": "COMP",
    "issue": "ISS",
    "hypothesis": "HYP",
    "evidence": "EV",
    "decision": "DEC",
    "change": "CHG",
    "task": "TASK",
}

CATEGORY_WEIGHTS = {
    "correctness": 10,
    "security": 10,
    "stability": 8,
    "critical-bug": 8,
    "core-feature": 6,
    "performance": 5,
    "test-quality": 4,
    "maintainability": 3,
    "dx": 2,
    "docs": 1,
}


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def fail(msg: str) -> sys.NoReturn:
    print(f"ril: error: {msg}", file=sys.stderr)
    sys.exit(1)


def load() -> dict:
    if not STORE.exists():
        fail(f"store not found at {STORE}; run `ril.py init` first")
    return json.loads(STORE.read_text())


def save(graph: dict) -> None:
    graph["updated_at"] = now()
    tmp = STORE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(graph, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(STORE)


def next_id(graph: dict, ntype: str) -> str:
    prefix = PREFIX[ntype]
    max_n = 0
    for node in graph["nodes"].values():
        if node["type"] == ntype and node["id"].startswith(prefix + "-"):
            with contextlib.suppress(ValueError):
                max_n = max(max_n, int(node["id"].split("-", 1)[1]))
    return f"{prefix}-{max_n + 1:03d}"


# Fields whose value must stay a string, whatever it looks like.
#
# `parse_fields` JSON-decodes every value so callers can pass `severity=0.85` or
# `alternatives_rejected=["a","b"]`. But a git short hash is *also* valid JSON
# syntax when it happens to be all digits with an `e`: `--field commit=8564e98`
# parses to the float 8.564e+98, and `83745e4` to 837450000.0. That silently
# corrupts the store (three nodes were damaged this way in round 265 alone, and
# the long-float form then breaks `vp fmt --check` on every commit). Strings
# that never carry numeric or structured meaning belong here.
STRING_FIELDS = {
    "id",
    "type",
    "status",
    "commit",
    "source",
    "category",
    "summary",
    "rationale",
    "alternatives_rejected",
    "created_at",
    "updated_at",
    "lock_owner",
    "lock_until",
}


def parse_fields(pairs: list[str]) -> dict:
    fields: dict = {}
    for pair in pairs or []:
        if "=" not in pair:
            fail(f"field must be key=value, got: {pair!r}")
        key, value = pair.split("=", 1)
        if key.rstrip(":") != key:
            fail(f"field name must not end with ':': {key!r}")
        if key in STRING_FIELDS:
            fields[key] = value
            continue
        try:
            fields[key] = json.loads(value)
        except json.JSONDecodeError:
            fields[key] = value
    return fields


def _num(task: dict, key: str, default: float) -> float:
    """Coerce a task score field to float, degrading to `default` on missing or
    non-numeric legacy data instead of crashing the whole command."""
    value = task.get(key)
    if value is None or isinstance(value, bool):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def priority_score(task: dict) -> float:
    weight = CATEGORY_WEIGHTS.get(task.get("category", ""), 1)
    if "category_weight" in task:
        weight = _num(task, "category_weight", weight)
    severity = _num(task, "severity", 0.5)
    confidence = _num(task, "confidence", 0.5)
    effort = max(_num(task, "effort", 1.0), 0.1)
    unlock = _num(task, "unlock_factor", 1.0)
    return round(weight * severity * confidence * (1.0 / (effort**0.5)) * unlock, 3)


def lock_held(task: dict) -> bool:
    owner = task.get("lock_owner")
    until = task.get("lock_until")
    if not owner or not until:
        return False
    try:
        return datetime.fromisoformat(until) > datetime.now(UTC)
    except ValueError:
        return False


def cmd_init(args: argparse.Namespace) -> None:
    if STORE.exists() and not args.force:
        fail(f"store already exists at {STORE} (use --force to reset)")
    STORE.parent.mkdir(parents=True, exist_ok=True)
    save(
        {
            "ril_version": 1,
            "round": 0,
            "created_at": now(),
            "updated_at": now(),
            "nodes": {},
            "edges": [],
        }
    )
    print(f"initialized RIL store at {STORE}")


def cmd_node_add(args: argparse.Namespace) -> None:
    graph = load()
    ntype = args.type
    if ntype not in NODE_TYPES:
        fail(f"unknown node type {ntype!r}; expected one of {sorted(NODE_TYPES)}")
    fields = parse_fields(args.field)
    node_id = args.id or next_id(graph, ntype)
    if node_id in graph["nodes"]:
        fail(f"node {node_id} already exists (version {graph['nodes'][node_id]['version']})")
    if ntype == "hypothesis" and "confidence" not in fields:
        fail("hypothesis nodes require confidence=<0..1>")
    if ntype == "evidence":
        if "source" not in fields:
            fail("evidence nodes require source=<commit|test|file:line>")
        fields.setdefault("confidence", 1.0)
    if ntype == "decision":
        for required in ("rationale", "alternatives_rejected"):
            if required not in fields:
                fail(f"decision nodes require {required}=")
    if ntype == "change" and "commit" not in fields:
        fail("change nodes require commit=<hash>")
    if ntype == "task" and "category" not in fields and "category_weight" not in fields:
        fail(f"task nodes require category=<{'|'.join(sorted(CATEGORY_WEIGHTS))}>")
    status = fields.pop("status", "active")
    if status not in STATUSES:
        fail(f"invalid status {status!r}")
    node = {
        "id": node_id,
        "type": ntype,
        "status": status,
        "version": 1,
        "created_at": now(),
        "updated_at": now(),
        "touched_round": graph["round"],
        **fields,
    }
    graph["nodes"][node_id] = node
    save(graph)
    score = f" priority_score={priority_score(node)}" if ntype == "task" else ""
    print(f"{node_id}{score}")


def cmd_node_set(args: argparse.Namespace) -> None:
    graph = load()
    node = graph["nodes"].get(args.id)
    if node is None:
        fail(f"node {args.id} not found")
    if args.expect_version is not None and node["version"] != args.expect_version:
        print(json.dumps(node, indent=2, ensure_ascii=False), file=sys.stderr)
        fail(
            f"version conflict on {args.id}: expected {args.expect_version}, "
            f"found {node['version']} (node dumped to stderr; re-read and merge)"
        )
    if node["type"] == "decision" and args.field:
        editable = {"status"}
        for pair in args.field:
            if pair.split("=", 1)[0] not in editable:
                fail("decision nodes are immutable; record a new decision and add a supersedes edge instead")
    # `--unset` exists only to clear malformed field names (an old quoting
    # mistake wrote `severity:` alongside `severity`). It is deliberately not a
    # general eraser: append-only evidence stays append-only for real fields.
    for key in args.unset or []:
        if key.rstrip(":") == key:
            fail(
                f"refusing to unset well-formed field {key!r}; only malformed names may be removed"
            )
        node.pop(key, None)
    if node["type"] == "evidence" and args.field:
        fail("evidence nodes are append-only; add new evidence instead")
    fields = parse_fields(args.field)
    status = fields.pop("status", None)
    if status is not None:
        if status not in STATUSES:
            fail(f"invalid status {status!r}")
        node["status"] = status
    node.update(fields)
    node["version"] += 1
    node["updated_at"] = now()
    node["touched_round"] = graph["round"]
    save(graph)
    print(f"{node['id']} v{node['version']}")


def cmd_edge_add(args: argparse.Namespace) -> None:
    graph = load()
    if args.type not in EDGE_TYPES:
        fail(f"unknown edge type {args.type!r}; expected one of {sorted(EDGE_TYPES)}")
    src = graph["nodes"].get(getattr(args, "from"))
    dst = graph["nodes"].get(args.to)
    if src is None or dst is None:
        missing = args.to if src else getattr(args, "from")
        fail(f"node {missing} not found")
    pair = (src["type"], dst["type"])
    if pair not in EDGE_TYPES[args.type]:
        fail(f"edge {args.type} does not allow {src['type']}->{dst['type']}")
    for edge in graph["edges"]:
        if edge["from"] == src["id"] and edge["to"] == dst["id"] and edge["type"] == args.type:
            fail("duplicate edge already exists")
    graph["edges"].append(
        {
            "from": src["id"],
            "to": dst["id"],
            "type": args.type,
            "created_at": now(),
            **parse_fields(args.field),
        }
    )
    for node in (src, dst):
        node["touched_round"] = graph["round"]
    save(graph)
    print(f"{src['id']} -{args.type}-> {dst['id']}")


def cmd_edge_rm(args: argparse.Namespace) -> None:
    graph = load()
    before = len(graph["edges"])
    graph["edges"] = [
        edge
        for edge in graph["edges"]
        if not (edge["from"] == getattr(args, "from") and edge["to"] == args.to and edge["type"] == args.type)
    ]
    if len(graph["edges"]) == before:
        fail("no matching edge found")
    save(graph)
    print(f"removed {getattr(args, 'from')} -{args.type}-> {args.to}")


def cmd_tasks(args: argparse.Namespace) -> None:
    graph = load()
    rows = []
    for node in graph["nodes"].values():
        if node["type"] != "task":
            continue
        if node["status"] == "active" or (args.all and node["status"] != "abandoned"):
            rows.append(node)
    rows.sort(key=priority_score, reverse=True)
    for node in rows[: args.top]:
        lock = " LOCKED" if lock_held(node) else ""
        print(
            f"{priority_score(node):8.2f}  {node['id']}  [{node['status']}]{lock}  "
            f"{node.get('category', '?')}  {node.get('title', '')}"
        )


def cmd_show(args: argparse.Namespace) -> None:
    graph = load()
    node = graph["nodes"].get(args.id)
    if node is None:
        fail(f"node {args.id} not found")
    print(json.dumps(node, indent=2, ensure_ascii=False))
    if args.hops > 0:
        seen = {args.id}
        frontier = {args.id}
        for _ in range(args.hops):
            next_frontier = set()
            for edge in graph["edges"]:
                if edge["from"] in frontier and edge["to"] not in seen:
                    next_frontier.add(edge["to"])
                if edge["to"] in frontier and edge["from"] not in seen:
                    next_frontier.add(edge["from"])
            seen |= next_frontier
            frontier = next_frontier
        seen.discard(args.id)
        for node_id in sorted(seen):
            other = graph["nodes"][node_id]
            print(f"  ~ {node_id} [{other['type']}/{other['status']}] {other.get('title', '')}")


def cmd_lock(args: argparse.Namespace) -> None:
    graph = load()
    node = graph["nodes"].get(args.id)
    if node is None or node["type"] != "task":
        fail(f"task {args.id} not found")
    if lock_held(node) and node.get("lock_owner") != args.owner:
        fail(f"{args.id} is locked by {node.get('lock_owner')} until {node.get('lock_until')}")
    node["lock_owner"] = args.owner
    node["lock_until"] = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    node["lock_until"] = (datetime.fromisoformat(node["lock_until"].replace("Z", "+00:00"))).isoformat()
    from datetime import timedelta

    node["lock_until"] = (datetime.now(UTC) + timedelta(minutes=args.minutes)).isoformat(timespec="seconds")
    node["status"] = "active"
    node["version"] += 1
    node["updated_at"] = now()
    save(graph)
    print(f"locked {args.id} for {args.owner} until {node['lock_until']}")


def cmd_unlock(args: argparse.Namespace) -> None:
    graph = load()
    node = graph["nodes"].get(args.id)
    if node is None or node["type"] != "task":
        fail(f"task {args.id} not found")
    node.pop("lock_owner", None)
    node.pop("lock_until", None)
    node["version"] += 1
    node["updated_at"] = now()
    save(graph)
    print(f"unlocked {args.id}")


def cmd_round(_args: argparse.Namespace) -> None:
    graph = load()
    graph["round"] += 1
    save(graph)
    print(f"round={graph['round']}")


def cmd_stale(args: argparse.Namespace) -> None:
    graph = load()
    cutoff = graph["round"] - args.rounds
    marked = []
    for node in graph["nodes"].values():
        if (
            node["type"] in {"hypothesis", "task"}
            and node["status"] == "active"
            and node.get("touched_round", 0) < cutoff
        ):
            node["status"] = "stale"
            node["version"] += 1
            node["updated_at"] = now()
            marked.append(node["id"])
    save(graph)
    print(f"marked stale: {len(marked)} {marked if marked else ''}".rstrip())


def cmd_check(_args: argparse.Namespace) -> None:
    graph = load()
    problems = []
    connected = set()
    for edge in graph["edges"]:
        connected.add(edge["from"])
        connected.add(edge["to"])
        if edge["from"] not in graph["nodes"] or edge["to"] not in graph["nodes"]:
            problems.append(f"dangling edge {edge['from']}->{edge['to']}")
    # Orphan audit artifacts (evidence, decisions, components) may stand
    # alone — they are append-only records. Orphan issues/hypotheses/
    # tasks/changes indicate unconnected work and are flagged.
    problems.extend(
        f"orphan {node['id']} ({node['type']})"
        for node in graph["nodes"].values()
        if node["id"] not in connected and node["type"] in {"issue", "hypothesis", "task", "change"}
    )
    # depends_on cycles among tasks
    deps: dict[str, list[str]] = {}
    for edge in graph["edges"]:
        if edge["type"] in {"depends_on", "blocks"}:
            deps.setdefault(edge["from"], []).append(edge["to"])

    def has_cycle(start: str) -> bool:
        stack, seen = [start], set()
        while stack:
            current = stack.pop()
            for nxt in deps.get(current, []):
                if nxt == start:
                    return True
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        return False

    problems.extend(f"dependency cycle involving {source}" for source in deps if has_cycle(source))
    for node in graph["nodes"].values():
        if node["type"] == "task":
            sev = node.get("severity")
            if sev is not None and not isinstance(sev, (int, float)):
                problems.append(f"task {node['id']} severity is non-numeric: {sev!r} (expect 0-1 float)")
        # A change node's `commit` is a git short hash. Numeric-looking hashes
        # (`8564e98`, `83745e4`) used to be silently floated by parse_fields;
        # check catches any that slip through (the long-float form also breaks
        # `vp fmt --check` and fails every commit).
        if node["type"] == "change":
            commit = node.get("commit")
            if not isinstance(commit, str):
                problems.append(
                    f"change {node['id']} commit is {type(commit).__name__} ({commit!r}), "
                    "expect a short hash string"
                )
        if node["type"] == "hypothesis" and node["status"] == "active":
            has_evidence = any(
                edge["to"] == node["id"] and edge["type"] in {"validates", "refutes"} for edge in graph["edges"]
            )
            if not has_evidence:
                problems.append(f"hypothesis {node['id']} has no validates/refutes evidence")
        # Field names are exact keys; `severity:`/`status:`/`confidence:` are
        # typos from an old quoting mistake that silently duplicate the field.
        for key in node:
            if key.rstrip(":") != key:
                problems.append(f"node {node['id']} has malformed field name {key!r}")
    if problems:
        for problem in problems:
            print(f"  ! {problem}")
        print(f"{len(problems)} problem(s)")
        sys.exit(1)
    print(f"graph consistent: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")


def main() -> None:
    parser = argparse.ArgumentParser(prog="ril", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="create the graph store")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_init)

    p = sub.add_parser("node", help="node operations")
    nsub = p.add_subparsers(dest="op", required=True)
    pa = nsub.add_parser("add")
    pa.add_argument("--type", required=True)
    pa.add_argument("--id")
    pa.add_argument("--field", action="append", help="key=value (JSON values allowed)")
    pa.set_defaults(fn=cmd_node_add)
    ps = nsub.add_parser("set")
    ps.add_argument("--id", required=True)
    ps.add_argument("--field", action="append")
    ps.add_argument("--expect-version", type=int)
    ps.add_argument("--unset", action="append", help="remove a malformed legacy field name")
    ps.set_defaults(fn=cmd_node_set)

    p = sub.add_parser("edge", help="edge operations")
    esub = p.add_subparsers(dest="op", required=True)
    pe = esub.add_parser("add")
    pe.add_argument("--from", required=True)
    pe.add_argument("--to", required=True)
    pe.add_argument("--type", required=True)
    pe.add_argument("--field", action="append")
    pe.set_defaults(fn=cmd_edge_add)
    pr = esub.add_parser("rm", help="remove a typed edge")
    pr.add_argument("--from", required=True)
    pr.add_argument("--to", required=True)
    pr.add_argument("--type", required=True)
    pr.set_defaults(fn=cmd_edge_rm)

    p = sub.add_parser("tasks", help="list active tasks by priority_score")
    p.add_argument("--top", type=int, default=10)
    p.add_argument("--all", action="store_true")
    p.set_defaults(fn=cmd_tasks)

    p = sub.add_parser("show", help="show a node and its neighbourhood")
    p.add_argument("--id", required=True)
    p.add_argument("--hops", type=int, default=1)
    p.set_defaults(fn=cmd_show)

    p = sub.add_parser("lock", help="take the execution lock on a task")
    p.add_argument("--id", required=True)
    p.add_argument("--owner", required=True)
    p.add_argument("--minutes", type=int, default=30)
    p.set_defaults(fn=cmd_lock)

    p = sub.add_parser("unlock", help="release the execution lock on a task")
    p.add_argument("--id", required=True)
    p.set_defaults(fn=cmd_unlock)

    p = sub.add_parser("round", help="bump the loop round counter")
    p.set_defaults(fn=cmd_round)

    p = sub.add_parser("stale", help="mark untouched hypothesis/task nodes stale")
    p.add_argument("--rounds", type=int, default=10)
    p.set_defaults(fn=cmd_stale)

    p = sub.add_parser("check", help="consistency check (orphans, cycles, unclosed)")
    p.set_defaults(fn=cmd_check)

    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
