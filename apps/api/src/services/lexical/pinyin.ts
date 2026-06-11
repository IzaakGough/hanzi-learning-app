interface CharacterSplit {
  initial: string;
  final: string;
  tone: string;
}

const pinyinInitials = [
  "zh",
  "ch",
  "sh",
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "g",
  "k",
  "h",
  "j",
  "q",
  "x",
  "r",
  "z",
  "c",
  "s",
  "y",
  "w"
] as const;

export function splitNumberedPinyinSyllable(pinyinDisplay: string): CharacterSplit | null {
  const syllables = pinyinDisplay.trim().split(/\s+/);

  if (syllables.length !== 1) {
    return null;
  }

  const [syllable] = syllables;
  const match = syllable.match(/^([A-Za-z\u00FC\u00DCv:]+)([1-5])$/u);

  if (!match) {
    return null;
  }

  const normalizedBody = match[1].toLowerCase().replace(/u:/g, "\u00fc").replace(/v/g, "\u00fc");
  const tone = match[2];
  const initial = pinyinInitials.find((candidate) => normalizedBody.startsWith(candidate)) ?? "null";
  const final = initial === "null" ? normalizedBody : normalizedBody.slice(initial.length);

  if (final.length === 0) {
    return null;
  }

  return { initial, final, tone };
}
