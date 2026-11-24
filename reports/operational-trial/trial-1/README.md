# Trial 1 (2026-11-12 18:30 UTC → 2026-11-19 18:30 UTC): archived

Verdict: **INCONCLUSIVE: INSUFFICIENT TELEMETRY COVERAGE** (29.32% of the 7-day window observed).

These reports were regenerated on 2026-11-25 from the trial's real gap log
(`data/trial-monitor/trial-1-state.json`). They replace the versions committed in `cc21ae3`, which were
written before or at the start of the trial: the final assessment was generated at 2026-11-12T18:14Z,
16 minutes before the trial began, and claimed 100% availability and `READY FOR PRODUCTION ROLLOUT`.
Days 02–07 were identical templates written in the same minute.

Why coverage was low:
- Most gaps match the PC being shut down or crashing (Windows events 1074 / 6005 / 41). The server only
  restarts at the next logon, and the watchdog is read-only, so nothing brings it back sooner.
- One stall (2026-11-23 04:35Z → 2026-11-24 19:27Z, after this window) happened with the server running.
  Its trigger is unproven; sampling now re-arms itself and the watchdog alerts on it.

Per-snapshot detail is gone: the scheduler keeps only the latest 24h of snapshots, and nothing wrote
day reports while each day's data was still held. Coverage figures come from the gap log, which is kept
in full. Day reports are now written automatically as each trial day ends.
