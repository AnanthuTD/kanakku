"""Reproduce the bundled category prototypes using the pinned ONNX model.
Run with a Python environment containing onnxruntime and numpy.
"""
from pathlib import Path
import json, re, unicodedata, hashlib
import numpy as np
import onnxruntime as ort
root = Path(__file__).resolve().parents[1]
assets = root / 'modules/kanakku-native/android/src/main/assets/kanakku'
model = assets / 'minilm.onnx'
assert hashlib.sha256(model.read_bytes()).hexdigest() == '4278337fd0ff3c68bfb6291042cad8ab363e1d9fbc43dcb499fe91c871902474'
vocab = {word: i for i, word in enumerate((assets / 'vocab.txt').read_text().splitlines())}
def tokenize(text):
    text = ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn')
    result = [vocab['[CLS]']]
    for word in re.findall(r'\w+|[^\w\s]', text):
        start, pieces = 0, []
        while start < len(word):
            found = False
            for end in range(len(word), start, -1):
                part = word[start:end] if start == 0 else '##' + word[start:end]
                if part in vocab:
                    pieces.append(vocab[part]); start = end; found = True; break
            if not found: pieces = [vocab['[UNK]']]; break
        result.extend(pieces)
    return (result[:63] + [vocab['[SEP]']])
session = ort.InferenceSession(str(model), providers=['CPUExecutionProvider'])
def embed(text):
    ids = np.array([tokenize(text)], dtype=np.int64)
    inputs = {'input_ids': ids, 'attention_mask': np.ones_like(ids), 'token_type_ids': np.zeros_like(ids)}
    hidden = session.run(None, {k:v for k,v in inputs.items() if k in {i.name for i in session.get_inputs()}})[0]
    mean = hidden[0].mean(axis=0)
    return mean / max(np.linalg.norm(mean), 1e-12)
if __name__ == '__main__':
    data = json.loads((root / 'scripts/semantic-prototypes.json').read_text())
    prototypes = [{'category':category, 'text':text, 'embedding':embed(text).tolist()} for category,texts in data.items() for text in texts]
    (assets / 'prototypes.json').write_text(json.dumps(prototypes,separators=(',',':'))+'\n')
    print('Prepared',len(prototypes),'semantic category prototypes.')
