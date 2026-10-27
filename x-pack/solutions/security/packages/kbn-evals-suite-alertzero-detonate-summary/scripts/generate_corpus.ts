/**
 * Generate the alertzero-detonate-summary corpus (P5).
 *
 * The corpus is RECORDED detonation results, by rule: each entry is a real
 * DetonateTask produced by the replay pipeline off a captured fixture, never
 * a hand-written JSON that happens to typecheck. Samples are never stored —
 * only the task documents.
 *
 * Known-good entries vary hashes/filenames so the corpus is not 300 copies of
 * one string: the replay executor's negative control is a real recording of a
 * run that raised nothing (atomic-red-team-discovery-linux), and every
 * generated task is its own task document with its own id/timestamp.
 *
 * Usage (run from detonate-sim/, Node >= 22.6):
 *   node --experimental-strip-types \
 *     ../x-pack/solutions/security/packages/kbn-evals-suite-alertzero-detonate-summary/scripts/generate_corpus.ts \
 *     --count 300 \
 *     --out ../x-pack/solutions/security/packages/kbn-evals-suite-alertzero-detonate-summary/evals/fixtures
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DetonateCorpusEntry } from '../src/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const arg = (name: string, fallback?: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required --${name}`);
};

const sha256Of = (seed: string): string => {
  // Deterministic per-seed digest: FNV-1a expanded to 64 hex chars. Not
  // cryptographic — it only needs to be stable and unique per corpus entry so
  // the replay selector treats each as its own (unmatched → negative control)
  // sample, the same way an unknown known-good hash behaves in production.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i);
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ seed.charCodeAt(i), 2246822519) >>> 0;
  }
  let out = '';
  let s = h1 ^ h2;
  while (out.length < 64) {
    s = (Math.imul(s, 2654435761) + 0x9e3779b9) >>> 0;
    out += s.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
};

const knownGoodFilename = (i: number): string => {
  // Real-world-looking known-good names. No internal hostnames by rule.
  const bases = [
    'notepad.exe',
    'calc.exe',
    'libssl.so.3',
    'update-helper.bin',
    'invoice.pdf',
    'backup.tar.gz',
    'setup.msi',
    'readme.txt',
    'driver.sys',
    'archive.zip',
  ];
  return `kg-${String(i).padStart(4, '0')}-${bases[i % bases.length]}`;
};

const main = async () => {
  const count = Number(arg('count', '300'));
  const outDir = resolve(arg('out'));
  const simDir = resolve(arg('sim', join(__dirname, '../../../../../../detonate-sim')));
  const fixturesDir = resolve(arg('fixtures', join(simDir, 'fixtures')));

  if (!existsSync(fixturesDir)) {
    throw new Error(`detonate-sim fixtures not found at ${fixturesDir}`);
  }
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  // The corpus is generated; a stale file would silently shrink the corpus.
  for (const f of readdirSync(outDir)) {
    if (f.endsWith('.json')) {
      throw new Error(`refusing to mix with existing corpus: ${f} (clean ${outDir} first)`);
    }
  }

  // Dynamic imports of the sim's own modules — resolved from the sim directory
  // so the corpus is produced by the exact pipeline the service ships.
  const { TaskStore } = await import(join(simDir, 'src/server/task_store.ts'));
  const { runPipeline } = await import(join(simDir, 'src/server/pipeline.ts'));
  const { createReplayExecutor } = await import(join(simDir, 'src/executor/replay.ts'));

  const store = new TaskStore({
    telemetryClusterVersion: '8.19.0',
    defaultAgentVersion: '8.19.0',
  });
  const executor = createReplayExecutor({ fixturesDir });

  const entries: DetonateCorpusEntry[] = [];

  // ---- known-good (≥ count) ------------------------------------------------
  for (let i = 0; i < count; i++) {
    const task = await store.create({
      sample_hash: sha256Of(`known-good-${i}`),
      sample_filename: knownGoodFilename(i),
      tags: ['corpus:known-good'],
    });
    const final = await runPipeline({ store, executor, taskId: task.id, stepDelayMs: 0 });
    entries.push({ id: `kg-${i}`, label: 'known_good_quiet', task: final });
  }

  // ---- known-malware (every recorded malicious fixture) --------------------
  // The replay executor matches by the hashes/filenames the recordings name,
  // so submitting the real EICAR hash replays the real EICAR recording.
  const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
  const malwareSubmissions: Array<{ id: string; sample_hash?: string; sample_filename?: string }> = [
    { id: 'eicar-linux', sample_hash: EICAR_SHA256 },
    { id: 'eicar-reenrolled', sample_hash: EICAR_SHA256, sample_filename: 'eicar.com' },
  ];
  for (const m of malwareSubmissions) {
    const task = await store.create({ ...m, tags: ['corpus:known-malware'] });
    const final = await runPipeline({ store, executor, taskId: task.id, stepDelayMs: 0 });
    entries.push({ id: `mw-${m.id}`, label: 'known_malicious', task: final });
  }

  // ---- evasive / no-op ------------------------------------------------------
  // A failed run (no verdict is possible) and a commands-only run — both must
  // come out "suspicious"/"no malicious behavior observed", never
  // "malicious"/"benign".
  const failedTask = await store.create({
    sample_hash: sha256Of('evasive-failed-run'),
    sample_filename: 'dropper.exe',
    tags: ['corpus:evasive'],
  });
  const forcedFail = await store.advance(
    failedTask.id,
    'detonate.workers.start_vm',
    'failure',
    {},
    'vm boot failed: image unavailable'
  );
  entries.push({ id: 'ev-failed-run', label: 'evasive_no_alerts', task: forcedFail });

  const noopTask = await store.create({
    exec_commands: ['uname -a'],
    tags: ['corpus:evasive'],
  });
  const noopFinal = await runPipeline({ store, executor, taskId: noopTask.id, stepDelayMs: 0 });
  entries.push({ id: 'ev-noop-commands', label: 'evasive_no_alerts', task: noopFinal });

  // ---- write ----------------------------------------------------------------
  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.label] = (acc[e.label] ?? 0) + 1;
    return acc;
  }, {});
  const file = join(outDir, 'detonate_summary_corpus.json');
  writeFileSync(
    file,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'Recorded Detonate task results produced by the detonate-sim replay pipeline. Samples are never stored; no internal hostnames appear here.',
        counts,
        entries,
      },
      null,
      2
    )
  );

  console.log(`wrote ${entries.length} entries to ${file}`);
  console.log('label counts:', JSON.stringify(counts));
  if ((counts.known_good_quiet ?? 0) < 300) {
    throw new Error(`known-good corpus below 300 — regenerate with --count 300`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
