"""233 包平铺角色模型和贴图，兼容禁止 fetch / import.meta.url 的 IIFE 容器。"""
import base64
import hashlib
import json
from pathlib import Path
import shutil
import struct


def pack_models(root, dist):
    root, dist = Path(root), Path(dist)
    records, tags = [], []
    for source in sorted((root / 'src/art/models').glob('*.rlpm')):
        raw = source.read_bytes()
        assert raw[:4] == b'RLPM', source
        header = json.loads(raw[12:12 + struct.unpack_from('<I', raw, 8)[0]])
        texture = source.parent / header.get('texture', source.stem + '.jpg')
        texture_name = 'tex_' + source.stem + '.jpg'
        shutil.copyfile(texture, dist / texture_name)
        encoded = base64.b64encode(raw).decode('ascii')
        record = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                  'texture': texture_name, 'data': [encoded[i:i + 262144] for i in range(0, len(encoded), 262144)]}
        script = 'model_' + source.stem + '.js'
        (dist / script).write_text('window.__RLP_RLPM=window.__RLP_RLPM||{};\nwindow.__RLP_RLPM[' +
                                  json.dumps(source.stem) + ']=' + json.dumps(record, separators=(',', ':')) + ';\n', encoding='utf-8')
        tags.append('<script src="./' + script + '"></script>')
        records.append({'key': source.stem, 'source': source.relative_to(root).as_posix(),
                        'bytes': len(raw), 'sha256': record['sha256'], 'script': script,
                        'texture': texture_name, 'texture_sha256': hashlib.sha256(texture.read_bytes()).hexdigest()})
    assert len(records) == 22, f'角色清单变化，请确认完整性：{len(records)}'
    (dist / 'native_models.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return '\n'.join(tags) + '\n'
