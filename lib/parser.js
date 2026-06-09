/**
 * Natural-language parser for Split Agent.
 * Extracts participants and amounts from sentences in English or Portuguese, e.g.:
 *   "We were 4 at the restaurant, John paid 100, Mary paid 60, Pete paid 40, Ann paid nothing"
 *   "Fomos 4 ao restaurante, João pagou 100, Maria pagou 60, Pedro pagou 40, Ana não pagou nada"
 */

/**
 * Parse a natural-language sentence into a list of participants.
 * @param {string} text Sentence describing the expenses.
 * @returns {{ description: string, participants: { name: string, paid: number }[] }}
 */
export function parseNaturalLanguage(text) {
  if (!text || typeof text !== "string") {
    throw new Error("parser: invalid text.");
  }

  const participants = [];
  const seen = new Set();

  // 1. "Name paid 100" / "Name pagou R$ 100,50" / "Name paid $100".
  //    \p{Lu}\p{L}* covers accented names (João, Ann...).
  const paidRegex =
    /([\p{Lu}][\p{L}]+)\s+(?:paid|pagou)\s+(?:r\$|us\$|\$)?\s*(\d+(?:[.,]\d+)?)/giu;
  let m;
  while ((m = paidRegex.exec(text)) !== null) {
    const name = m[1];
    const paid = parseFloat(m[2].replace(",", "."));
    if (!seen.has(name.toLowerCase())) {
      participants.push({ name, paid });
      seen.add(name.toLowerCase());
    }
  }

  // 2. "Name paid nothing" / "Name didn't pay" / "Name não pagou nada".
  const nothingRegex =
    /([\p{Lu}][\p{L}]+)\s+(?:paid\s+nothing|did\s*n'?t\s+pay(?:\s+anything)?|did\s+not\s+pay(?:\s+anything)?|não\s+pagou(?:\s+nada)?)/giu;
  while ((m = nothingRegex.exec(text)) !== null) {
    const name = m[1];
    if (!seen.has(name.toLowerCase())) {
      participants.push({ name, paid: 0 });
      seen.add(name.toLowerCase());
    }
  }

  if (participants.length === 0) {
    throw new Error(
      "parser: could not identify participants. Use a format like 'Name paid X'."
    );
  }

  // Description: try to capture the context before the first comma.
  let description = text.split(",")[0].trim();
  if (description.length > 80) description = "Bill split";

  return { description, participants };
}
