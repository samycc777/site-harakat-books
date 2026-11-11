"""Website only (not the PDFs): write years in words with full harakat, the printed digits after them
in round brackets: «مِنْ عَامِ ١٤٢٧» → «مِنْ عَامِ أَلْفٍ وَأَرْبَعِمِائَةٍ وَسَبْعَةٍ وَعِشْرِينَ (١٤٢٧)».
A number is a year when it carries هـ / م, or follows سَنَة / عَام (any prefix), a month name, or «ت»
(died); a number joined by a dash to such a year is one too. Dates with slashes (٥/ ٥/ ١٤١٦هـ) stay as
printed. The year is always genitive (the second part of «سَنَةِ …»); after «عَام» the units are
masculine (سَبْعَةٍ), otherwise feminine like سَنَة (سَبْعٍ). Order: thousands, hundreds, units, tens."""
import re

U_M = ['', 'وَاحِدٍ', 'اثْنَيْنِ', 'ثَلَاثَةٍ', 'أَرْبَعَةٍ', 'خَمْسَةٍ', 'سِتَّةٍ', 'سَبْعَةٍ', 'ثَمَانِيَةٍ', 'تِسْعَةٍ', 'عَشَرَةٍ']
U_F = ['', 'وَاحِدَةٍ', 'اثْنَتَيْنِ', 'ثَلَاثٍ', 'أَرْبَعٍ', 'خَمْسٍ', 'سِتٍّ', 'سَبْعٍ', 'ثَمَانٍ', 'تِسْعٍ', 'عَشْرٍ']
TEEN_M = ['أَحَدَ عَشَرَ', 'اثْنَيْ عَشَرَ', 'ثَلَاثَةَ عَشَرَ', 'أَرْبَعَةَ عَشَرَ', 'خَمْسَةَ عَشَرَ', 'سِتَّةَ عَشَرَ',
          'سَبْعَةَ عَشَرَ', 'ثَمَانِيَةَ عَشَرَ', 'تِسْعَةَ عَشَرَ']
TEEN_F = ['إِحْدَى عَشْرَةَ', 'اثْنَتَيْ عَشْرَةَ', 'ثَلَاثَ عَشْرَةَ', 'أَرْبَعَ عَشْرَةَ', 'خَمْسَ عَشْرَةَ', 'سِتَّ عَشْرَةَ',
          'سَبْعَ عَشْرَةَ', 'ثَمَانِيَ عَشْرَةَ', 'تِسْعَ عَشْرَةَ']
TENS = ['', '', 'عِشْرِينَ', 'ثَلَاثِينَ', 'أَرْبَعِينَ', 'خَمْسِينَ', 'سِتِّينَ', 'سَبْعِينَ', 'ثَمَانِينَ', 'تِسْعِينَ']
HUND = ['', 'مِائَةٍ', 'مِائَتَيْنِ', 'ثَلَاثِمِائَةٍ', 'أَرْبَعِمِائَةٍ', 'خَمْسِمِائَةٍ', 'سِتِّمِائَةٍ', 'سَبْعِمِائَةٍ',
        'ثَمَانِمِائَةٍ', 'تِسْعِمِائَةٍ']
THOU = ['', 'أَلْفٍ', 'أَلْفَيْنِ']


def words(n, fem):
    """Genitive words for 1..2999 (None otherwise)."""
    if not 0 < n < 3000: return None
    u = U_F if fem else U_M
    parts = [THOU[n // 1000], HUND[n // 100 % 10]]
    r = n % 100
    if r <= 10: parts.append(u[r])
    elif r < 20: parts.append((TEEN_F if fem else TEEN_M)[r - 11])
    else:
        one = {1: 'إِحْدَى' if fem else 'وَاحِدٍ'}.get(r % 10, u[r % 10])
        parts += [one, TENS[r // 10]]
    return ' وَ'.join(p for p in parts if p)


DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')
MARKS = re.compile('[ً-ِْ-ٰٟـ‌‍]')  # harakat and tatweel, not shadda (سُنَّة ≠ سَنَة)
LETTER = 'ء-يً-ٰٟ'
NUM = re.compile(rf'(?<![0-9٠-٩/])([0-9٠-٩]{{1,4}})(?![0-9٠-٩])(\s?(?:هـ+|ه‍|ه(?![{LETTER}])|م(?![{LETTER}])))?')
YEAR_M = {'عام'}
YEAR_F = {'سنة', 'سنه'}
MONTHS = {'محرم', 'صفر', 'رجب', 'شعبان', 'رمضان', 'شوال', 'القعدة', 'الحجة', 'يناير', 'فبراير',
          'مارس', 'أبريل', 'إبريل', 'ابريل', 'مايو', 'يونيو', 'يونية', 'يوليو', 'يولية', 'أغسطس', 'سبتمبر', 'أكتوبر',
          'نوفمبر', 'ديسمبر', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول'}
ORDINAL = {'الأول', 'الاول', 'الآخر', 'الاخر', 'الثاني', 'الأولى', 'الاولى', 'الآخرة', 'الاخرة', 'الثانية', 'ثاني',
           'المبارك', 'الحرام'}  # only after MONTH_HEAD
MONTH_HEAD = {'ربيع', 'جمادى', 'جمادي', 'كانون', 'تشرين', 'رمضان', 'محرم', 'المحرم'}
DIED = {'ت', 'المتوفى', 'توفي'}
DATE = re.compile(r'[0-9٠-٩]{1,4}\s*[-/]\s*[0-9٠-٩]{1,2}\s*[-/]\s*[0-9٠-٩]{1,4}')
DASH = re.compile(r'\s*[-–—ـ،,]\s*')  # «١٥٠ ـ ٢٠٤ هـ», «١٩٣٥،١٩٣٧م»


def norm(w):
    return MARKS.sub('', w).strip('()[]«»"“”:.,،؛-–—')


def base(w):
    """سنة / عام without و ف ب ل ال in front."""
    return re.sub(r'^[وفبل]{0,2}(?:ال)?', '', w)


def trigger(before):
    """'m' / 'f' / 'died' if the words before a number make it a year, else None."""
    ws = [norm(w) for w in before.split()[-3:]]
    ws = [w for w in ws if w]
    if not ws or before[-1:] not in (' ', ' ', '(', '[', ':'): return None
    w = ws[-1]
    if len(ws) > 1 and ws[-2] in ('ابن', 'بن'): return None  # ابن رجب is a name
    if w in YEAR_M or base(w) in YEAR_M: return 'm'
    if w in YEAR_F or base(w) in YEAR_F or w in MONTHS or base(w) in MONTHS: return 'f'
    if w in DIED: return 'died'
    if w in ORDINAL and len(ws) > 1 and ws[-2] in MONTH_HEAD: return 'f'
    if w in MONTH_HEAD and w != 'ربيع': return 'f'  # ربيع alone is also a name
    return None


LOG = []  # (printed context, replacement) for checking


def convert_text(t):
    """One text node (no tags)."""
    found = []  # (start, end, n, gender)
    dates = [d.span() for d in DATE.finditer(t)]
    for m in NUM.finditer(t):
        if any(a <= m.start() < b for a, b in dates): continue  # ١٧-٣-١٤٣٢هـ, ٥/ ٥/ ١٤١٦هـ stay as printed
        after = t[m.end():m.end() + 3]
        if re.match(r'\s*/', after) or re.search(r'/\s*$', t[:m.start()]): continue  # part of a date written with slashes
        n = int(m.group(1).translate(DIGITS))
        if not m.group(2) and n < 300 and t[m.start() - 1:m.start()] == '(' and t[m.end():m.end() + 1] == ')':
            continue  # «(٢)»: a footnote marker
        g = trigger(t[:m.start()])
        if m.group(2) and (n >= 10 or g): g = g or 'f'
        if g == 'died':  # «ت ١٦٤٧» in a takhrij is al-Tirmidhi's number, not a death year
            g = 'f' if m.group(2) or n <= 1500 else None
        found.append([m.start(), m.end(), n, g])
    # a number dashed to a year («١٥٠ ـ ٢٠٤ هـ») is a year too
    for i in range(len(found) - 1, 0, -1):
        a, b = found[i - 1], found[i]
        if b[3] and not a[3] and DASH.fullmatch(t[a[1]:b[0]]):
            a[3] = b[3]
    out, pos = [], 0
    for s, e, n, g in found:
        w = g and words(n, g == 'f')
        if not w: continue
        sp = ' ' if re.match('[\u0621-\u064A]', t[s - 1:s]) else ''  # «(ت١٣٢٣هـ)»: keep «ت» apart from the words
        out += [t[pos:s], f'{sp}{w} ({t[s:e]})']
        LOG.append((t[max(0, s - 30):e + 10], f'{w} ({t[s:e]})'))
        pos = e
    out.append(t[pos:])
    return ''.join(out)


def years_to_words(html):
    parts = re.split(r'(<[^>]*>)', html)
    return ''.join(p if p.startswith('<') else convert_text(p) for p in parts)


if __name__ == '__main__':
    for s in ['هَذَا هُوَ قَوْلُ أَهْلِ السُّنَّةِ مِنْ عَامِ ١٤٢٧ فَلَمْ', 'سَنَةَ ١٩٥٤ لِلْقَاهِرَةِ', 'الشَّافِعِيُّ (ت ٢٠٤هـ)، وَ',
              '(ت ٩٨ وَقِيلَ ١٠٨هـ).', 'بِتَارِيخِ ٥/ ٥/ ١٤١٦هـ الْمُوَافِقِ', 'الشَّافِعِيُّ (١٥٠ ـ ٢٠٤ هـ) يُبَالِغُ',
              'الْفِقْرَةِ ١٢٨ مِنَ الْأَصْلِ', 'انْظُرْ ص ١٠٠ مِنْ', '" ١هـ (', 'رَبِيعٍ الْأَوَّلِ لِعَامِ ١٤٣١', 'سَنَةَ ١٤٢١ وَ', 'عَامِ ١٤١١']:
        print(convert_text(s))
