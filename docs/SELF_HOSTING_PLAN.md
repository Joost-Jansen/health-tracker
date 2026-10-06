# Self-hosting plan: health-tracker and stock-tracker on a home mini PC

From Railway to a mini PC at home, with your own domain, a VPN for yourself and a Cloudflare Tunnel for what has to be
public. The same box also stores and streams films. Prices are estimates (October 2026); check them before you buy.

## The setup in one picture

```
 you (phone, laptop) ──Tailscale VPN──────────────┐
                                                  ▼
 claude.ai / Claude app ──HTTPS──▶ Cloudflare ──tunnel──▶  mini PC (no open ports on the router)
 other users (later)    ──HTTPS──▶ (WAF, rate limits)      ├─ health-tracker (FastAPI + static site)
                                                           ├─ stock-tracker
                                                           ├─ Postgres (internal Docker network only)
                                                           ├─ Jellyfin (films, LAN + Tailscale only)
                                                           └─ restic ──nightly──▶ Backblaze B2 (encrypted)
                                                                │
                                                     USB-C enclosure, 2 HDDs in a mirror (films)
```

* **Phase A, only you:** the sites over Tailscale; only the MCP links (`/api/mcp/...`) public through the tunnel, so
  the Claude connectors keep working.
* **Phase B, other people too:** the whole health-tracker site public through the tunnel (after the app work in step 7).
  The stock-tracker stays private.

## 0. Hardware (see the end of this file for the choice)

- [ ] Mini PC: Intel N150 (or N100), 16 GB RAM, 1 TB NVMe for the system, apps and databases
- [ ] 2-bay USB-C disk enclosure + 2 NAS hard disks (8 TB each, mirrored) for films
- [ ] Small UPS (optional, recommended): power cuts are the most common cause of a corrupted disk
- [ ] Ethernet cable to the router (no Wi-Fi for a server)

## 1. Base system

- [ ] Install **Debian 12** or **Ubuntu Server 24.04 LTS** on the NVMe (no desktop)
- [ ] One user with sudo; SSH with keys only (`PasswordAuthentication no`, `PermitRootLogin no`)
- [ ] `unattended-upgrades` on for security updates; reboot once a month (or `needrestart`)
- [ ] Firewall: `ufw default deny incoming`; allow nothing from outside (Tailscale and the tunnel connect outwards)
- [ ] Docker Engine + Compose plugin; data under `/srv/<app>`
- [ ] Mount the HDD mirror at `/srv/media` (mdadm RAID1 or ZFS mirror); enable SMART monitoring (`smartd`) with e-mail
- [ ] BIOS: restart after power loss = on, so the box comes back by itself

## 2. Tailscale (your private access)

- [ ] Install Tailscale on the mini PC, your phone and laptop; enable MagicDNS (`minipc.<tailnet>.ts.net`)
- [ ] SSH only over Tailscale (`ListenAddress` on the Tailscale IP, or Tailscale SSH)
- [ ] Access rules (ACL): only your devices can reach SSH; friends (if ever shared) only port 443 of the sites

## 3. The apps in Docker Compose

- [ ] One `docker-compose.yml` in `/srv/stack`: `health`, `stock`, one `postgres` (two databases, two users), `cloudflared`,
      `jellyfin`; Postgres not published on any host port
- [ ] Secrets in `/srv/stack/.env` (`chmod 600`, never in git):
  - health-tracker: `DATABASE_URL`, `TRAINING_JWT_SECRET` (new, long, random), `TOKEN_ENCRYPTION_KEY` (**the same one as on
    Railway**, otherwise the stored Garmin and Wahoo sessions cannot be read), `COOKIE_SECURE=true`, `WAHOO_*` if used
  - stock-tracker: its own variables (check its README)
- [ ] Copy `TOKEN_ENCRYPTION_KEY` and the other secrets to a password manager too: without them a backup is only half a backup
- [ ] Health checks: `GET /api/health`; `restart: unless-stopped` on every service

## 4. Moving off Railway (per app)

- [ ] Note the Railway variables (Railway dashboard, or the Railway MCP)
- [ ] Health-tracker: also remove the separate **`sync` cron service** on Railway; it still runs older code next to the
      web service's own daily sync (`SYNC_IN_WEB`). At home only the web service syncs.
- [ ] Stop the syncs on Railway, then `pg_dump --no-owner` from Railway's public database URL; `pg_restore` into the home
      Postgres
- [ ] Start the app at home; check over Tailscale: login, Today, a workout, Trends, an MCP call from Claude Code
- [ ] Switch the DNS / MCP link to the new address (step 5); update the connector in claude.ai (new URL, same token)
- [ ] Keep Railway stopped (not deleted) for two weeks; then delete it and its database

## 5. Domain and Cloudflare Tunnel

- [ ] Buy a domain (about €10-15/year), e.g. via Cloudflare Registrar; DNS at Cloudflare
- [ ] `cloudflared` as a container with a tunnel token; hostnames `health.<domain>` and `stocks.<domain>`
- [ ] **Phase A** ingress (only the MCP public):

  ```yaml
  ingress:
    - hostname: health.<domain>
      path: ^/api/mcp/
      service: http://health:8000
    - hostname: stocks.<domain>
      path: ^/api/mcp/        # check the stock-tracker's MCP path
      service: http://stock:8000
    - service: http_status:404
  ```

- [ ] **Phase B**: drop the `path` line for `health.<domain>` (the whole site public); the stock-tracker stays Phase A
- [ ] Cloudflare: Always Use HTTPS, minimum TLS 1.2, the free managed WAF rules, Bot Fight Mode
- [ ] Rate limit rule: `/api/login`, `/api/register` and `/api/mcp/*` (for example 20 requests/minute per IP)
- [ ] Optional for the stock-tracker: **Cloudflare Access** (one-time code by e-mail) in front of everything except the
      MCP path
- [ ] Logs: tunnel and Cloudflare logs stay private. **The MCP token is part of the URL** and shows in request logs; make
      a new token in Settings › Agents if one ever leaked (Railway's HTTP logs have shown it).

## 6. Backups and monitoring

- [ ] Nightly at 03:00: `pg_dump` of both databases → `restic backup` to Backblaze B2 (encrypted; restic password in the
      password manager). Keep 7 daily, 4 weekly, 12 monthly (`restic forget --prune`).
- [ ] Also back up `/srv/stack` (compose file, `.env` encrypted by restic), not the films (the mirror protects against
      one failed disk; films can be found again, your training history cannot)
- [ ] **Test a restore** into a scratch database, once now and then twice a year
- [ ] UptimeRobot (free) on `https://health.<domain>/api/health` → e-mail/push when it is down
- [ ] Disk space alert (e.g. Netdata, or a cron job that mails at 85%); Docker log rotation (`max-size: 10m`)

## 7. App work before other people use health-tracker (Phase B)

What the app already has: bcrypt passwords, a lock after failed logins per username, a secure httpOnly cookie, hashed
MCP tokens, encrypted Garmin/Wahoo sessions, per-user data separation, registration closed / invite / open.

- [ ] **Chunked Apple Health upload**: Cloudflare refuses requests over 100 MB on the free plan, and real exports are
      often bigger. Upload in parts of ~50 MB, put together on the server.
- [ ] Lower the upload limit (4 GB → 2 GB) and one import per user at a time (already); temp files on the NVMe, cleaned up
      after a failure (already)
- [ ] **Login limit per IP** next to the one per username (and on registration)
- [ ] **Security headers**: HSTS, Content-Security-Policy, `frame-ancestors 'none'`, `Referrer-Policy`,
      `X-Content-Type-Options`
- [ ] **Mask MCP tokens** in the app's own logs
- [ ] **Self-service account deletion and data export** (Settings › Account)
- [ ] **Consent at registration** for health data (GDPR art. 9) and a privacy statement that names you as controller;
      have it checked, this is not legal advice
- [ ] Registration on **invite** (Settings › Admin), not open
- [ ] Two-step login (TOTP) for the admin account (optional; Cloudflare Access in front of `/settings/admin` also works)

For the stock-tracker: the same review once its repository is added to the session; while it stays private (Phase A)
only the MCP path is public.

## 8. Films (Jellyfin)

- [ ] Jellyfin in Docker with `/dev/dri` passed through: the N150's Quick Sync transcodes 4K HDR to 1080p in hardware
      (about 3 streams at once)
- [ ] Library on `/srv/media` (read-only mount in the container)
- [ ] Only on the home network and Tailscale, **not** through the Cloudflare Tunnel (Cloudflare's terms do not allow
      video streaming over the free plan)
- [ ] HDD spin-down after 20 minutes idle saves about 8 W when nobody is watching

## 9. Go-live checklist

- [ ] Both sites work over Tailscale; the MCP connectors work from claude.ai
- [ ] A restore test passed; UptimeRobot alerts arrive
- [ ] `ss -tlnp` shows no public listeners; the router forwards no ports
- [ ] Railway stopped; the old MCP token replaced
- [ ] Phase B only after step 7 is done

## Costs

| | One-off | Per year |
|---|---|---|
| Mini PC (N150, 16 GB, 1 TB) | €200-250 | |
| 2-bay USB-C enclosure + 2× 8 TB NAS HDD | €350-420 | |
| UPS (optional) | €70-100 | |
| Electricity (~12-20 W average incl. disks) | | €30-55 |
| Domain | | €10-15 |
| Cloudflare Tunnel, Tailscale, UptimeRobot | | €0 |
| Backblaze B2 (databases only, < 10 GB) | | €0-10 |
| **Total** | **€550-770** | **€40-80** |

Against Railway: roughly €60-240 per year for two apps with their databases (check the invoice).

## Hardware choice

**Recommended: an Intel N150 mini PC with 16 GB RAM and a 1 TB NVMe**, e.g. the **Beelink EQ14** (N150, 16 GB DDR4,
500 GB or 1 TB NVMe, two 2.5 GbE ports, built-in power supply, about €200-250). Alternatives with the same chip: GMKtec
NucBox G3 Plus, MinisForum UN150P.

* **Why the N150:** 6-8 W idle, enough for both apps, two Postgres databases and Jellyfin; Quick Sync for hardware
  video transcoding.
* **Why 16 GB:** health-tracker peaks at about 0.6 GB (recomputing zones after an import), the stock-tracker and
  Postgres a few hundred MB each, Jellyfin 1-2 GB: about 4-5 GB together, so there is room for more (Home Assistant,
  Immich for photos).
* **Why 1 TB:** the system, the containers, the databases and the Jellyfin cache on fast storage; 500 GB is enough if
  money is tight.
* **Films:** a 2-bay USB-C enclosure (e.g. TerraMaster D2-320 or ORICO 2-bay) with two NAS disks (WD Red Plus or Seagate
  IronWolf, 8 TB each) as a mirror: 8 TB usable, survives one dead disk. Not the "Smart" or SMR variants.

**Step up (more headroom, VMs, 32-64 GB later):** a refurbished **Lenovo ThinkCentre M70q/M90q Tiny with an Intel 12th-gen
i5-T** (about €250-350): two RAM slots (up to 64 GB), 10-15 W idle, also Quick Sync. Choose this when you want to run
more than the apps and films, or virtual machines.

**Not needed:** a mini PC with a dedicated graphics card, or a gaming mini PC (high idle power for nothing).

## Open questions

1. The stock-tracker's repository, to check its MCP path, its secrets and what step 7 needs there.
2. Which domain name.
3. Will health-tracker really get other users (then step 7 and the GDPR part come first), or only friends via invite?
