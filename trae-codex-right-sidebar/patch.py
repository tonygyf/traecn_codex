"""Scoped, reversible Trae CN compatibility patch for the Codex secondary sidebar."""
from pathlib import Path
import argparse, base64, hashlib, json, shutil, sqlite3, subprocess, sys
from datetime import datetime

ROOT = Path(__file__).resolve().parent
APP = Path.home() / 'AppData/Local/Programs/Trae CN/resources/app'
USER = Path.home() / 'AppData/Roaming/Trae CN/User'
PRODUCT = APP / 'product.json'
FILES = ['out/vs/workbench/workbench.desktop.main.js', 'out/vs/workbench/workbench.desktop.main.solo-lite.js']
MARKER = '/*local-codex-secondary-sidebar-v1*/'
RULES = [
    ('case"panel":r=this.registerCustomViewContainers(d,l,r,t,1);break',
     'case"panel":r=this.registerCustomViewContainers(d,l,r,t,1);break;case"secondarySidebar":' + MARKER + 'l.identifier.value==="openai.chatgpt"&&this.registerCustomViewContainers(d,l,100,t,2);break'),
    ('hideIfEmpty:!0,order:n,icon:s,isICubeBuiltin:a',
     'hideIfEmpty:!0,order:n,icon:s,type:o===2&&r?.value==="openai.chatgpt"?"ai":void 0,isICubeBuiltin:a'),
]

def sha(data): return hashlib.sha256(data).hexdigest()
def integrity(data): return base64.b64encode(hashlib.sha256(data).digest()).decode().rstrip('=')
def atomic_write(path, data):
    temp = path.with_name(path.name + '.codex-sidebar.tmp')
    temp.write_bytes(data)
    temp.replace(path)

def check():
    product = json.loads(PRODUCT.read_text(encoding='utf-8'))
    print('Trae version:', product.get('version'), 'commit:', product.get('commit'))
    for rel in FILES:
        data = (APP / rel).read_bytes()
        text = data.decode('utf-8')
        key = rel.removeprefix('out/')
        print(json.dumps({'file': rel, 'patched': MARKER in text,
              'original_anchors': [text.count(a) for a, b in RULES],
              'patched_anchors': [text.count(b) for a, b in RULES],
              'sha256': sha(data), 'checksum_matches': product['checksums'].get(key) == integrity(data)}))

def apply():
    product_bytes = PRODUCT.read_bytes()
    product = json.loads(product_bytes)
    changes = []
    patched_count = 0
    for rel in FILES:
        path = APP / rel
        original = path.read_bytes()
        text = original.decode('utf-8')
        if MARKER in text:
            if any(text.count(b) != 1 for a, b in RULES):
                raise RuntimeError(f'Incomplete or changed patch in {rel}; refusing to modify it.')
            patched_count += 1
            continue
        # Both anchors and the surrounding signature must match this known layout.
        signature = 'registerCustomViewContainer(e,t,s,n,r,o,a,l,c)'
        if text.count(signature) != 1 or any(text.count(a) != 1 for a, b in RULES):
            raise RuntimeError(f'Unsupported Trae build in {rel}; no files changed.')
        key = rel.removeprefix('out/')
        if product['checksums'].get(key) != integrity(original):
            raise RuntimeError(f'Existing integrity mismatch in {rel}; no files changed.')
        for before, after in RULES:
            text = text.replace(before, after, 1)
        changes.append((rel, original, text.encode('utf-8'), key))
    if patched_count:
        if patched_count != len(FILES):
            raise RuntimeError('Mixed patched/unpatched workbench bundles; restore before applying.')
        print('Already applied. No changes made.')
        check()
        return

    # Validate every modified JS bundle before touching installed files.
    validation = ROOT / 'validation'
    validation.mkdir(exist_ok=True)
    for rel, original, modified, key in changes:
        target = validation / Path(rel).name
        target.write_bytes(modified)
        subprocess.run(['node', '--check', str(target)], check=True, capture_output=True, text=True)
    backup = ROOT / ('backup-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir()
    (backup / 'product.json').write_bytes(product_bytes)
    records = []
    updated_product = product_bytes
    for rel, original, modified, key in changes:
        (backup / Path(rel).name).write_bytes(original)
        old, new = integrity(original), integrity(modified)
        if updated_product.count(old.encode()) != 1:
            raise RuntimeError(f'Checksum entry is ambiguous for {rel}; installed files not changed.')
        updated_product = updated_product.replace(old.encode(), new.encode(), 1)
        records.append({'relativePath': rel, 'beforeSha256': sha(original), 'afterSha256': sha(modified), 'checksumKey': key})
    # Snapshot layout databases without modifying or locking the running editor.
    dbs = [USER / 'globalStorage/state.vscdb', USER / 'workspaceStorage/ccf4c4ab3164232aa053bf8673ad7c57/state.vscdb']
    for index, dbpath in enumerate(dbs):
        if dbpath.exists():
            with sqlite3.connect(dbpath.as_uri() + '?mode=ro', uri=True) as src, sqlite3.connect(backup / f'layout-{index}.vscdb') as dst:
                src.backup(dst)
    manifest = {'app': str(APP), 'version': product.get('version'), 'commit': product.get('commit'),
                'files': records, 'productBeforeSha256': sha(product_bytes), 'productAfterSha256': sha(updated_product)}
    (backup / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (ROOT / 'latest-backup.txt').write_text(str(backup), encoding='utf-8')
    written = []
    try:
        for rel, original, modified, key in changes:
            atomic_write(APP / rel, modified)
            written.append((APP / rel, original))
        atomic_write(PRODUCT, updated_product)
    except BaseException:
        for path, original in reversed(written): atomic_write(path, original)
        atomic_write(PRODUCT, product_bytes)
        raise
    print('Applied two Codex-only compatibility changes to each workbench bundle.')
    print('Backup:', backup)
    print('Reload the Trae window to activate. No extension, conversation, or project files were changed.')
    check()

def restore():
    backup = Path((ROOT / 'latest-backup.txt').read_text(encoding='utf-8').strip())
    manifest = json.loads((backup / 'manifest.json').read_text(encoding='utf-8'))
    for record in manifest['files']:
        current = (APP / record['relativePath']).read_bytes()
        if sha(current) not in [record['beforeSha256'], record['afterSha256']]:
            raise RuntimeError('Trae has changed since this patch. Refusing to overwrite newer or unknown files.')
    current_product = PRODUCT.read_bytes()
    if sha(current_product) not in [manifest['productBeforeSha256'], manifest['productAfterSha256']]:
        raise RuntimeError('product.json has changed; refusing to overwrite it.')
    for record in manifest['files']:
        atomic_write(APP / record['relativePath'], (backup / Path(record['relativePath']).name).read_bytes())
    atomic_write(PRODUCT, (backup / 'product.json').read_bytes())
    print('Original Trae workbench files restored. Reload Trae to activate.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['check', 'apply', 'restore'], default='check', nargs='?')
    args = parser.parse_args()
    try: {'check': check, 'apply': apply, 'restore': restore}[args.mode]()
    except Exception as error:
        print('ERROR:', error, file=sys.stderr)
        sys.exit(1)
