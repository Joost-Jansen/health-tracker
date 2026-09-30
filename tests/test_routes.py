from tests.helpers import HOME, offset, out_and_back, run, square_loop
from tools.routes import build_routes, haversine_m, same_route


def test_haversine_one_km_north():
    # test helper uses a flat 111,320 m/degree, so allow 0.5%
    assert abs(haversine_m(HOME, offset(HOME, 1000, 0)) - 1000) < 5


def test_same_loop_with_gps_noise_is_same_route():
    a = run("a", "2026-09-01", square_loop(noise_m=8, seed=1), 4.0)
    b = run("b", "2026-09-03", square_loop(noise_m=8, seed=2), 4.05)
    assert same_route(a, b)


def test_loop_in_other_direction_from_same_start_is_different_route():
    a = run("a", "2026-09-01", square_loop(direction="ne"), 4.0)
    b = run("b", "2026-09-03", square_loop(direction="sw"), 4.0)
    assert not same_route(a, b)


def test_same_path_but_much_longer_distance_is_different_route():
    a = run("a", "2026-09-01", square_loop(), 4.0)
    b = run("b", "2026-09-03", square_loop(), 8.0)
    assert not same_route(a, b)


def test_run_without_gps_never_matches():
    a = run("a", "2026-09-01", [], 4.0)
    b = run("b", "2026-09-03", [], 4.0)
    assert not same_route(a, b)


def _three_ne_loops():
    return [run(f"ne{i}", f"2026-09-0{i + 1}", square_loop(noise_m=5, seed=i), 4.0) for i in range(3)]


def test_route_needs_three_runs():
    two = _three_ne_loops()[:2]
    assert build_routes(two, existing=[]) == []


def test_three_similar_runs_become_one_loop_route():
    routes = build_routes(_three_ne_loops(), existing=[])
    assert len(routes) == 1
    r = routes[0]
    assert r["runs"] == 3
    assert r["is_loop"] is True
    assert r["distance_km"] == 4.0
    assert r["last_run"] == "2026-09-03"
    assert sorted(r["activity_ids"]) == ["ne0", "ne1", "ne2"]


def test_out_and_back_is_not_a_loop():
    runs = [run(f"ob{i}", f"2026-09-0{i + 1}", out_and_back(), 6.0) for i in range(3)]
    routes = build_routes(runs, existing=[])
    assert len(routes) == 1
    assert routes[0]["is_loop"] is True  # start == finish, so it can be repeated from home


def test_point_to_point_is_not_a_loop():
    track = [list(offset(HOME, i * 10, 0)) for i in range(501)]
    runs = [run(f"p{i}", f"2026-09-0{i + 1}", track, 5.0) for i in range(3)]
    assert build_routes(runs, existing=[])[0]["is_loop"] is False


def test_user_given_name_and_id_survive_rebuild():
    first = build_routes(_three_ne_loops(), existing=[])
    first[0]["name"] = "Parkrondje"
    more = _three_ne_loops() + [run("ne9", "2026-09-20", square_loop(noise_m=5, seed=9), 4.1)]
    again = build_routes(more, existing=first)
    assert again[0]["name"] == "Parkrondje"
    assert again[0]["id"] == first[0]["id"]
    assert again[0]["runs"] == 4
    assert again[0]["last_run"] == "2026-09-20"


def test_two_distinct_routes_get_distinct_ids():
    ne = _three_ne_loops()
    sw = [run(f"sw{i}", f"2026-09-1{i}", square_loop(direction="sw", side_m=1500, seed=i), 6.0) for i in range(3)]
    routes = build_routes(ne + sw, existing=[])
    assert len(routes) == 2
    assert len({r["id"] for r in routes}) == 2


def test_run_stopped_just_before_home_still_counts_as_loop():
    # watch often stopped a few hundred metres before the front door (seen: 203 m, 259 m)
    track = square_loop()[:-27]  # ends ~260 m before the start
    runs = [run(f"x{i}", f"2026-09-0{i + 1}", track, 3.7) for i in range(3)]
    assert build_routes(runs, existing=[])[0]["is_loop"] is True


def test_generated_default_name_follows_new_distance():
    first = build_routes(_three_ne_loops(), existing=[])
    assert first[0]["name"] == "4.0 km rondje (r1)"
    more = _three_ne_loops() + [run(f"n{i}", f"2026-09-2{i}", square_loop(noise_m=5, seed=20 + i), 4.3) for i in range(3)]
    again = build_routes(more, existing=first)
    assert again[0]["name"] == f"{again[0]['distance_km']:.1f} km rondje (r1)"
    assert again[0]["distance_km"] != 4.0
