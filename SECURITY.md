# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `main` | ✔ Supported |

## Reporting a Vulnerability

Do **not** disclose security vulnerabilities publicly. Report privately through
a **GitHub Security Advisory** on this repository.

Include the affected file, a description, reproduction steps, and a suggested
fix if possible.

## Critical to this project

- **Keys are never committed.** Supabase anon/service-role keys and model API
  keys come from environment variables only. A leaked service-role key is
  treated as a critical incident.
- **Agent actions are gated.** Any code path where an agent can act (send,
  deploy, transact) requires explicit, reviewed approval — never silent.
- **Auth is delegated.** Wallet and auth flows go through the Pi SDK /
  Supabase Auth; never re-implement credential handling in the agent layer.
