"""python3 -m unittest discover -s scripts/voice"""
import unittest

from normalise import normalise, ordinal, words, year


class Normalise(unittest.TestCase):
    def test_words(self):
        self.assertEqual(words(0), "zero")
        self.assertEqual(words(35), "thirty-five")
        self.assertEqual(words(100), "one hundred")
        self.assertEqual(words(2504), "two thousand, five hundred and four")
        self.assertEqual(words(500000), "five hundred thousand")
        self.assertEqual(words(2500), "two thousand, five hundred")
        self.assertEqual(words(1000005), "one million and five")
        self.assertEqual(ordinal(35), "thirty-fifth")
        self.assertEqual(ordinal(51), "fifty-first")
        self.assertEqual(ordinal(13), "thirteenth")
        self.assertEqual(ordinal(20), "twentieth")
        self.assertEqual(ordinal(18), "eighteenth")
        self.assertEqual(year(2004), "two thousand and four")
        self.assertEqual(year(2027), "twenty twenty-seven")
        self.assertEqual(year(1986), "nineteen eighty-six")
        self.assertEqual(year(1905), "nineteen oh five")
        self.assertEqual(year(1900), "nineteen hundred")

    def test_money_and_percent(self):
        self.assertEqual(normalise("a £100 fine"), "a one hundred pounds fine")
        self.assertEqual(normalise("a $1.3bn deal"), "a one point three billion dollars deal")
        self.assertEqual(normalise("$20 a share"), "twenty dollars a share")
        self.assertEqual(normalise("about $1.3 billion."), "about one point three billion dollars.")
        self.assertEqual(normalise("£2.50 each"), "two pounds fifty each")
        self.assertEqual(normalise("£1 coin"), "one pound coin")
        self.assertEqual(normalise("fell 1.1% to 10,764.69"), "fell one point one per cent to ten thousand, seven hundred and sixty-four point six nine")
        self.assertEqual(normalise("130% above"), "one hundred and thirty per cent above")

    def test_sport(self):
        self.assertEqual(normalise("drew 1-1 at Elland Road", sport=True), "drew one-all at Elland Road")
        self.assertEqual(normalise("won 3-1", sport=True), "won three-one")
        self.assertEqual(normalise("won 2-0", sport=True), "won two-nil")
        self.assertEqual(normalise("in the 35th minute", sport=True), "in the thirty-fifth minute")
        self.assertEqual(normalise("since 1986-87", sport=True), "since nineteen eighty-six to eighty-seven")
        self.assertEqual(normalise("Mbeumo scored", sport=True), "Em-boo-mo scored")
        self.assertEqual(normalise("Arsenal v Chelsea", sport=True), "Arsenal versus Chelsea")

    def test_dates_times_years(self):
        self.assertEqual(normalise("on Sunday 18 October."), "on Sunday the eighteenth of October.")
        self.assertEqual(normalise("in 2004"), "in two thousand and four")
        self.assertEqual(normalise("in early 2027."), "in early twenty twenty-seven.")
        self.assertEqual(normalise("at 7.30pm"), "at seven thirty p.m.")
        self.assertEqual(normalise("at 10am"), "at ten a.m.")
        self.assertEqual(normalise("2024-25 season"), "twenty twenty-four to twenty-five season")
        self.assertEqual(normalise("between 3-5 years"), "between three to five years")

    def test_names_units_numbers(self):
        self.assertEqual(normalise("The FTSE 100 fell"), "The Footsie one hundred fell")
        self.assertEqual(normalise("COP17 talks"), "Cop seventeen talks")
        self.assertEqual(normalise("GLP-1 drugs"), "G L P one drugs")
        self.assertEqual(normalise("up to 2,500 jobs"), "up to two thousand, five hundred jobs")
        self.assertEqual(normalise("a 5km race at 30°C"), "a five kilometres race at thirty degrees Celsius")
        self.assertEqual(normalise("Dr Smith said"), "Doctor Smith said")
        self.assertEqual(normalise("the US and the UN"), "the U S and the U N")
        self.assertEqual(normalise("191 deaths"), "one hundred and ninety-one deaths")
        self.assertEqual(normalise("16.4 years"), "sixteen point four years")
        self.assertEqual(normalise("slipped 0.6%"), "slipped nought point six per cent")
        self.assertEqual(normalise("47.03%"), "forty-seven point oh three per cent")
        self.assertEqual(normalise("from 13 to 18 October"), "from the thirteenth to the eighteenth of October")
        self.assertEqual(normalise("winds of 195km/h"), "winds of one hundred and ninety-five kilometres an hour")
        self.assertEqual(normalise("in A&E"), "in A and E")
        self.assertEqual(normalise("an H3 rocket, the M25 and F1"), "an H three rocket, the M twenty-five and F one")
        self.assertEqual(normalise("raise A$7bn"), "raise seven billion Australian dollars")
        self.assertEqual(normalise("a NT$760.6bn profit"), "a seven hundred and sixty point six billion Taiwan dollars profit")
        self.assertEqual(normalise("C$5 million"), "five million Canadian dollars")
        self.assertEqual(normalise("rise 10p to £1.80"), "rise ten p to one pound eighty")
        self.assertEqual(normalise("was 23.43C, 2.59C above"), "was twenty-three point four three degrees Celsius, two point five nine degrees Celsius above")
        self.assertEqual(normalise("a man in his 20s"), "a man in his twenties")
        self.assertEqual(normalise("since the mid-1990s"), "since the mid-nineteen nineties")
        self.assertEqual(normalise("in the 2000s"), "in the two thousands")
        self.assertEqual(normalise("readings of 140/90"), "readings of one hundred and forty over ninety")
        self.assertEqual(normalise("a Phase 2/3 trial"), "a Phase two-three trial")
        self.assertEqual(normalise("according to ESA/Hubble"), "according to ESA Hubble")
        self.assertEqual(normalise("Strabane, Co Tyrone"), "Strabane, County Tyrone")


if __name__ == "__main__":
    unittest.main()
