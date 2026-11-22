// TORN - NameFilter. Client-side for the demo; Phase 2 repeats this check on the server.
// Normalises leetspeak (4=A, 3=E, 1=I, 0=O, 5=S, 7=T, @=A, $=S ...), strips spaces/symbols,
// collapses repeated letters, then looks for blocked words.
const LEET = { '4': 'a', '@': 'a', '8': 'b', '(': 'c', '3': 'e', '6': 'g', '9': 'g', '1': 'i', '!': 'i', '|': 'i',
  '0': 'o', '5': 's', '$': 's', '7': 't', '+': 't', '2': 'z', '%': 'x' };
// Long/unambiguous words: blocked anywhere inside the name.
const ANYWHERE = ['fuck', 'fuk', 'fck', 'shit', 'bitch', 'btch', 'cunt', 'dick', 'cock', 'pussy', 'puss1', 'whore',
  'slut', 'bastard', 'nigg', 'niga', 'nigr', 'faggot', 'fagot', 'retard', 'rape', 'rapist', 'molest', 'pedo', 'paedo',
  'nazi', 'hitler', 'kkk', 'chink', 'spic', 'kike', 'wetback', 'tranny', 'dyke', 'penis', 'vagina', 'porn', 'sex',
  'cum', 'jizz', 'anal', 'anus', 'boob', 'tits', 'titty', 'nude', 'naked', 'horny', 'orgasm', 'dildo', 'wank',
  'twat', 'prick', 'asshole', 'arsehole', 'motherf', 'killyourself', 'kys', 'suicide', 'isis', 'terrorist', 'coon',
  'gook', 'beaner', 'raghead', 'towelhead', 'negro', 'incest', 'grope', 'pimp', 'hooker', 'stripper', 'sexy'];
// Short words that hide inside innocent names (CLASS, BASS): blocked only as the whole name or at its start/end.
const EDGE = ['ass', 'fag', 'hoe', 'ho', 'jap', 'gay', 'homo', 'nig', 'tit', 'poo', 'pee', 'cuck', 'thot', 'hump'];
const ALLOW = ['class', 'bass', 'pass', 'glass', 'grass', 'brass', 'mass', 'assassin', 'hello', 'shoe', 'cocktail', 'scunthorpe', 'title', 'petition'];

export function normalise(s) {
  let t = String(s).toLowerCase();
  t = t.split('').map(c => LEET[c] || c).join('');
  t = t.replace(/[^a-z]/g, '');
  return t;
}
function collapse(t) { return t.replace(/(.)\1+/g, '$1'); }

export function isNameAllowed(name) {
  const raw = normalise(name);
  if (!raw.length) return false;
  for (const form of [raw, collapse(raw)]) {
    if (ALLOW.includes(form)) continue;
    for (const w of ANYWHERE) if (form.includes(w)) return false;
    for (const w of EDGE) if (form === w || (form.startsWith(w) && form.length <= w.length + 3) || (form.endsWith(w) && form.length <= w.length + 3)) {
      if (!ALLOW.some(a => form.includes(a))) return false;
    }
  }
  return true;
}
export function randomSubjectName() { return 'SUBJECT' + Math.floor(1000 + Math.random() * 9000); }
export function cleanTyped(s, max) { return String(s).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, max); }
