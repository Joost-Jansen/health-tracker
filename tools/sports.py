"""Sport codes: which sport an activity from Garmin or Strava is.

Running, cycling and swimming have one code each (run, ride, swim), whatever the variant: the zones, records, routes
and plans compare them with each other. E-bikes and hand cycling stay apart, because heart rate and speed there say
something else than on a normal bike. Every other sport keeps Garmin's own type key, without its version suffix
(`tennis_v2` -> `tennis`), so a sport Garmin adds later works without a change here. The site has a name and an icon
per code (web/lib/sports.ts).

Garmin's types and their groups (parentTypeId) are listed at
https://github.com/pe-st/garmin-connect-export/blob/master/json/activityTypes.json.
"""

from __future__ import annotations

import re

# Garmin parentTypeId -> our code, for every type in that group (also types Garmin adds later)
GARMIN_FAMILIES = {1: "run", 2: "ride", 26: "swim"}
GARMIN_FAMILY_KEYS = {"running": 1, "cycling": 2, "swimming": 26}
# exceptions and merges by type key
GARMIN_KEYS = {
    "e_bike_fitness": "e_bike",
    "e_bike_mountain": "e_bike",
    "e_enduro_mtb": "e_bike",
    "hand_cycling": "hand_cycling",
    "indoor_hand_cycling": "hand_cycling",
    "casual_walking": "walking",
    "speed_walking": "walking",
    "resort_skiing_snowboarding_ws": "resort_skiing",
    "backcountry_skiing_snowboarding_ws": "backcountry_skiing",
    "whitewater_rafting_kayaking": "whitewater_rafting",
    "paddelball": "padel",
    "transition": "transition",
}
# keys from before this module (store.py's old table), so an activity without its raw Garmin type still maps
OLD_GARMIN_KEYS = {
    "running": "run", "trail_running": "run", "treadmill_running": "run", "track_running": "run", "virtual_run": "run",
    "cycling": "ride", "road_biking": "ride", "indoor_cycling": "ride", "virtual_ride": "ride",
    "gravel_cycling": "ride", "mountain_biking": "ride",
    "lap_swimming": "swim", "open_water_swimming": "swim", "swimming": "swim",
}
_SUFFIX = re.compile(r"_(v2|ws)$")


def garmin_sport(activity_type: dict | None) -> str:
    """Our code for Garmin's `activityType` (list) or `activityTypeDTO` (detail): {typeKey, parentTypeId, ...}."""
    activity_type = activity_type or {}
    key = activity_type.get("typeKey") or "other"
    if key in GARMIN_KEYS:
        return GARMIN_KEYS[key]
    if "transition" in key.lower():  # transition_v2, swimToBikeTransition_v2, ...: the change-over in a multisport
        return "transition"
    family = GARMIN_FAMILY_KEYS.get(key) or activity_type.get("parentTypeId")
    if family in GARMIN_FAMILIES:
        return GARMIN_FAMILIES[family]
    return OLD_GARMIN_KEYS.get(key) or _SUFFIX.sub("", key)


STRAVA_SPORTS = {
    "Run": "run", "TrailRun": "run", "VirtualRun": "run",
    "Ride": "ride", "VirtualRide": "ride", "GravelRide": "ride", "MountainBikeRide": "ride",
    "EBikeRide": "e_bike", "EMountainBikeRide": "e_bike", "Handcycle": "hand_cycling", "Velomobile": "ride",
    "Swim": "swim",
    "Walk": "walking", "Hike": "hiking", "Wheelchair": "wheelchair_push_walk",
    "WeightTraining": "strength_training", "Workout": "indoor_cardio", "Crossfit": "hiit", "HighIntensityIntervalTraining": "hiit",
    "Elliptical": "elliptical", "StairStepper": "stair_climbing", "Rowing": "rowing", "VirtualRow": "indoor_rowing",
    "Yoga": "yoga", "Pilates": "pilates",
    "AlpineSki": "resort_skiing", "BackcountrySki": "backcountry_skiing", "NordicSki": "cross_country_skiing",
    "Snowboard": "resort_snowboarding", "Snowshoe": "snow_shoe", "IceSkate": "skating", "InlineSkate": "inline_skating",
    "RollerSki": "skate_skiing", "Skateboard": "skateboarding",
    "Canoeing": "paddling", "Kayaking": "kayaking", "StandUpPaddling": "stand_up_paddleboarding", "Surfing": "surfing",
    "Kitesurf": "kiteboarding", "Windsurf": "windsurfing", "Sail": "sailing",
    "RockClimbing": "rock_climbing", "Golf": "golf", "Soccer": "soccer", "Tennis": "tennis", "Badminton": "badminton",
    "Pickleball": "pickleball", "Padel": "padel", "Racquetball": "racquetball", "Squash": "squash", "TableTennis": "table_tennis",
}


def strava_sport(sport_type: str | None) -> str:
    """Our code for Strava's `sport_type` (or the older `type`); unknown ones in snake_case."""
    if not sport_type:
        return "other"
    return STRAVA_SPORTS.get(sport_type) or re.sub(r"(?<!^)(?=[A-Z])", "_", sport_type).lower()


def sport_of(record: dict) -> str | None:
    """The code for a stored activity from its raw source data (Garmin first), or None without one."""
    sources = record.get("sources") or {}
    garmin = (sources.get("garmin") or {}).get("raw") or {}
    if garmin.get("activityType") or garmin.get("activityTypeDTO"):
        return garmin_sport(garmin.get("activityType") or garmin.get("activityTypeDTO"))
    strava = (sources.get("strava") or {}).get("raw") or {}
    if strava.get("sport_type") or strava.get("type"):
        return strava_sport(strava.get("sport_type") or strava.get("type"))
    return None
