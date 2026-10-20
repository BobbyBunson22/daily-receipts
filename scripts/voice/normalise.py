"""Turns written news into the words a British newsreader would say, before Kokoro reads it.

    £1.3bn -> one point three billion pounds      1.1% -> one point one per cent
    3-1 (sport) -> three-one, 1-1 -> one-all       2-0 -> two-nil
    18 October -> the eighteenth of October        35th -> thirty-fifth
    2004 -> two thousand and four                  1986-87 -> nineteen eighty-six to eighty-seven
    7.30pm -> seven thirty p.m.                    10,764.69 -> ten thousand, seven hundred and sixty-four point six nine

Plus a list of respellings for names Kokoro gets wrong (lexicon.json). No dependencies.
"""
import json
import re
from pathlib import Path

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
SCALES = [(10**12, "trillion"), (10**9, "billion"), (10**6, "million"), (1000, "thousand")]
ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}
MONTHS = "January February March April May June July August September October November December".split()
LEXICON = json.loads((Path(__file__).parent / "lexicon.json").read_text())


def _under_100(n: int) -> str:
    if n < 20:
        return ONES[n]
    return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")


def _under_1000(n: int) -> str:
    h, r = divmod(n, 100)
    if not h:
        return _under_100(r)
    return ONES[h] + " hundred" + (" and " + _under_100(r) if r else "")


def words(n: int) -> str:
    """Whole number in British words: 2504 -> two thousand, five hundred and four."""
    if n < 0:
        return "minus " + words(-n)
    if n < 1000:
        return _under_1000(n)
    parts = []
    for size, name in SCALES:
        if n >= size:
            q, n = divmod(n, size)
            parts.append(words(q) + " " + name)
    if n:
        parts.append(("and " if n < 100 else "") + _under_1000(n))
    return ", ".join(parts).replace(", and ", " and ")


def ordinal(n: int) -> str:
    w = words(n)
    head, _, last = w.rpartition(" ")
    last_head, dash, last_word = last.rpartition("-")
    if last_word in ORD:
        last_word = ORD[last_word]
    elif last_word.endswith("y"):
        last_word = last_word[:-1] + "ieth"
    else:
        last_word += "th"
    return (head + " " if head else "") + last_head + dash + last_word


def year(n: int) -> str:
    if 2000 <= n <= 2009:
        return "two thousand" + (" and " + ONES[n - 2000] if n > 2000 else "")
    hi, lo = divmod(n, 100)
    if lo == 0:
        return words(hi) + " hundred"
    return words(hi) + " " + ("oh " + ONES[lo] if lo < 10 else _under_100(lo))


def number(s: str) -> str:
    """'10,764.69' -> words, reading decimals digit by digit."""
    s = s.replace(",", "")
    whole, _, frac = s.partition(".")
    out = words(int(whole)) if whole and int(whole) else "nought"
    if frac:
        out += " point " + " ".join("oh" if d == "0" else ONES[int(d)] for d in frac)
    return out


SCALE_WORDS = {"bn": "billion", "billion": "billion", "m": "million", "million": "million", "tn": "trillion", "trillion": "trillion", "k": "thousand"}
CURRENCY = {"£": ("pound", "pounds"), "$": ("dollar", "dollars"), "€": ("euro", "euros")}
NUM = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"


def _money(m: re.Match) -> str:
    sym, amount, scale = m.group(1), m.group(2), (m.group(3) or "").lower()
    one, many = CURRENCY[sym]
    if scale:
        return f"{number(amount)} {SCALE_WORDS[scale]} {many}"
    whole, _, pence = amount.replace(",", "").partition(".")
    w = int(whole)
    out = f"{words(w)} {one if w == 1 else many}"
    if pence and int(pence):
        out += " " + words(int(pence.ljust(2, "0")[:2]))
    return out


def _score(a: str, b: str) -> str:
    if a == b:
        return f"{words(int(a))}-all"
    return f"{words(int(a))}-{'nil' if b == '0' else words(int(b))}"


def normalise(text: str, sport: bool = False) -> str:
    # names with numbers: COP17, GLP-1, Covid-19 -> "COP 17" (the number is read below)
    t = re.sub(r"\b([A-Za-z]{2,})-?(\d+)\b(?!%)", r"\1 \2", text)
    for written, said in LEXICON["respell"].items():
        t = re.sub(rf"(?<![\w]){re.escape(written)}(?![A-Za-z])", said, t)
    t = t.replace("–", "-").replace("—", ", ")
    # money: £1.3bn, $20, €4.5 million
    t = re.sub(rf"([£$€])({NUM})(?:\s?(bn|tn|m|k|billion|million|trillion))?\b", _money, t)
    # percentages
    t = re.sub(rf"({NUM})\s?%", lambda m: number(m.group(1)) + " per cent", t)
    # seasons and year ranges: 1986-87, 2024-25, 2024-2025
    t = re.sub(r"\b(1[1-9]\d\d|20\d\d)-(\d\d)\b", lambda m: f"{year(int(m.group(1)))} to {_under_100(int(m.group(2))) if int(m.group(2)) >= 10 else 'oh ' + ONES[int(m.group(2))]}", t)
    t = re.sub(r"\b(1[1-9]\d\d|20\d\d)-(1[1-9]\d\d|20\d\d)\b", lambda m: f"{year(int(m.group(1)))} to {year(int(m.group(2)))}", t)
    # date ranges: 13 to 18 October, 13-18 October
    t = re.sub(rf"\b(\d{{1,2}})(?: to |-)(\d{{1,2}}) ({'|'.join(MONTHS)})\b",
               lambda m: f"the {ordinal(int(m.group(1)))} to the {ordinal(int(m.group(2)))} of {m.group(3)}", t)
    # scores in sport, otherwise ranges
    if sport:
        t = re.sub(r"\b(\d{1,2})-(\d{1,2})\b", lambda m: _score(m.group(1), m.group(2)), t)
    t = re.sub(r"\b(\d+)-(\d+)\b", lambda m: f"{words(int(m.group(1)))} to {words(int(m.group(2)))}", t)
    # times: 7.30pm, 10am, 19:45
    t = re.sub(r"\b(\d{1,2})(?:[.:](\d\d))?\s?(am|pm)\b",
               lambda m: f"{words(int(m.group(1)))}{' ' + (('oh ' + ONES[int(m.group(2))]) if m.group(2) and int(m.group(2)) < 10 else _under_100(int(m.group(2)))) if m.group(2) and int(m.group(2)) else ''} {'a.m.' if m.group(3) == 'am' else 'p.m.'}", t)
    # dates: 18 October -> the eighteenth of October
    t = re.sub(rf"\b(\d{{1,2}}) ({'|'.join(MONTHS)})\b", lambda m: f"the {ordinal(int(m.group(1)))} of {m.group(2)}", t)
    # ordinals: 35th, 1st, 2nd
    t = re.sub(r"\b(\d+)(st|nd|rd|th)\b", lambda m: ordinal(int(m.group(1))), t)
    # years: four digits on their own, not part of a bigger number
    t = re.sub(r"(?<![\d,.])\b(1[1-9]\d\d|20\d\d)\b(?![\d,]|\.\d)", lambda m: year(int(m.group(1))), t)
    # units: 5km, 30°C, 70mph
    units = "|".join(re.escape(u) for u in sorted(LEXICON["units"], key=len, reverse=True))
    t = re.sub(rf"({NUM})\s?({units})(?![\w])", lambda m: f"{number(m.group(1))} {LEXICON['units'][m.group(2)]}", t)
    # numbers with scale words: 2.5 million, 500,000
    t = re.sub(rf"\b({NUM})\s?(bn|tn)\b", lambda m: f"{number(m.group(1))} {SCALE_WORDS[m.group(2)]}", t)
    t = re.sub(rf"(?<![\w.]){NUM}\b", lambda m: number(m.group(0)), t)
    for written, said in LEXICON["abbrev"].items():
        # "Dr Smith", "Arsenal v Spurs": only when followed by a word, and dots dropped
        t = re.sub(rf"(?<![\w.]){re.escape(written)}\.?(?= [\w])", said, t)
    return re.sub(r"\s+", " ", t).strip()
