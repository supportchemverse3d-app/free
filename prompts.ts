import type { Lang, Mode } from './protocol.ts';

export interface Quick {
  id: string;
  label: string;
  mode: Mode;
  /** The message sent as the student's turn, written in the selected language. */
  text: string;
}

type L3 = Record<Lang, string>;
const q = (id: string, label: string, mode: Mode, text: L3, lang: Lang): Quick => ({ id, label, mode, text: text[lang] });

export const moleculeQuick = (lang: Lang, hasSelection: boolean): Quick[] => {
  const list: Quick[] = [];
  if (hasSelection) {
    list.push(q('selected', 'Selected atom or bond', 'chat', { english: 'Explain the selected atom or bond in detail.', hindi: 'चुने हुए परमाणु या आबंध को विस्तार से समझाइए।', hinglish: 'Chune hue atom ya bond ko detail me samjhaiye.' }, lang));
  }
  list.push(
    q('geometry', 'Geometry', 'chat', { english: 'Why does this molecule have this geometry?', hindi: 'इस अणु की ज्यामिति ऐसी क्यों है?', hinglish: 'Is molecule ki geometry aisi kyon hai?' }, lang),
    q('angles', 'Bond angles', 'chat', { english: 'Explain its bond angles.', hindi: 'इसके आबंध कोण समझाइए।', hinglish: 'Iske bond angles samjhaiye.' }, lang),
    q('hybrid', 'Hybridization', 'chat', { english: 'Identify the hybridization of its central atoms and explain it.', hindi: 'इसके केंद्रीय परमाणुओं का संकरण बताइए और समझाइए।', hinglish: 'Iske central atoms ka hybridization batakar samjhaiye.' }, lang),
    q('lone', 'Lone pairs', 'chat', { english: 'Explain its lone pairs.', hindi: 'इसके एकाकी इलेक्ट्रॉन युग्म समझाइए।', hinglish: 'Iske lone pairs samjhaiye.' }, lang),
    q('polar', 'Polarity', 'chat', { english: 'Why are its bonds polar or non-polar, and is the molecule polar?', hindi: 'इसके आबंध ध्रुवीय क्यों हैं या नहीं, और क्या अणु ध्रुवीय है?', hinglish: 'Iske bonds polar kyon hain ya nahi, aur kya molecule polar hai?' }, lang),
    q('atoms', 'Atom by atom', 'chat', { english: 'Explain the molecular structure atom by atom.', hindi: 'इस अणु की संरचना परमाणु-दर-परमाणु समझाइए।', hinglish: 'Is molecule ki structure atom-by-atom samjhaiye.' }, lang),
  );
  return list;
};

export const LANG_LABEL: Record<Lang, string> = { english: 'English', hindi: 'हिन्दी', hinglish: 'Hinglish' };
