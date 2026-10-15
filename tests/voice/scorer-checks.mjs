import assert from 'node:assert/strict';
import test from 'node:test';
import { wordErrorRate, scoreFixture, tokens, validateAudio } from '../../scripts/evaluate-whisper-audio.mjs';

test('WER retains word errors while ignoring punctuation and case', () => {
  assert.equal(wordErrorRate('The taxi costs five hundred.', 'the TAXI costs five hundred!').rate, 0);
  assert.equal(wordErrorRate('taxi costs five hundred', 'taxi costs six hundred').rate, 0.25);
  assert.equal(wordErrorRate('taxi fare', 'taxi fare taxi fare').rate, 1);
  assert.equal(wordErrorRate('', 'thank you').rate, 1);
  assert.ok(tokens('ചെറിയ ദൂരത്തിന്').length === 2);
});
test('translation accepts changed English wording but not lost fare or invented speech', () => {
  const fixture = { id: 'ml-test', language: 'ml', expectedEnglishText: 'The short taxi ride costs 500 francs.',
    requiredEnglishConcepts: [
      {label: 'taxi', patterns: ['\\btaxi\\b']},
      {label: 'fare', patterns: ['\\b500\\b', '\\bfive hundred\\b']},
      {label: 'short', patterns: ['\\bshort\\b']},
    ] };
  assert.equal(scoreFixture(fixture, {text: 'For a short ride by taxi, pay five hundred francs.', task:'translate'}).passed, true);
  assert.equal(scoreFixture(fixture, {text: 'The short taxi ride costs 600 francs.', task:'translate'}).passed, false);
  assert.equal(scoreFixture(fixture, {text: 'Thank you for watching.', task:'translate'}).passed, false);
  assert.equal(scoreFixture(fixture, {text: 'ചെറിയ ദൂരം', task:'transcribe'}).passed, false);
  assert.equal(scoreFixture(fixture).passed, false);
});
test('silence/noise fails hallucinations and recognition failures', () => {
  const fixture = { id:'control', language:'none' };
  assert.equal(scoreFixture(fixture, {text:''}).passed, true);
  assert.equal(scoreFixture(fixture, {text:'Thank you.'}).passed, false);
  assert.equal(scoreFixture(fixture, {text:'',error:'Engine crashed'}).passed, false);
});
test('audio verification rejects malformed input instead of accepting any WAV suffix', () => {
  assert.throws(() => validateAudio(Buffer.from('not a wave file')), /RIFF WAV/);
});
