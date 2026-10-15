#!/usr/bin/env python3
"""Download only the pinned, openly licensed FLEURS clips used by Kanakku.
No user audio or credentials are read. Needs ffmpeg, otherwise Python stdlib only.
"""
import csv
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import wave
import random
import struct
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent
REVISION = '70bb2e84b976b7e960aa89f1c648e09c59f894dd'
BASE = f'https://huggingface.co/datasets/google/fleurs/resolve/{REVISION}'
SELECTED = {
    'en_us': {
        '1361225517388701679.wav': ('en-natural-bus', '1805'),
        '11374239868879585530.wav': ('en-natural-drinks', '1720'),
        '16847628585853049714.wav': ('en-natural-taxi', '1915'),
    },
    'ml_in': {
        '16705918827897587309.wav': ('ml-natural-bus', '1805'),
        '3247157444524906724.wav': ('ml-natural-drinks', '1720'),
        '5875030529190395995.wav': ('ml-natural-taxi', '1915'),
    },
}
CONCEPTS = {
    'bus': [
        {'label': 'bus travel', 'patterns': [r'\bbus\b']},
        {'label': 'route number 403', 'patterns': [r'\b403\b', r'\bfour (?:hundred (?:and )?)?three\b', r'\bfour oh three\b']},
        {'label': 'Sintra destination', 'patterns': [r'\b[sc]intra\b']},
        {'label': 'Cabo da Roca stop', 'patterns': [r'\bcabo (?:da |de )?ro[ck]a\b', r'\bkabo (?:da |de )?ro[ck]a\b']},
    ],
    'drinks': [
        {'label': 'hot chocolate', 'patterns': [r'\bhot chocolate\b']},
        {'label': 'Belgian standard', 'patterns': [r'\bbelgi(?:an|um)\b']},
        {'label': 'fruit juice', 'patterns': [r'\bfruit juices?\b']},
        {'label': 'juice expensive', 'patterns': [r'\bpricey\b', r'\bexpensive\b', r'\bcostly\b', r'\bhigh.{0,12}price\b']},
        {'label': 'juice good taste', 'patterns': [r'\bexcellent\b', r'\bdelicious\b', r'\btasty\b', r'\bgood\b']},
    ],
    'taxi': [
        {'label': 'motorcycle taxi', 'patterns': [r'\bmotor ?(?:cycle|bike)\b', r'\btaxi\b']},
        {'label': 'Goma place', 'patterns': [r'\bgoma\b']},
        {'label': 'fare 500', 'patterns': [r'\b500\b', r'\bfive hundred\b']},
        {'label': 'Congolese currency context', 'patterns': [r'\bcongolese\b', r'\bcongo\b']},
        {'label': 'franc currency', 'patterns': [r'\bfrancs?\b']},
        {'label': 'short ride', 'patterns': [r'\bshort\b', r'\bsmall distance\b', r'\blittle distance\b']},
    ],
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def info(path):
    with wave.open(str(path)) as audio:
        assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) == (1, 2, 16000)
        return {'sampleRate': 16000, 'channels': 1, 'sampleWidth': 2,
                'durationSeconds': round(audio.getnframes() / 16000, 3), 'sha256': sha(path)}

def fetch_language(lang):
    with urllib.request.urlopen(f'{BASE}/data/{lang}/test.tsv', timeout=120) as response:
        rows = list(csv.reader(io.StringIO(response.read().decode()), delimiter='\t'))
    rows_by_filename = {row[1]: row for row in rows}
    audio_url = f'{BASE}/data/{lang}/audio/test.tar.gz'
    pending = dict(SELECTED[lang])
    result = []
    with tempfile.TemporaryDirectory(prefix='kanakku-fleurs-') as staging:
        with urllib.request.urlopen(audio_url, timeout=120) as stream, tarfile.open(fileobj=stream, mode='r|gz') as archive:
            for member in archive:
                filename = pathlib.PurePosixPath(member.name).name
                if filename not in pending:
                    continue
                fixture_id, sentence_id = pending.pop(filename)
                row = rows_by_filename[filename]
                assert row[0] == sentence_id
                source = pathlib.Path(staging) / filename
                with archive.extractfile(member) as incoming, source.open('wb') as target:
                    shutil.copyfileobj(incoming, target)
                output = ROOT / 'audio' / f'{fixture_id}.wav'
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(output)], check=True)
                result.append({'id': fixture_id, 'language': 'ml' if lang == 'ml_in' else 'en',
                               'kind': 'natural-read-speech', 'file': f'audio/{fixture_id}.wav',
                               'expectedSourceText': row[2], 'sourceNormalizedText': row[3],
                               'speakerGenderLabel': row[6], 'sentenceId': sentence_id,
                               'sourceFilename': filename, 'sourceAudioSha256': sha(source),
                               'sourceArchive': audio_url, 'sourceTranscripts': f'{BASE}/data/{lang}/test.tsv',
                               'license': 'CC-BY-4.0', **info(output)})
                print(f'Prepared {fixture_id}', flush=True)
                if not pending:
                    break
    if pending:
        raise RuntimeError(f'Missing clips: {pending}')
    return result

def write_manifest(fixtures):
    english = {fixture['sentenceId']: fixture['expectedSourceText'] for fixture in fixtures if fixture['language'] == 'en'}
    for fixture in fixtures:
        fixture['expectedEnglishText'] = english[fixture['sentenceId']]
        fixture['requiredEnglishConcepts'] = CONCEPTS[fixture['id'].split('-')[-1]]
    # Exact synthetic controls. Noise uses reproducible low-level white noise,
    # and does not pretend to be a recording of a room or real microphone.
    for kind in ['silence', 'noise']:
        path = ROOT / 'audio' / f'control-{kind}.wav'
        randomizer = random.Random(20261014)
        frames = [0 if kind == 'silence' else round(randomizer.uniform(-0.02, 0.02) * 32767) for _ in range(16000 * 4)]
        with wave.open(str(path), 'wb') as audio:
            audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(16000)
            audio.writeframes(struct.pack('<' + 'h' * len(frames), *frames))
        fixtures.append({'id': f'control-{kind}', 'language': 'none', 'kind': f'synthetic-{kind}',
                         'file': f'audio/control-{kind}.wav', 'expectedEnglishText': '',
                         'expectedSourceText': '', 'requiredEnglishConcepts': [],
                         'license': 'CC0-1.0', **info(path)})
    manifest = {'schemaVersion': 1, 'dataset': 'Google FLEURS', 'datasetRevision': REVISION,
                'attribution': 'Conneau et al. (2022), FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech; Google. Natural speech recordings: CC BY 4.0.',
                'source': 'https://huggingface.co/datasets/google/fleurs',
                'license': 'https://creativecommons.org/licenses/by/4.0/',
                'selection': 'Three predefined matched English/Malayalam sentences selected for travel/drinks/fare concepts before running recognition. Not selected based on model performance.',
                'fixtures': sorted(fixtures, key=lambda fixture: fixture['id'])}
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    (ROOT / 'audio').mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        batches = list(pool.map(fetch_language, SELECTED))
    write_manifest([fixture for batch in batches for fixture in batch])
