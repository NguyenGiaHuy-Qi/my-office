# Operational Trial Daily Report: Day 01
**Date:** 2026-11-12  
**Generated At:** 2026-11-24T19:59:11.575Z  
**Status:** `DEGRADED`  

---

## Executive Summary
During Day 01 of the operational trial:
- **Snapshots Sampled:** 0 retained (samples were taken but have rotated out of the 24h snapshot buffer)
- **Observation Window:** 2026-11-12T18:30:04.209Z → 2026-11-13T18:30:04.209Z
- **Telemetry Coverage:** 97.0% (43m 23s of 24h unobserved)
- **Total Alerts Detected:** 0 (SEV-1: 0, SEV-2: 0, SEV-3: 0, SEV-4: 0)
- **Incidents Resolved:** 0
- **Unresolved Incidents:** 0
- **Monitoring Gaps Recorded:** 2 (43m 23s total downtime, 60 missed intervals)

### Key Operational Indicators
| Metric | Observed Value | Status |
|---|---|---|
| Node Process Uptime | 0s | unmeasured |
| Peak Memory (RSS) | unmeasured | unmeasured |
| p95 Execution Latency | unmeasured | unmeasured |
| WAL Sequence # | unmeasured | unmeasured |
| WAL Corrupt Records | unmeasured | unmeasured |
| Emergency Stop State | unmeasured | Normal |
| Autonomy Mode | unmeasured | Enforced |

## 1. Verified Stable
The following subsystems and invariants operated continuously within specification without failure:

- *No subsystems could be verified as stable for this period (insufficient telemetry or ongoing alerts).*

## 2. Verified Incidents
No resolved incidents occurred during this period.

## 3. Unresolved Incidents
Zero active or unresolved incidents.

## 4. Monitoring Gaps
Detected **2** telemetry gap(s) where sampling was interrupted:

| Gap ID | Start Time | End Time | Duration | Missed Intervals | Reason |
|---|---|---|---|---|---|
| `gap-8a3bd274-b1de-4249-8d55-2e3744aaa906` | 2026-11-13T17:46:41.019Z | 2026-11-13T18:06:00.756Z | 19m 19s | 19 | Server restart downtime: telemetry sampling paused during server outage |
| `gap-bafddff5-cfc2-4294-aada-c38709560d38` | 2026-11-13T18:06:00.756Z | 2026-11-13T18:47:25.795Z | 41m 25s | 41 | Server restart downtime: telemetry sampling paused during server outage |

> [!NOTE]
> In accordance with the truthfulness policy, all metrics during gap windows are explicitly recorded as unmeasured rather than interpolated.

## 5. Not Tested
The following conditions or disaster recovery pathways were not exercised during Day 01:
- **Disaster Recovery Sandbox Restore:** Cold multi-store restore from secondary backup was not triggered.
- **Severe OS Memory Starvation:** Node process remained below critical memory limit; heap crash recovery unexercised.
- **Concurrent Conflict Collision:** Maximum stress concurrency limit (>100 simultaneous agent dispatches) not saturated.

## 6. Recommendations
2. **Investigate Telemetry Gaps:** Review server logs between gap intervals to determine cause of interrupted monitoring.
