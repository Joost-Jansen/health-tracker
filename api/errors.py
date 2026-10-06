"""Errors as codes (T25): the site shows them in the user's language, agents and scripts keep reading `detail`.

    raise ApiError(422, "password_too_short", min=10)

answers `{"detail": "wachtwoord van minimaal 10 tekens", "code": "password_too_short", "params": {"min": 10}}`.
`detail` is the Dutch text below (what the API always returned); the site renders `code` + `params` itself
(`web/lib/i18n`, `errors`). Add a code here and in both web catalogs in the same commit.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

MESSAGES: dict[str, str] = {
    # accounts (api/users.py)
    "not_logged_in": "niet ingelogd",
    "invalid_agent_token": "ongeldig agent-token",
    "admins_only": "alleen voor beheerders",
    "site_login_only": "alleen ingelogd op de site",
    "too_many_attempts": "te veel pogingen, probeer het over een kwartier opnieuw",
    "bad_credentials": "onjuiste gebruikersnaam of wachtwoord",
    "account_suspended": "dit account is geblokkeerd; neem contact op met de beheerder",
    "registration_closed": "registreren staat uit",
    "invalid_invite": "ongeldige of gebruikte uitnodigingscode",
    "invalid_username": "gebruikersnaam: 3-40 tekens, letters, cijfers, punt, streepje of underscore",
    "username_taken": "die gebruikersnaam bestaat al",
    "username_reserved": "die gebruikersnaam is gereserveerd",
    "example_read_only": "dit zijn voorbeeldgegevens: je kunt ze bekijken, niet wijzigen",
    "password_too_short": "wachtwoord van minimaal {min} tekens",
    "name_too_long": "naam van maximaal {max} tekens",
    "wrong_current_password": "huidig wachtwoord klopt niet",
    "invalid_locale": "taal is een van {options}",
    "user_not_found": "gebruiker niet gevonden",
    "cannot_demote_self": "je kunt je eigen beheerrechten niet intrekken of jezelf blokkeren",
    "cannot_delete_self": "je kunt jezelf niet verwijderen",
    "confirm_username": "typ de gebruikersnaam ter bevestiging",
    "invalid_registration_mode": "registratie is een van {options}",
    # agent tokens (api/agent_tokens.py)
    "tokens_site_only": "alleen ingelogd op de site beheer je agent-tokens",
    "token_name_length": "naam van {min} tot {max} tekens",
    "too_many_tokens": "maximaal {max} tokens; trek er eerst een in",
    "token_not_found": "token niet gevonden",
    # Garmin (api/connections.py)
    "connections_site_only": "koppelingen beheer je ingelogd op de site",
    "no_encryption_key": "de server heeft geen sleutel om de koppeling veilig op te slaan (TOKEN_ENCRYPTION_KEY)",
    "missing_garmin_credentials": "vul e-mail en wachtwoord in",
    "garmin_rejected": "Garmin weigert de inlog: controleer e-mail en wachtwoord (of de MFA-code).",
    "garmin_rate_limited": "Garmin laat even geen nieuwe inlog toe (te veel pogingen). Probeer het over een kwartier opnieuw.",
    "garmin_failed": "Inloggen bij Garmin lukte niet. Probeer het later opnieuw.",
    "mfa_expired": "de MFA-stap is verlopen; log opnieuw in bij Garmin",
    "garmin_not_connected": "koppel eerst Garmin of Wahoo",
    "wahoo_not_configured": "de server heeft geen Wahoo-app (WAHOO_CLIENT_ID en WAHOO_CLIENT_SECRET)",
    # zones and profile (api/settings_api.py)
    "zone_percentages": "vier oplopende percentages tussen 40 en 100",
    "unknown_sport": "onbekende sport {sport}",
    "max_hr_range": "max hartslag tussen {min} en {max}",
    "profile_range": "{field} tussen {min} en {max}",
    # onboarding (api/onboarding.py)
    "unknown_field": "onbekend veld: {fields}",
    "invalid_choice": "kies uit: {options}",
    "invalid_done": "done is true of false",
    "invalid_step": "een stap is een getal vanaf 0",
    "unknown_banner": "onbekende banner; kies uit: {options}",
    "unknown_page": "onbekende pagina; kies uit: {options}",
    # plans (api/plans.py)
    "plan_not_found": "schema niet gevonden",
    "invalid_date": "ongeldige datum: {date}",
    "invalid_plan_status": "status moet een van {options} zijn",
    "no_sessions": "geen sessies gevonden",
    "no_session_to_link": "geen sessie {sport} op {date} in het schema",
    # routes (api/routes_api.py)
    "route_not_found": "rondje niet gevonden",
    "unknown_route": "onbekend rondje",
    "no_open_question": "geen open vraag voor dit paar",
    "route_name_length": "naam van {min} tot {max} tekens",
    # documents, activities, zones
    "document_not_found": "document bestaat niet",
    "unknown_document": "onbekend document",
    "activity_not_found": "activiteit niet gevonden",
    "invalid_distance": "afstand tussen {min} en {max} km",
    "max_periods": "maximaal {max} perioden",
    # FIT upload (api/uploads.py)
    "upload_empty": "leeg bestand",
    "upload_too_large": "bestand groter dan {max_mb} MB",
    "fit_unreadable": "geen leesbare activiteit in dit FIT-bestand",
    # feedback (api/feedback.py)
    "feedback_kind": "soort is bug of idea",
    "feedback_empty": "schrijf wat er mis is of wat je zou willen",
    "feedback_too_many": "te veel feedback vandaag, probeer het morgen opnieuw",
    "feedback_screenshot_type": "screenshot moet een png, jpeg of webp zijn",
    "feedback_not_found": "feedback niet gevonden",
    "feedback_status": "status is een van {options}",
}


def _text(code: str, params: dict) -> str:
    shown = {k: ", ".join(map(str, v)) if isinstance(v, (list, tuple)) else v for k, v in params.items()}
    return MESSAGES[code].format(**shown)


class ApiError(HTTPException):
    """An HTTP error with a code the site translates. `detail` is the Dutch text for agents and scripts."""

    def __init__(self, status_code: int, code: str, detail: str | None = None, headers: dict | None = None, **params):
        super().__init__(status_code=status_code, detail=detail or _text(code, params), headers=headers)
        self.code = code
        self.params = params


async def _handle(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail, "code": exc.code, "params": exc.params}, status_code=exc.status_code, headers=exc.headers)


def install(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle)
