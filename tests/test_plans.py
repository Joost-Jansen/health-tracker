from datetime import date

from api.plans import match_sessions, parse_date, parse_minutes, parse_table, parse_zone, weekly_summary, zone_compliance

MD = """
| Datum | Sport | Type | Km | Zone | Omschrijving |
|---|---|---|---|---|---|
| 6-10-2026 | Lopen | Duurloop | 14 | Z2 | rustig |
| 7 okt | rust | | | | |
| 2026-10-08 | fietsen | | 40,5 | 2-3 | |
| morgen | lopen | | 5 | | |
"""


def test_parse_markdown_table():
    items, warnings = parse_table(MD, 2026)
    assert [(s["date"], s["sport"]) for s in items] == [("2026-10-06", "run"), ("2026-10-07", "rest"), ("2026-10-08", "ride")]
    assert items[0]["distance_km"] == 14 and items[0]["target_zone"] == "Z2" and items[0]["description"] == "rustig"
    assert items[2]["distance_km"] == 40.5 and items[2]["target_zone"] == "Z2-Z3"
    assert len(warnings) == 1 and "morgen" in warnings[0]


def test_parse_csv_semicolon_and_sport_from_type():
    items, _ = parse_table("datum;type;duur\n06/10/2026;Duurloop;1:10\n07/10/2026;Zwemmen techniek;45 min", 2026)
    assert [(s["sport"], s["duration_min"]) for s in items] == [("run", 70), ("swim", 45)]


def test_parse_without_date_column():
    items, warnings = parse_table("a,b\n1,2")
    assert items == [] and "datum" in warnings[0]


def test_small_parsers():
    assert parse_date("ma 12 jan", 2027) == "2027-01-12"
    assert parse_minutes("1,5 uur") == 90
    assert parse_zone("Z4") == "Z4" and parse_zone("") is None


def act(aid, day, sport="run", km=10.0, zones=None):
    return {"id": aid, "start_local": f"{day}T08:00:00", "sport": sport, "distance_km": km, "moving_time_s": 3000, "hr_zones_s": zones or {}}


def test_match_statuses_and_split_runs():
    sessions = [
        {"date": "2026-10-05", "sport": "run", "distance_km": 10},
        {"date": "2026-10-06", "sport": "run", "distance_km": 8},
        {"date": "2026-10-07", "sport": "rest"},
        {"date": "2026-10-08", "sport": "swim"},
        {"date": "2026-10-09", "sport": "run"},
    ]
    acts = [act("a", "2026-10-05", km=6), act("b", "2026-10-05", km=4), act("c", "2026-10-08", sport="swim", km=2)]
    out = match_sessions(sessions, acts, date(2026, 10, 8))
    assert [s["status"] for s in out] == ["gedaan", "gemist", "rust", "gedaan", "gepland"]
    assert out[0]["done"]["distance_km"] == 10 and set(out[0]["activity_ids"]) == {"a", "b"}
    weeks = weekly_summary(out)
    assert weeks[0]["planned"] == 4 and weeks[0]["done"] == 2 and weeks[0]["missed"] == 1


def test_zone_compliance_easy_counts_z1_too():
    a = {"hr_zones_s": {"Z1": 600, "Z2": 2400, "Z3": 1000, "Z4": 0, "Z5": 0}}
    assert zone_compliance(a, "Z2") == 75
    assert zone_compliance(a, "Z3-Z4") == 25


def test_route_suggestions_follow_the_session_sport():
    from datetime import date as _date

    from api.plans import suggest_routes

    def route(rid, sport, km):
        return {"id": rid, "name": rid, "sport": sport, "distance_km": km, "is_loop": True, "last_run": "2026-09-01", "start": [52.0, 5.0], "end": [52.0, 5.0]}

    routes = [route("r1", "run", 10.0), route("f1", "ride", 40.0)]
    sessions = [
        {"date": "2026-10-05", "sport": "run", "distance_km": 10.0, "status": "gepland"},
        {"date": "2026-10-06", "sport": "ride", "distance_km": 40.0, "status": "gepland"},
        {"date": "2026-10-07", "sport": "swim", "distance_km": 2.0, "status": "gepland"},
    ]
    suggest_routes(sessions, routes, _date(2026, 10, 3))
    assert sessions[0]["route_suggestion"]["parts"] == ["r1"]
    assert sessions[1]["route_suggestion"]["parts"] == ["f1"]
    assert "route_suggestion" not in sessions[2]
