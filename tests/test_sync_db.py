from datetime import date

from cryptography.fernet import Fernet

from tests.test_sync import FakeGarmin
from tools import db
from tools.secretbox import decrypt, encrypt
from tools.sync import DbSink, run_db_sync, sync_garmin


def engine():
    e = db.connect("sqlite://")
    db.create_schema(e)
    db.set_setting(e, "zones", {"run": {"bounds": [132, 147, 162, 176], "max_hr": 189}})
    return e


def streams(_data):
    return {"time": [0, 10, 20], "heartrate": [140, 150, 150], "latlng": [[52.09, 5.12], [52.0901, 5.12], [52.0902, 5.12]]}


def test_garmin_sync_into_database():
    e = engine()
    state = {"garmin": {"last_activity_day": "2026-09-28", "last_wellness_day": "2026-09-30"}}
    sync_garmin(DbSink(e), FakeGarmin(), state, today=date(2026, 9, 30), read_streams=streams)
    acts = db.load_activities(e)
    assert len(acts) == 1 and acts[0]["fit_file"] == "garmin-999"
    assert db.get_fit(e, "garmin-999") == b"PK-fake-zip"
    assert db.load_streams(e, acts[0]["id"])["latlng"]
    assert db.load_wellness(e) == {"2026-09-30": {"sleep_h": 7.0}}


def test_fit_already_stored_is_not_downloaded_again():
    e = engine()
    db.put_fit(e, "garmin-999", b"stored")
    client = FakeGarmin()
    client.fit = lambda _id: (_ for _ in ()).throw(AssertionError("downloaded again"))
    seen = []
    sync_garmin(DbSink(e), client, {"garmin": {"last_activity_day": "2026-09-30", "last_wellness_day": "2026-09-30"}},
                today=date(2026, 9, 30), read_streams=lambda d: seen.append(d) or {})
    assert seen == [b"stored"]


def test_secretbox_roundtrip_and_key_required():
    key = Fernet.generate_key().decode()
    token = encrypt("garmin-tokens-json", key)
    assert token != "garmin-tokens-json" and decrypt(token, key) == "garmin-tokens-json"


class FakeClientWithTokens(FakeGarmin):
    def __init__(self, tokens):
        super().__init__()
        self.login_tokens = tokens

    def tokens(self):
        return "rotated-" + self.login_tokens


def test_run_db_sync_uses_stored_tokens_saves_rotation_state_and_derives():
    e = engine()
    key = Fernet.generate_key().decode()
    db.set_setting(e, "garmin_tokens", encrypt("from-db", key))
    made = []

    def factory(tokens):
        made.append(tokens)
        return FakeClientWithTokens(tokens)

    result = run_db_sync(e, key, env_tokens="from-env", client_factory=factory, today=date(2026, 9, 30), read_streams=streams)
    assert made == ["from-db"]  # the database copy wins over the (older) environment variable
    assert decrypt(db.get_setting(e, "garmin_tokens"), key) == "rotated-from-db"
    state = db.get_setting(e, "sync_state")
    assert state["garmin"]["last_activity_day"] == "2026-09-30" and "last_sync_local" in state and "last_failed" not in state
    assert db.load_activities(e)[0]["hr_zones_s"]["Z3"] == 10  # derive ran
    assert result == 0


def test_run_db_sync_falls_back_to_env_tokens_and_records_failure():
    e = engine()
    key = Fernet.generate_key().decode()

    def broken(tokens):
        assert tokens == "from-env"
        raise RuntimeError("login failed")

    assert run_db_sync(e, key, env_tokens="from-env", client_factory=broken, today=date(2026, 9, 30)) == 1
    assert db.get_setting(e, "sync_state")["last_failed"] == ["garmin"]
