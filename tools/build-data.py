"""Builds js/data.js from raw Google Books Ngram downloads.

Usage: python3 tools/build-data.py <dir with raw json> > js/data.js

Each raw file is the response of
https://books.google.com/ngrams/json?content=<phrase>&year_start=1800&year_end=2022&corpus=en&smoothing=0
Values are converted to uses per million and smoothed with a centered
3-year average (the first and last year average the two years available).
"""
import json, sys, os

ROUNDS = [
  # id, phrase, start, end, cutoff, setup (shown before drawing, optional), note (shown after)
  ("ai", "artificial intelligence", 1960, 2022, 1988, "",
   "It peaked in 1987 during the expert-systems boom, then fell by more than half through the “AI winter”. It didn’t pass that 1980s peak again until 2018."),
  ("nuclear-war", "nuclear war", 1945, 2022, 1978, "",
   "It shot up in the early 1980s as Cold War tension rose again, peaking in 1983. By the late 1990s, after the Soviet Union was gone, books used it about a seventh as often."),
  ("superhighway", "information superhighway", 1985, 2022, 1994, "A 1990s name for the internet",
   "It peaked in 1995. Once everyone just said “the internet”, it faded to almost nothing."),
  ("y2k", "Y2K", 1990, 2022, 1997, "The “millennium bug” that was supposed to break computers on January 1, 2000",
   "It peaked in 1999. Nothing much broke, and by 2002 books used it almost 90% less."),
  ("fax", "fax", 1970, 2022, 1993, "",
   "It peaked around 1998, when a fax number sat on every letterhead, then collapsed as email took over. By 2020 it was down 97% from the peak."),
  ("global-warming", "global warming", 1980, 2022, 2003, "",
   "It peaked around 2009. Writers increasingly said “climate change” instead: by 2010 that phrase showed up more than three times as often."),
  ("acid-rain", "acid rain", 1965, 2022, 1980, "",
   "It was one of the big environmental stories of the 1980s, peaking in 1985. The 1990 US Clean Air Act amendments went after the sulfur emissions behind it, and the term faded."),
  ("influenza", "influenza", 1880, 2022, 1914, "The bump on the left is the 1889–90 “Russian flu” pandemic",
   "The 1918 flu pandemic pushed it to its highest level ever, about nine times its 1912 level. COVID-19 barely moved it, because that pandemic had its own name."),
  ("polio", "polio", 1900, 2022, 1945, "",
   "It peaked in 1955, the year the Salk vaccine was announced as safe and effective. As the disease retreated, so did the word."),
  ("cyberspace", "cyberspace", 1984, 2022, 1995, "Coined by the science fiction writer William Gibson in 1982",
   "It peaked around 2000. Unlike most 1990s tech words it never really went away, and it has held near that level since."),
  ("mindfulness", "mindfulness", 1980, 2022, 2008, "",
   "It grew more than thirteenfold between 2000 and 2022, moving from Buddhist practice into therapy, schools and workplace wellness."),
  ("pollution", "pollution", 1940, 2022, 1966, "",
   "It more than tripled between 1964 and 1972. The first Earth Day and the US Environmental Protection Agency both arrived in 1970. Since then it has drifted down."),
  ("hippie", "hippie", 1955, 2022, 1980, "",
   "It faded fast after the 1960s, then climbed back past its early-1970s high by the late 2000s, this time as history and nostalgia."),
  ("computer", "computer", 1940, 2022, 1980, "",
   "It peaked in 1985 and has fallen by more than half since. As computers became ordinary, books named the specific thing instead: laptop, phone, software, the internet."),
  ("recycling", "recycling", 1960, 2022, 1987, "",
   "It more than doubled between 1987 and 1992 as curbside programs spread, then settled at about half that peak."),
  ("terrorism", "terrorism", 1960, 2022, 1999, "",
   "It almost quadrupled after September 11, 2001, peaking in 2003, and has been coming down since."),
  ("pluto", "Pluto", 1900, 2022, 2006, "In 2006 astronomers reclassified Pluto as a dwarf planet",
   "The demotion didn’t hurt it. Mentions held steady and kept edging up. (The count also includes the Roman god and the cartoon dog.)"),
  ("dinosaurs", "dinosaurs", 1950, 2022, 1976, "",
   "It nearly quadrupled between 1977 and 2001, years that brought a burst of new fossil finds, a rethink of dinosaurs as active animals, and Jurassic Park."),
  ("radio", "radio", 1900, 2022, 1935, "",
   "It peaked in 1946. Television arrived soon after, and radio slowly gave up its share of the page."),
]

def load(d, phrase):
    f = os.path.join(d, phrase.replace(' ', '_').lower() + '.json')
    data = json.load(open(f))
    assert data and data[0]['ngram'] == phrase, (f, data[:1])
    ts = data[0]['timeseries']
    assert len(ts) == 223, len(ts)
    return ts

def smooth(ts):
    out = []
    for i in range(len(ts)):
        w = ts[max(0, i-1):i+2]
        out.append(sum(w) / len(w) * 1e6)
    return out

def sig(v):
    if v == 0: return 0
    return float(f"{v:.3g}")

raw_dir = sys.argv[1]
rounds = []
for rid, phrase, start, end, cutoff, setup, note in ROUNDS:
    assert start < cutoff < end <= 2022
    sm = smooth(load(raw_dir, phrase))
    vals = [sig(sm[y - 1800]) for y in range(start, end + 1)]
    rounds.append(dict(id=rid, phrase=phrase, start=start, end=end, cutoff=cutoff,
                       setup=setup, note=note, values=vals))

print("// Generated by tools/build-data.py from Google Books Ngram Viewer data")
print("// (English corpus, 2022 edition). Values are uses per million words,")
print("// as a centered 3-year average. Do not edit by hand.")
print("export const ROUNDS = " + json.dumps(rounds, ensure_ascii=False, indent=1) + ";")
