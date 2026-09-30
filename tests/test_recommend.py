from datetime import date

from tests.helpers import HOME, offset
from tools.recommend import format_recommendations, recommend

TODAY = date(2026, 9, 30)
FAR = list(offset(HOME, 5000, 0))


def route(rid, km, last_run="2026-09-20", start=HOME, is_loop=True, name=None):
    return {
        "id": rid,
        "name": name or f"rondje {rid}",
        "distance_km": km,
        "is_loop": is_loop,
        "last_run": last_run,
        "start": list(start),
        "end": list(start),
        "runs": 5,
        "median_pace": "5:30",
        "median_hr": 148,
        "elevation_gain_m": 10,
    }


def test_exact_single_route_is_first():
    recs = recommend([route("r1", 4.0), route("r2", 10.0)], 10, today=TODAY)
    assert recs[0]["parts"] == ["r2"]
    assert recs[0]["within_tolerance"] is True


def test_prefers_route_not_run_recently_when_both_fit():
    routes = [route("recent", 10.0, last_run="2026-09-29"), route("old", 10.2, last_run="2026-08-01")]
    assert recommend(routes, 10, today=TODAY)[0]["parts"] == ["old"]


def test_repeats_a_loop_to_reach_distance():
    recs = recommend([route("r1", 4.0)], 8, today=TODAY)
    assert recs[0]["parts"] == ["r1", "r1"]
    assert recs[0]["total_km"] == 8.0


def test_combines_two_loops_from_same_start():
    recs = recommend([route("r1", 4.0), route("r2", 6.0)], 10, today=TODAY)
    assert sorted(recs[0]["parts"]) == ["r1", "r2"]


def test_single_route_beats_combination():
    recs = recommend([route("r1", 5.0), route("r10", 10.0)], 10, today=TODAY)
    assert recs[0]["parts"] == ["r10"]


def test_does_not_combine_loops_with_different_starts():
    recs = recommend([route("home", 4.0), route("away", 6.0, start=FAR)], 10, today=TODAY)
    assert all(sorted(r["parts"]) != ["away", "home"] for r in recs)


def test_does_not_repeat_point_to_point_route():
    recs = recommend([route("p", 5.0, is_loop=False)], 10, today=TODAY)
    assert all(r["parts"] != ["p", "p"] for r in recs)


def test_nothing_fits_returns_closest_flagged():
    recs = recommend([route("r1", 4.0, is_loop=False)], 12, today=TODAY)
    assert recs[0]["parts"] == ["r1"]
    assert recs[0]["within_tolerance"] is False


def test_start_filter_keeps_only_routes_near_given_route():
    routes = [route("home", 10.0), route("away", 10.0, start=FAR, last_run="2026-01-01")]
    recs = recommend(routes, 10, today=TODAY, start="home")
    assert [r["parts"] for r in recs] == [["home"]]


def test_markdown_names_routes_and_deviation():
    routes = [route("r1", 4.0, name="Parkrondje")]
    text = format_recommendations(recommend(routes, 8, today=TODAY), routes, 8)
    assert "2× Parkrondje" in text
    assert "8.0 km" in text
