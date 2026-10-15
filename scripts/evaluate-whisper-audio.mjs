#!/usr/bin/env node
/** Score actual model outputs against the frozen, licensed voice fixtures.
 * Never transcribes audio, fabricates output, or reads user recordings.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function tokens(text) {
  return String(text ?? '').normalize('NFKC').toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().split(/\s+/u).filter(Boolean);
}
export function wordErrorRate(reference, hypothesis) {
  const expected = tokens(reference), actual = tokens(hypothesis);
  let previous = actual.map((_, index) => index + 1); previous.unshift(0);
  for (let i = 1; i <= expected.length; i++) {
    const next = [i];
    for (let j = 1; j <= actual.length; j++) {
      next.push(Math.min(next[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1)));
    }
    previous = next;
  }
  const edits = previous[actual.length];
  return { edits, referenceWords: expected.length, hypothesisWords: actual.length,
    rate: expected.length ? edits / expected.length : actual.length ? 1 : 0 };
}
export function scoreFixture(fixture, result) {
  if (!result) return { id: fixture.id, language: fixture.language, passed: false, error: 'Missing actual model result' };
  if (typeof result.text !== 'string') return { id: fixture.id, language: fixture.language, passed: false, error: 'Result text must be a string' };
  const text = result.text;
  if (fixture.language === 'none') {
    return { id: fixture.id, language: 'none', task: result.task, text,
      passed: tokens(text).length === 0 && !result.error, criterion: 'No invented speech on synthetic silence/noise', modelError: result.error };
  }
  const task = result.task ?? (fixture.language === 'ml' ? 'translate' : 'transcribe');
  const directMalayalam = fixture.language === 'ml' && task === 'transcribe';
  const lexical = wordErrorRate(directMalayalam ? fixture.expectedSourceText : fixture.expectedEnglishText, text);
  const normalized = tokens(text).join(' ');
  const concepts = directMalayalam ? [] : fixture.requiredEnglishConcepts.map(concept => ({
    label: concept.label, present: concept.patterns.some(pattern => new RegExp(pattern, 'iu').test(normalized)),
  }));
  const meaningPassed = !directMalayalam && concepts.length > 0 && concepts.every(concept => concept.present);
  // Translation wording can legitimately differ from the aligned English source.
  // WER is descriptive for translation, not a pass gate. Direct Malayalam output
  // is diagnostic only because the product requires an editable English note.
  const passed = !result.error && meaningPassed && (fixture.language === 'ml' || lexical.rate <= 0.35);
  return { id: fixture.id, language: fixture.language, kind: fixture.kind, task, text,
    expectedEnglishText: fixture.expectedEnglishText,
    wordErrorRate: lexical, wordErrorRateIsGate: fixture.language === 'en',
    concepts, meaningPassed, passed, modelError: result.error,
    criterion: directMalayalam ? 'Diagnostic Malayalam transcription; English-note translation still required'
      : fixture.language === 'ml' ? 'All predefined meaning concepts retained; English wording may differ'
        : 'All predefined meaning concepts retained and normalized WER <= 0.35',
    metadata: Object.fromEntries(Object.entries(result).filter(([key]) => !['id', 'text', 'task'].includes(key))),
  };
}
export function validateAudio(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a RIFF WAV');
  let format, bytes;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buffer.length) throw new Error('Truncated WAV chunk');
    const type = buffer.toString('ascii', offset, offset + 4);
    if (type === 'fmt ') {
      if (size < 16) throw new Error('Truncated WAV format');
      format = { codec: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14) };
    }
    if (type === 'data') bytes = size;
    offset = start + size + (size % 2);
  }
  if (!format || bytes == null || format.codec !== 1 || format.channels !== 1 || format.sampleRate !== 16000 || format.bitsPerSample !== 16) throw new Error('Expected mono 16 kHz PCM signed 16-bit WAV');
  return { ...format, durationSeconds: bytes / 32000 };
}
export function verifyFixtures(manifest, directory) {
  const ids = new Set();
  return manifest.fixtures.map(fixture => {
    if (ids.has(fixture.id)) throw new Error(`Duplicate fixture: ${fixture.id}`);
    ids.add(fixture.id);
    const audioPath = path.resolve(directory, fixture.file);
    if (!audioPath.startsWith(path.resolve(directory) + path.sep)) throw new Error('Fixture escapes fixture directory');
    const audio = fs.readFileSync(audioPath);
    const hash = crypto.createHash('sha256').update(audio).digest('hex');
    if (hash !== fixture.sha256) throw new Error(`Fixture hash mismatch: ${fixture.id}`);
    const info = validateAudio(audio);
    if (Math.abs(info.durationSeconds - fixture.durationSeconds) > 0.001) throw new Error(`Fixture duration mismatch: ${fixture.id}`);
    return { id: fixture.id, sha256: hash, ...info };
  });
}

function main() {
  const args = process.argv.slice(2), directory = path.join(root, 'tests/voice');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const verified = verifyFixtures(manifest, directory);
  if (args[0] === '--verify') { console.log(JSON.stringify({ verified: verified.length, fixtures: verified }, null, 2)); return; }
  if (!args[0]) throw new Error('Usage: node scripts/evaluate-whisper-audio.mjs RESULTS.json [REPORT.json] | --verify');
  const input = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const results = Array.isArray(input) ? input : input.results;
  if (!Array.isArray(results)) throw new Error('Expected an array or {results:[{id,text,task,...metadata}]}');
  const byId = new Map();
  for (const result of results) {
    if (byId.has(result.id)) throw new Error(`Duplicate actual result: ${result.id}`);
    if (!manifest.fixtures.some(fixture => fixture.id === result.id)) throw new Error(`Unknown fixture result: ${result.id}`);
    byId.set(result.id, result);
  }
  const scored = manifest.fixtures.map(fixture => scoreFixture(fixture, byId.get(fixture.id)));
  const summary = Object.fromEntries(['en', 'ml', 'none'].map(language => {
    const group = scored.filter(result => result.language === language);
    return [language, { cases: group.length, passed: group.filter(result => result.passed).length, allPassed: group.every(result => result.passed) }];
  }));
  const report = { evaluatedAt: new Date().toISOString(), fixtureDatasetRevision: manifest.datasetRevision,
    limitations: 'Small human-read corpus, no Indian-English accent guarantee, no spontaneous personal Malayalam/payment speech, no microphone/recording path. Regex concept checks are conservative lexical proxies and require human review; this is not a population accuracy estimate.',
    summary, allPassed: scored.every(result => result.passed), results: scored };
  if (args[1]) fs.writeFileSync(args[1], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.allPassed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
