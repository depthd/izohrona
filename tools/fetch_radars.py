"""Download the complete pinned public CS2 radar catalog, with provenance and hashes.
Images stay in ignored out/: this is a research reference, not bundled game assets.
"""
import concurrent.futures, hashlib, json, pathlib, urllib.request

REV = '6dcfb3a770afc08a16c4e843c51b873cac7fc4d5'
REPO = 'MurkyYT/cs2-map-icons'
ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'out' / 'reference_radars'

def read(url):
    with urllib.request.urlopen(url, timeout=45) as r:
        return r.read()

def main():
    tree = json.loads(read(f'https://api.github.com/repos/{REPO}/git/trees/{REV}?recursive=1'))
    if tree.get('truncated'):
        raise RuntimeError('Incomplete catalog')
    paths = [x['path'] for x in tree['tree'] if x['type'] == 'blob' and
             (x['path'].startswith('images/radars/') or x['path'].startswith('data/radar_info/'))]
    def fetch(path):
        url = f'https://raw.githubusercontent.com/{REPO}/{REV}/{path}'
        dest = DEST / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        content = dest.read_bytes() if dest.exists() else read(url)
        # Verify against the Git object ID supplied by the pinned source tree.
        expected = next(x['sha'] for x in tree['tree'] if x['path'] == path)
        actual = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
        if actual != expected:
            raise RuntimeError(f'Git object checksum mismatch: {path}')
        dest.write_bytes(content)
        return dict(path=path, url=url, sha256=hashlib.sha256(content).hexdigest(), bytes=len(content))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        entries = list(pool.map(fetch, paths))
    manifest = dict(repository=REPO, revision=REV, coverage='All radar and overview files in this source revision; not all Workshop maps or every historical version.', files=entries)
    (DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(f'{len(entries)} verified assets in {DEST}')

if __name__ == '__main__':
    main()
