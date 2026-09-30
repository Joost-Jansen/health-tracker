"""One-time Garmin login; stores the session tokens as the GARMINTOKENS repo secret.

Run it yourself in a terminal (it asks for your password and MFA code):

    .venv/bin/python tools/setup_garmin.py

Your password is only sent to Garmin; it is not stored. Re-run when the sync reports a Garmin login error.
"""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from garminconnect import Garmin  # noqa: E402

from tools.gh_secrets import set_secret  # noqa: E402


def main() -> None:
    email = input("Garmin e-mail: ").strip()
    password = getpass.getpass("Garmin wachtwoord (niet zichtbaar): ")
    api = Garmin(email, password, prompt_mfa=lambda: input("MFA-code: ").strip())
    api.login()
    set_secret("GARMINTOKENS", api.client.dumps())


if __name__ == "__main__":
    main()
