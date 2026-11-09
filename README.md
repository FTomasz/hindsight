# Hindsight

Ten daily games about numbers, history and the words in 200 years of books.

Live at **https://prathammukewar.github.io/hindsight/**

| Game | What you do |
| --- | --- |
| Draw the rest | See how often books used a word up to some year, then draw where the line went |
| Estimate | Answer big questions with exact answers, scored on how many times off you were |
| Siege | Solve sums to send fighters up two lanes against a bot for 90 seconds |
| Peak year | Pick the year books used a word the most |
| Book battle | Two words, one year: which did books use more? |
| Match the curves | Put four words on their four unlabeled curves |
| Timeline | Put five moments from history in order |
| When? | One moment from history: name the year |
| Which came first | Two moments from history, pick the earlier |
| Then or now | One word, two years: when did books use it more? |

Every game has a new edition at midnight in your time zone, the same for everyone. Past editions stay playable (late plays don't count toward streaks), practice is unlimited, and the right-or-wrong games have an endless mode that runs until your first miss. The home page collects the day's scores into one card to share. Results can be shared, and a challenge link lets a friend play your exact set with your scores (and, in Draw the rest, your lines) next to theirs. Everything lives in the link and in your browser. There is no server.

## Where the data comes from

The word games use the [Google Books Ngram Viewer](https://books.google.com/ngrams), English corpus, 2022 edition. Values are uses per million words (for two-word phrases, per million two-word sequences), as a centered 3-year average. Phrases are case-sensitive and count every meaning a word has. The raw downloads are in `tools/raw/`, and two scripts turn them into `js/data.js` and `js/content/words.js`:

```sh
python3 tools/fetch-ngrams.py          # run from tools/, downloads anything missing
python3 tools/build-data.py tools/raw tools/phrases.txt > js/data.js
python3 tools/build-words.py tools/raw tools/phrases.txt > js/content/words.js
```

Draw the rest has 19 hand-written rounds and about 110 automatic ones. An automatic round picks the cutoff year where holding the line flat would score worst, so the hidden part holds a real turn, and its note is made only of numbers from the same data. A test re-derives every number in every automatic note. The hand-written notes were checked against the data by hand. Estimate answers and event years are in `js/content/`, each estimate with a source link, and were checked against encyclopedias and official sources.

## Scoring

- **Draw the rest:** 100 × e^(−4 × average miss ÷ the real peak). Missing by 5% of the peak scores 82, by 10% scores 67. Each result also shows what a flat line would have scored.
- **Estimate:** 100 × (1 − log₁₀ of how many times off you were). Exact scores 100, 2× off scores 70, 10× off scores 0.
- **Peak year:** 100 minus 3 per year off.
- **When?:** 100 minus 2 per year off.
- **Timeline:** the share of the 10 pairs you put in the right order.
- **Match the curves:** 25 per curve.
- **Siege:** 50, plus damage dealt minus damage taken divided by 40, from 0 to 100.
- The rest are right or wrong.

## Spot something wrong?

[Open an issue](https://github.com/prathammukewar/hindsight/issues) with a source and it gets fixed.

## Run it locally

Plain HTML, CSS and JavaScript modules, no build step.

```sh
python3 -m http.server
```

Then open http://localhost:8000. Before each deploy, stamp the files with content hashes so visitors never get a mix of old and new modules from the cache:

```sh
python3 tools/stamp.py
```
 Tests use Node's built-in runner and have no dependencies:

```sh
node --test test/test.mjs
```

## License

MIT. See [LICENSE](LICENSE).
