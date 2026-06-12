export const defaultSourceName = "cc_cedict_generated_v2";
export const previewLimit = 200;
export const omissionReasons = [
  "non_hanzi_headword",
  "non_standard_pinyin",
  "invalid_format",
  "missing_meaning"
];

const strictPinyinTokenPattern = /^[A-Za-z\u00fc\u00dcv:]+[1-5]$/u;
const leadingRegisterPattern = /^\((literary|dialect|archaic|old|classical|tw)\)\s*/i;

export function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function countCodePoints(value) {
  return Array.from(value).length;
}

export function isHanziOnlyText(value) {
  return /^[\p{Unified_Ideograph}]+$/u.test(value);
}

export function normalizeStrictNumberedPinyin(rawPinyin) {
  const tokens = rawPinyin
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  const normalizedTokens = [];

  for (const token of tokens) {
    if (!strictPinyinTokenPattern.test(token)) {
      return null;
    }

    normalizedTokens.push(token.trim().toLowerCase().replace(/u:/g, "\u00fc").replace(/v/g, "\u00fc"));
  }

  return normalizedTokens.join(" ");
}

function getMeaningPenaltyTags(definition) {
  const tags = [];
  const normalizedDefinition = definition.trim().toLowerCase();

  if (/^cl:/i.test(definition)) {
    tags.push("classifier_only");
  }

  if (
    normalizedDefinition.startsWith("variant of ") ||
    normalizedDefinition.startsWith("old variant of ") ||
    normalizedDefinition.startsWith("same as ") ||
    normalizedDefinition.startsWith("see also ") ||
    normalizedDefinition.startsWith("see ") ||
    normalizedDefinition.startsWith("used in ")
  ) {
    tags.push("redirect");
  }

  if (/^taiwan pr\./i.test(definition)) {
    tags.push("pronunciation_note");
  }

  if (/^(\(note:.*\)|note:)/i.test(definition)) {
    tags.push("editorial_note");
  }

  if (leadingRegisterPattern.test(definition)) {
    tags.push("register_limited");
  }

  if (normalizedDefinition.startsWith("surname ")) {
    tags.push("surname_only");
  }

  return tags.sort(compareStrings);
}

function getPenaltyWeight(tags) {
  let total = 0;

  for (const tag of tags) {
    switch (tag) {
      case "redirect":
        total += 40;
        break;
      case "pronunciation_note":
        total += 35;
        break;
      case "editorial_note":
        total += 30;
        break;
      case "classifier_only":
        total += 25;
        break;
      case "surname_only":
        total += 20;
        break;
      case "register_limited":
        total += 10;
        break;
      default:
        total += 0;
    }
  }

  return total;
}

function joinTags(tags) {
  return tags.join(",");
}

export function chooseMeaning(definitions) {
  const candidates = definitions
    .map((definition) => definition.trim())
    .filter((definition) => definition.length > 0);

  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .map((definition, index) => {
      const penaltyTags = getMeaningPenaltyTags(definition);
      return {
        definition,
        index,
        penaltyTags,
        penaltyScore: getPenaltyWeight(penaltyTags)
      };
    })
    .sort((left, right) => (
      left.penaltyScore - right.penaltyScore ||
      left.penaltyTags.length - right.penaltyTags.length ||
      compareStrings(joinTags(left.penaltyTags), joinTags(right.penaltyTags)) ||
      left.index - right.index ||
      compareStrings(left.definition, right.definition)
    ));

  return {
    meaningPrimary: ranked[0].definition,
    penaltyTags: ranked[0].penaltyTags
  };
}

export function parseCedictLine(line, lineNumber) {
  const trimmed = line.trim();

  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const match = trimmed.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/u);

  if (!match) {
    return {
      kind: "omitted",
      reason: "invalid_format",
      lineNumber,
      line: trimmed
    };
  }

  const [, traditional, simplified, rawPinyin, rawDefinitions] = match;

  if (!isHanziOnlyText(simplified)) {
    return {
      kind: "omitted",
      reason: "non_hanzi_headword",
      lineNumber,
      text: simplified,
      rawPinyin
    };
  }

  const pinyinDisplay = normalizeStrictNumberedPinyin(rawPinyin);

  if (pinyinDisplay === null) {
    return {
      kind: "omitted",
      reason: "non_standard_pinyin",
      lineNumber,
      text: simplified,
      rawPinyin
    };
  }

  const definitions = rawDefinitions
    .split("/")
    .map((definition) => definition.trim())
    .filter((definition) => definition.length > 0);
  const meaning = chooseMeaning(definitions);

  if (meaning === null) {
    return {
      kind: "omitted",
      reason: "missing_meaning",
      lineNumber,
      text: simplified,
      rawPinyin
    };
  }

  return {
    kind: "candidate",
    traditional,
    simplified,
    rawPinyin,
    pinyinDisplay,
    meaningPrimary: meaning.meaningPrimary,
    meaningPenaltyTags: meaning.penaltyTags,
    meaningPenaltyScore: getPenaltyWeight(meaning.penaltyTags),
    definitions,
    lineNumber
  };
}

export function choosePrimaryCandidate(candidates) {
  return [...candidates].sort((left, right) => (
    left.meaningPenaltyScore - right.meaningPenaltyScore ||
    left.meaningPenaltyTags.length - right.meaningPenaltyTags.length ||
    compareStrings(joinTags(left.meaningPenaltyTags), joinTags(right.meaningPenaltyTags)) ||
    compareStrings(left.pinyinDisplay, right.pinyinDisplay) ||
    compareStrings(left.meaningPrimary, right.meaningPrimary) ||
    left.lineNumber - right.lineNumber
  ))[0];
}

export function sortDictionaryEntries(entries) {
  return [...entries].sort((left, right) => compareStrings(left.text, right.text));
}

export function buildPreview(items, sortKey, limit = previewLimit) {
  const sorted = [...items].sort(sortKey);
  return {
    totalCount: sorted.length,
    truncated: sorted.length > limit,
    items: sorted.slice(0, limit)
  };
}

export function buildSuspiciousGroups(groups, kind) {
  const suspicious = [];

  for (const [text, candidates] of groups.entries()) {
    const uniqueKeys = new Set(
      candidates.map((candidate) => `${candidate.pinyinDisplay}::${candidate.meaningPrimary}`)
    );

    if (uniqueKeys.size <= 1) {
      continue;
    }

    const selected = choosePrimaryCandidate(candidates);
    const alternates = [...candidates]
      .filter((candidate) => candidate !== selected)
      .sort((left, right) => (
        left.meaningPenaltyScore - right.meaningPenaltyScore ||
        compareStrings(left.pinyinDisplay, right.pinyinDisplay) ||
        compareStrings(left.meaningPrimary, right.meaningPrimary) ||
        left.lineNumber - right.lineNumber
      ))
      .map((candidate) => ({
        pinyinDisplay: candidate.pinyinDisplay,
        meaningPrimary: candidate.meaningPrimary,
        penaltyTags: candidate.meaningPenaltyTags,
        lineNumber: candidate.lineNumber
      }));

    suspicious.push({
      kind,
      text,
      selected: {
        pinyinDisplay: selected.pinyinDisplay,
        meaningPrimary: selected.meaningPrimary,
        penaltyTags: selected.meaningPenaltyTags,
        lineNumber: selected.lineNumber
      },
      alternates
    });
  }

  suspicious.sort((left, right) => (
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.text, right.text)
  ));

  return suspicious;
}

export function createOmittedCounts(entries) {
  const counts = Object.fromEntries(omissionReasons.map((reason) => [reason, 0]));

  for (const entry of entries) {
    counts[entry.reason] += 1;
  }

  return counts;
}
