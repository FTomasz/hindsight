"""Downloads raw Ngram series (1800-2022, English 2022 corpus, no smoothing)
for every phrase in phrases.txt that isn't already in raw/. Run from tools/."""
import json, os, time, urllib.parse, urllib.request
phrases = [l.strip() for l in open('phrases.txt') if l.strip() and not l.startswith('#')]
def fname(p): return os.path.join('raw', p.replace(' ', '_').replace('/', '_').lower() + '.json')
todo = [p for p in phrases if not os.path.exists(fname(p))]
for i in range(0, len(todo), 10):
    batch = todo[i:i+10]
    url = 'https://books.google.com/ngrams/json?' + urllib.parse.urlencode({
        'content': ','.join(batch), 'year_start': 1800, 'year_end': 2022, 'corpus': 'en', 'smoothing': 0})
    req = urllib.request.Request(url, headers={'User-Agent': 'hindsight-data-builder'})
    data = json.load(urllib.request.urlopen(req, timeout=60))
    got = {d['ngram']: d for d in data}
    for p in batch:
        if p in got:
            json.dump([got[p]], open(fname(p), 'w'))
        else:
            print('MISSING', p)
    time.sleep(2)
print('done', len(todo))
