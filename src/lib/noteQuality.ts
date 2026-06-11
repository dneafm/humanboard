const COMMON_SHORT_WORDS = new Set([
  'a','an','and','are','as','at','be','but','by','do','for','from','go','hello','help','how','i','if','in','is','it','me','my','of','ok','on','or','so','test','that','the','this','to','up','we','what','why','yes','you'
]);

function tokenizeLetters(text: string) {
  return (text.toLowerCase().match(/[a-z]+/g) || []).filter(Boolean);
}

export function looksLikeLowSignalNoise(raw: string) {
  const text = raw.trim();
  if (!text) return true;

  const compact = text.replace(/\s+/g, '');
  const lower = compact.toLowerCase();
  const alphaOnly = lower.replace(/[^a-z]/g, '');
  const tokens = tokenizeLetters(text);
  const uniqueChars = new Set(alphaOnly).size;
  const vowelCount = (alphaOnly.match(/[aeiou]/g) || []).length;
  const symbolCount = (compact.match(/[^a-zA-Z0-9]/g) || []).length;
  const repeatedRun = /(.)\1{5,}/.test(lower);
  const keyboardMashPattern = /(asdf|qwer|zxcv|hjkl|jkl;|poiuy|lkjhg|mnbv|qaz|wsx|edc|rfv|tgb|yhn|ujm)/.test(lower);
  const alternatingSmashPattern = /^([a-z])\1?([a-z])\2?([a-z])\3?([a-z]){0,}$/i.test(alphaOnly) && alphaOnly.length >= 8;
  const hasLongWord = tokens.some((token) => token.length >= 4);
  const recognizableWords = tokens.filter((token) => COMMON_SHORT_WORDS.has(token) || token.length >= 4).length;
  const symbolRatio = compact.length ? symbolCount / compact.length : 0;
  const vowelRatio = alphaOnly.length ? vowelCount / alphaOnly.length : 0;

  if (compact.length <= 2) return true;
  if (repeatedRun) return true;
  if (keyboardMashPattern && !hasLongWord) return true;
  if (alternatingSmashPattern && !hasLongWord) return true;
  if (alphaOnly.length >= 8 && uniqueChars <= 3 && !hasLongWord) return true;
  if (alphaOnly.length >= 7 && vowelRatio < 0.15 && !hasLongWord) return true;
  if (compact.length >= 8 && symbolRatio > 0.45) return true;
  if (tokens.length > 0 && recognizableWords === 0 && alphaOnly.length >= 6) return true;

  return false;
}

export function shouldTreatAsMeaningfulNote(raw: string) {
  return !looksLikeLowSignalNoise(raw);
}
