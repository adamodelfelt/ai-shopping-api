import { normalize } from './taxonomy.js';

export function cleanSizingText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
export function fitEvidence(text) {
  const sourceText = cleanSizingText(text).slice(0, 4000), value = normalize(sourceText);
  const adjustable = /\b(?:justerbar\w* (?:resar\w*(?: och hallor)?(?: i)? midj\w*|resarmidj\w*|midj\w*)|adjustable (?:elastic )?waist\w*|midj\w* (?:med )?(?:justerbar\w*|dragsko|snorning)|dragsko (?:och resar )?i midjan)\b/.test(value);
  const negated = /\b(?:utan|ingen|inte|ej|no|not|non) (?:en )?(?:justerbar\w*|adjustable)\b/.test(value);
  const slim = /\b(?:slim fit|skinny fit|smal passform|extra smal passform|x-slim)\b/.test(value) && !/\b(?:inte|ej|utan|no|not) (?:en )?(?:smal passform|slim fit|skinny fit)\b/.test(value);
  return { adjustableWaist: adjustable && !negated, slim, sourceText };
}
