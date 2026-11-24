import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTrialScheduler, trialDay, gapMsInWindow, trialCoverage } from '../../server/trial-monitor/trial-scheduler.mjs';
import { generateDailyReport, generateFinalAssessment } from '../../server/trial-monitor/trial-report-generator.mjs';

const H = 3600e3;
const D = 24 * H;
const START = Date.UTC(2026, 0, 1);

function makeScheduler(clock, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-day-'));
  return createTrialScheduler({
    collector: { collectSnapshot: async () => ({ timestamp: clock.t, issues: [] }) },
    anomalyDetector: { evaluate: () => ({ alerts: [] }) },
    storePath: path.join(dir, 'trial-state.json'),
    outputDir: dir,
    rootDir: dir,
    now: () => clock.t,
    ...extra,
  });
}

describe('trial day tracking', () => {
  it('counts days from trialStartAt and reports completion after the last day', () => {
    const t = { epoch: START, totalDays: 7 };
    assert.deepEqual(trialDay(t, START), { day: 1, totalDays: 7, complete: false });
    assert.deepEqual(trialDay(t, START + 3 * D + 1), { day: 4, totalDays: 7, complete: false });
    assert.deepEqual(trialDay(t, START + 12 * D), { day: 7, totalDays: 7, complete: true });
    assert.equal(trialDay(null, START), null);
  });

  it('status shows the real day instead of a fixed "Day 1/7"', () => {
    const clock = { t: START };
    const s = makeScheduler(clock);
    s.startOfficialTrial({ authorizedBy: 'test', startTimestamp: START });
    clock.t = START + 2 * D + H;
    assert.equal(s.getStatus().observationStatus, 'Day 3/7 (Active Observation)');
    clock.t = START + 9 * D;
    assert.equal(s.getStatus().observationStatus, 'Trial complete (7/7 days)');
  });

  it('merges overlapping gaps and clips them to the window', () => {
    const gaps = [
      { startTime: START - H, endTime: START + 2 * H },        // starts before the window
      { startTime: START + H, endTime: START + 3 * H },        // overlaps the first
      { endTime: START + 10 * H, durationMs: H },              // no startTime: derived from duration
      { startTime: START + D - H, endTime: START + D + 5 * H }, // runs past the window
    ];
    assert.equal(gapMsInWindow(gaps, START, START + D), 3 * H + H + H);
    assert.equal(trialCoverage({ epoch: START, totalDays: 1 }, gaps, START + 2 * D), `${((1 - 5 / 24) * 100).toFixed(1)}%`);
  });

  it('re-arms sampling when no sample landed for 3 intervals', async () => {
    const clock = { t: START };
    const s = makeScheduler(clock, { intervalMs: 60_000 });
    s.start();
    await new Promise((r) => setImmediate(r));
    const first = s.lastSampleTimestamp;
    s._sampling = true; // simulate a sample that never finished
    clock.t = START + 4 * 60_000;
    s.getStatus();
    await new Promise((r) => setImmediate(r));
    s.stop();
    assert.equal(s.stats.stallRecoveries, 1);
    assert.ok(s.lastSampleTimestamp > first, 'a fresh sample must land after recovery');
  });

  it('fires one day report per finished day, catching up after downtime, final on the last day', async () => {
    const clock = { t: START };
    const calls = [];
    const s = makeScheduler(clock, { onDayComplete: (d, last) => { calls.push([d, last]); } });
    s.startOfficialTrial({ authorizedBy: 'test', startTimestamp: START });
    clock.t = START + D + 60_000;
    await s.sampleNow();
    clock.t = START + 4 * D + 60_000; // server was down for days 2-4
    await s.sampleNow();
    clock.t = START + 4 * D + 120_000;
    await s.sampleNow(); // same day: nothing new
    clock.t = START + 30 * D;
    await s.sampleNow();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(calls, [[1, false], [2, false], [3, false], [4, false], [5, false], [6, false], [7, true]]);
  });
});

describe('trial reports use real windows', () => {
  const trialStartAt = { epoch: START, totalDays: 7 };
  const gaps = [{ id: 'g1', startTime: START + D, endTime: START + D + 12 * H, durationMs: 12 * H, missedIntervals: 720, timestamp: START + D + 12 * H }];
  const snapshots = [{ timestamp: START + H, issues: [] }, { timestamp: START + D + 13 * H, issues: [] }];

  it('day N only counts its own 24 hours', async () => {
    const day1 = await generateDailyReport({ dayNumber: 1, snapshots, gaps, trialStartAt, writeToFile: false });
    const day2 = await generateDailyReport({ dayNumber: 2, snapshots, gaps, trialStartAt, writeToFile: false });
    assert.equal(day1.summary.snapshotCount, 1);
    assert.equal(day1.summary.totalGapDurationMs, 0);
    assert.equal(day2.summary.snapshotCount, 1);
    assert.equal(day2.summary.totalGapDurationMs, 12 * H);
    assert.ok(day2.content.includes('Telemetry Coverage:** 50.0%'));
    assert.ok(!day1.content.includes('Safety Boundaries & Emergency Stop'), 'no stability claim without data');
  });

  it('final assessment is INCOMPLETE before the window ends and INCONCLUSIVE at low coverage', async () => {
    const early = await generateFinalAssessment({ trialStartAt, gaps, snapshots, writeToFile: false, now: START + 3 * D });
    assert.ok(early.verdict.startsWith('INCOMPLETE'));
    const lowCoverage = [{ startTime: START, endTime: START + 4 * D, durationMs: 4 * D, missedIntervals: 5760 }];
    const late = await generateFinalAssessment({ trialStartAt, gaps: lowCoverage, snapshots, writeToFile: false, now: START + 8 * D });
    assert.ok(late.verdict.startsWith('INCONCLUSIVE'));
    assert.equal(late.availabilityPct, ((3 / 7) * 100).toFixed(2));
    assert.ok(!late.content.includes('100% durable'));
  });
});
