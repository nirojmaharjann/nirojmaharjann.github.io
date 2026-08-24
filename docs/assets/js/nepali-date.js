/* ============================================================
   Bikram Sambat (Nepali calendar) conversion + live AD/BS clock
   Calendar data: BS 2000-2100 month lengths, cross-checked
   against official reference dates (1 Baisakh 2000 BS =
   14 April 1943 AD). Zero dependencies.
   ============================================================ */
(function (root) {
  'use strict';

  var MONTH_LENGTHS = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2029: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2031: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2035: [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2036: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2037: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2038: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2039: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2043: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2050: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2051: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2052: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2056: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2058: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2062: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2082: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2091: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2092: [30, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2093: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2094: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2095: [31, 31, 32, 31, 31, 31, 30, 29, 30, 30, 30, 30],
  2096: [30, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2097: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2098: [31, 31, 32, 31, 31, 31, 29, 30, 29, 30, 30, 31],
  2099: [31, 31, 32, 31, 31, 31, 30, 29, 29, 30, 30, 30],
  2100: [31, 32, 31, 32, 30, 31, 30, 29, 30, 29, 30, 30]
  };

  var FIRST_BS_YEAR = 2000;
  var LAST_BS_YEAR = 2100;

  /* 1 Baisakh 2000 BS == 14 April 1943 AD */
  var EPOCH_AD = Date.UTC(1943, 3, 14);
  var DAY_MS = 86400000;

  var NP_MONTHS = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज',
                   'कात्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत'];
  var ROMAN_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashoj',
                      'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
  var EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var NP_WEEKDAYS = ['आइतबार', 'सोमबार', 'मङ्गलबार', 'बुधबार',
                     'बिहीबार', 'शुक्रबार', 'शनिबार'];

  var NP_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

  function toDevanagari(num) {
    return String(num).replace(/\d/g, function (d) { return NP_DIGITS[+d]; });
  }

  /** Convert an AD Date (UTC-normalised) -> {year, month, day} in BS */
  function adToBs(date) {
    var days = Math.floor((date.getTime() - EPOCH_AD) / DAY_MS);
    if (days < 0) return null;
    var year = FIRST_BS_YEAR;
    while (year <= LAST_BS_YEAR) {
      var months = MONTH_LENGTHS[year];
      var yearLen = 0;
      var i;
      for (i = 0; i < 12; i++) yearLen += months[i];
      if (days < yearLen) break;
      days -= yearLen;
      year++;
    }
    if (year > LAST_BS_YEAR) return null;   // outside supported range
    var month = 0;
    while (days >= MONTH_LENGTHS[year][month]) {
      days -= MONTH_LENGTHS[year][month];
      month++;
    }
    return { year: year, month: month + 1, day: days + 1 };
  }

  /** Days in a given BS month, or null if out of range */
  function daysInBsMonth(bsY, bsM) {
    if (bsY < FIRST_BS_YEAR || bsY > LAST_BS_YEAR ||
        bsM < 1 || bsM > 12) return null;
    return MONTH_LENGTHS[bsY][bsM - 1];
  }

  /** Convert BS y/m/d -> AD Date (UTC midnight), or null if invalid/out of range */
  function bsToAd(bsY, bsM, bsD) {
    var dim = daysInBsMonth(bsY, bsM);
    if (dim === null || bsD < 1 || bsD > dim) return null;
    var total = 0;
    var y, i;
    for (y = FIRST_BS_YEAR; y < bsY; y++) {
      var months = MONTH_LENGTHS[y];
      for (i = 0; i < 12; i++) total += months[i];
    }
    for (i = 0; i < bsM - 1; i++) total += MONTH_LENGTHS[bsY][i];
    total += bsD - 1;
    return new Date(EPOCH_AD + total * DAY_MS);
  }

  /** "भदौ ८, २०८३ BS" style string */
  function formatBs(date, devanagariDigits) {
    var bs = adToBs(date);
    if (!bs) return '';
    var day = devanagariDigits ? toDevanagari(bs.day) : String(bs.day);
    var year = devanagariDigits ? toDevanagari(bs.year) : String(bs.year);
    return NP_MONTHS[bs.month - 1] + ' ' + day + ', ' + year;
  }

  /** "Mon, Aug 24 2026" style string */
  function formatAd(date) {
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
    return wd + ', ' + EN_MONTHS[date.getUTCMonth()] + ' ' +
      date.getUTCDate() + ' ' + date.getUTCFullYear();
  }

  /** Full Nepali weekday + date, e.g. "सोमबार, भदौ ८, २०८३" */
  function formatBsFull(date) {
    var bs = adToBs(date);
    if (!bs) return '';
    return NP_WEEKDAYS[date.getUTCDay()] + ', ' + NP_MONTHS[bs.month - 1] + ' ' +
      toDevanagari(bs.day) + ', ' + toDevanagari(bs.year);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function tick() {
    var now = new Date();
    var utcMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    var adEl = document.getElementById('ad-date');
    var bsEl = document.getElementById('bs-date');
    var timeEl = document.getElementById('np-time');
    if (adEl) adEl.textContent = formatAd(new Date(utcMidnight));
    if (bsEl) bsEl.textContent = formatBsFull(new Date(utcMidnight)) + ' BS';
    if (timeEl) timeEl.textContent = pad(now.getHours()) + ':' +
      pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function startClock() {
    if (!document.getElementById('ad-date')) return;
    tick();
    setInterval(tick, 1000);
  }

  if (typeof document === 'undefined') {
    // Non-browser environment (e.g. Node) — skip DOM clock
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startClock);
  } else {
    startClock();
  }

  var api = {
    adToBs: adToBs,
    bsToAd: bsToAd,
    daysInBsMonth: daysInBsMonth,
    formatBs: formatBs,
    formatAd: formatAd,
    formatBsFull: formatBsFull,
    toDevanagari: toDevanagari,
    MONTH_NAMES: NP_MONTHS,
    ROMAN_MONTHS: ROMAN_MONTHS,
    FIRST_YEAR: FIRST_BS_YEAR,
    LAST_YEAR: LAST_BS_YEAR
  };

  root.NepaliDate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
