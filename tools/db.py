"""The training database: the single source of truth for the website, the sync and the agents.

SQLAlchemy Core, so the same code runs on Postgres (Railway) and SQLite (tests, local).

    engine = connect(os.environ["DATABASE_URL"])
    create_schema(engine)
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import (
    JSON,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    insert,
    select,
    update,
)
from sqlalchemy.engine import Engine

from tools.store import activity_id, merge, prepare, same_start

meta = MetaData()

activities = Table(
    "activities",
    meta,
    Column("id", String(64), primary_key=True),
    Column("start_local", String(19), nullable=False, index=True),
    Column("start_utc", String(20), nullable=False),
    Column("sport", String(40), nullable=False, index=True),
    Column("data", JSON, nullable=False),  # the merged record without streams
)
streams = Table(
    "activity_streams",
    meta,
    Column("activity_id", String(64), ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True),
    Column("data", JSON, nullable=False),
)
fit_files = Table(
    "fit_files",
    meta,
    Column("activity_id", String(64), primary_key=True),
    Column("data", LargeBinary, nullable=False),
)
wellness = Table("wellness", meta, Column("day", String(10), primary_key=True), Column("data", JSON, nullable=False))
settings = Table("settings", meta, Column("key", String(64), primary_key=True), Column("value", JSON, nullable=False))
documents = Table(
    "documents",
    meta,
    Column("key", String(64), primary_key=True),
    Column("body", Text, nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Column("updated_by", String(40), nullable=False),
)
entries = Table(
    "entries",
    meta,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("kind", String(20), nullable=False, index=True),  # log | analysis
    Column("day", String(10), nullable=False, index=True),
    Column("title", String(200), nullable=False),
    Column("body", Text, nullable=False),
    Column("author", String(40), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
plans = Table(
    "plans",
    meta,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("title", String(200), nullable=False),
    Column("goal", Text),
    Column("race", String(200)),
    Column("notes", Text),
    Column("status", String(20), nullable=False),  # actief | afgerond | gestopt
    Column("author", String(40), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
sessions = Table(
    "plan_sessions",
    meta,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("plan_id", Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("date", String(10), nullable=False),
    Column("sport", String(40), nullable=False),
    Column("kind", String(60)),
    Column("distance_km", Float),
    Column("duration_min", Integer),
    Column("target_zone", String(20)),
    Column("description", Text),
    Column("route_id", String(20)),
)
routes = Table(
    "routes",
    meta,
    Column("id", String(20), primary_key=True),
    Column("sport", String(40), nullable=False),
    Column("data", JSON, nullable=False),
)

SESSION_FIELDS = ("date", "sport", "kind", "distance_km", "duration_min", "target_zone", "description", "route_id")


def connect(url: str) -> Engine:
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return create_engine(url, pool_pre_ping=True, future=True)


def create_schema(engine: Engine) -> None:
    meta.create_all(engine)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- activities ---------------------------------------------------------------------


def _find_match(conn, record: dict) -> dict | None:
    day = date.fromisoformat(record["start_local"][:10])
    lo, hi = (day - timedelta(days=1)).isoformat(), (day + timedelta(days=2)).isoformat()
    rows = conn.execute(select(activities).where(activities.c.start_local >= lo, activities.c.start_local < hi)).mappings()
    for row in rows:
        if same_start(row, record):
            return dict(row)
    return None


def upsert_activity(engine: Engine, record: dict) -> str:
    """Insert or merge an activity from one source; streams go to their own table. Returns the activity id."""
    record = prepare(record)
    new_streams = record.pop("streams", None)
    with engine.begin() as conn:
        match = _find_match(conn, record)
        if match is None:
            aid = activity_id(record)
            merged = merge({}, record)
            conn.execute(insert(activities).values(id=aid, start_local=merged["start_local"], start_utc=merged["start_utc"], sport=merged["sport"], data=merged))
        else:
            aid = match["id"]
            merged = merge(match["data"], record)
            conn.execute(update(activities).where(activities.c.id == aid).values(data=merged, sport=merged["sport"]))
        if new_streams:
            conn.execute(delete(streams).where(streams.c.activity_id == aid))
            conn.execute(insert(streams).values(activity_id=aid, data=new_streams))
    return aid


def set_derived(engine: Engine, aid: str, **fields) -> None:
    """Update derived fields (e.g. hr_zones_s) on an activity; None removes the field."""
    with engine.begin() as conn:
        data = conn.execute(select(activities.c.data).where(activities.c.id == aid)).scalar_one()
        data = dict(data)
        for k, v in fields.items():
            if v is None:
                data.pop(k, None)
            else:
                data[k] = v
        conn.execute(update(activities).where(activities.c.id == aid).values(data=data))


def load_activities(engine: Engine, with_streams: bool = False) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(select(activities.c.id, activities.c.data).order_by(activities.c.start_local)).all()
        out = [dict(data, id=aid) for aid, data in rows]
        if with_streams:
            by_id = dict(conn.execute(select(streams.c.activity_id, streams.c.data)).all())
            for a in out:
                if a["id"] in by_id:
                    a["streams"] = by_id[a["id"]]
    return out


def load_streams(engine: Engine, aid: str) -> dict | None:
    with engine.connect() as conn:
        return conn.execute(select(streams.c.data).where(streams.c.activity_id == aid)).scalar_one_or_none()


def put_fit(engine: Engine, aid: str, data: bytes) -> None:
    with engine.begin() as conn:
        conn.execute(delete(fit_files).where(fit_files.c.activity_id == aid))
        conn.execute(insert(fit_files).values(activity_id=aid, data=data))


def has_fit(engine: Engine, aid: str) -> bool:
    with engine.connect() as conn:
        return conn.execute(select(fit_files.c.activity_id).where(fit_files.c.activity_id == aid)).first() is not None


# --- wellness, settings, documents --------------------------------------------------


def write_wellness(engine: Engine, day: str, values: dict) -> None:
    """Replace the day; an empty result removes it (Garmin is the only source)."""
    with engine.begin() as conn:
        conn.execute(delete(wellness).where(wellness.c.day == day))
        if values:
            conn.execute(insert(wellness).values(day=day, data=values))


def load_wellness(engine: Engine) -> dict[str, dict]:
    with engine.connect() as conn:
        return {d: data for d, data in conn.execute(select(wellness.c.day, wellness.c.data).order_by(wellness.c.day))}


def get_setting(engine: Engine, key: str):
    with engine.connect() as conn:
        return conn.execute(select(settings.c.value).where(settings.c.key == key)).scalar_one_or_none()


def set_setting(engine: Engine, key: str, value) -> None:
    with engine.begin() as conn:
        conn.execute(delete(settings).where(settings.c.key == key))
        conn.execute(insert(settings).values(key=key, value=value))


def put_document(engine: Engine, key: str, body: str, author: str) -> None:
    with engine.begin() as conn:
        conn.execute(delete(documents).where(documents.c.key == key))
        conn.execute(insert(documents).values(key=key, body=body, updated_at=_now(), updated_by=author))


def get_document(engine: Engine, key: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(select(documents).where(documents.c.key == key)).mappings().first()
    return {**row, "updated_at": row["updated_at"].isoformat()} if row else None


# --- log and analyses ---------------------------------------------------------------


def add_entry(engine: Engine, kind: str, title: str, body: str, author: str, day: str | None = None) -> int:
    with engine.begin() as conn:
        res = conn.execute(
            insert(entries).values(kind=kind, day=day or date.today().isoformat(), title=title, body=body, author=author, created_at=_now())
        )
        return res.inserted_primary_key[0]


def list_entries(engine: Engine, kind: str | None = None, limit: int = 100) -> list[dict]:
    q = select(entries).order_by(entries.c.day.desc(), entries.c.id.desc()).limit(limit)
    if kind:
        q = q.where(entries.c.kind == kind)
    with engine.connect() as conn:
        return [{**r, "created_at": r["created_at"].isoformat()} for r in conn.execute(q).mappings()]


# --- plans --------------------------------------------------------------------------


def create_plan(engine: Engine, title: str, author: str, goal: str | None = None, race: str | None = None, notes: str | None = None) -> int:
    """A new plan becomes the active one; the previous active plan is marked afgerond."""
    with engine.begin() as conn:
        conn.execute(update(plans).where(plans.c.status == "actief").values(status="afgerond"))
        res = conn.execute(
            insert(plans).values(title=title, goal=goal, race=race, notes=notes, status="actief", author=author, created_at=_now())
        )
        return res.inserted_primary_key[0]


def add_sessions(engine: Engine, plan_id: int, items: list[dict]) -> None:
    with engine.begin() as conn:
        for item in items:
            conn.execute(insert(sessions).values(plan_id=plan_id, **{k: item.get(k) for k in SESSION_FIELDS}))


def replace_sessions(engine: Engine, plan_id: int, items: list[dict]) -> None:
    with engine.begin() as conn:
        conn.execute(delete(sessions).where(sessions.c.plan_id == plan_id))
    add_sessions(engine, plan_id, items)


def get_plan(engine: Engine, plan_id: int) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(select(plans).where(plans.c.id == plan_id)).mappings().first()
        if not row:
            return None
        items = conn.execute(select(sessions).where(sessions.c.plan_id == plan_id).order_by(sessions.c.date, sessions.c.id)).mappings()
        return {**row, "created_at": row["created_at"].isoformat(), "sessions": [dict(s) for s in items]}


def active_plan(engine: Engine) -> dict | None:
    with engine.connect() as conn:
        pid = conn.execute(select(plans.c.id).where(plans.c.status == "actief").order_by(plans.c.id.desc())).scalar()
    return get_plan(engine, pid) if pid else None


def list_plans(engine: Engine) -> list[dict]:
    with engine.connect() as conn:
        return [{**r, "created_at": r["created_at"].isoformat()} for r in conn.execute(select(plans).order_by(plans.c.id.desc())).mappings()]


def set_plan_status(engine: Engine, plan_id: int, status: str) -> None:
    with engine.begin() as conn:
        conn.execute(update(plans).where(plans.c.id == plan_id).values(status=status))


# --- routes -------------------------------------------------------------------------


def save_routes(engine: Engine, items: list[dict]) -> None:
    with engine.begin() as conn:
        conn.execute(delete(routes))
        for r in items:
            conn.execute(insert(routes).values(id=r["id"], sport=r.get("sport", "run"), data=r))


def load_routes(engine: Engine) -> list[dict]:
    with engine.connect() as conn:
        return [data for (data,) in conn.execute(select(routes.c.data))]
