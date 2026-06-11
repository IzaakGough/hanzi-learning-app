import { renderToStaticMarkup } from "react-dom/server";
import {
  AudioStatus,
  ItemSource,
  ItemStatus,
  ReviewGrade,
  SchedulerType,
  SentenceApprovalStatus,
  type CharacterDetailRecord,
  type DueCharacterReviewItem,
  type DueWordReviewItem,
  type WordDetailRecord
} from "@hanzi-learning-app/shared";
import { CharacterReviewSection, WordReviewSection } from "./App";

const now = new Date("2026-06-11T08:00:00.000Z").toISOString();

function expectMatch(value: string, pattern: RegExp) {
  if (!pattern.test(value)) {
    throw new Error(`Expected markup to match ${pattern}, but it did not.`);
  }
}

const characterItem: DueCharacterReviewItem = {
  id: "character-1",
  hanzi: "你",
  pinyinDisplay: "ni3",
  meaningPrimary: "you",
  learnedAt: now,
  reviewState: {
    id: "character-review-state-1",
    characterId: "character-1",
    schedulerType: SchedulerType.Fsrs,
    dueAt: now,
    stability: null,
    difficulty: null,
    lastReviewedAt: null,
    reviewCount: 0,
    lapseCount: 0,
    createdAt: now,
    updatedAt: now
  }
};

const characterDetail: CharacterDetailRecord = {
  id: "character-1",
  hanzi: "你",
  pinyinDisplay: "ni3",
  pinyinSource: ItemSource.Manual,
  pinyinSourceRef: "verify",
  pinyinInitial: "n",
  pinyinFinal: "i",
  tone: "3",
  meaningPrimary: "you",
  meaningSource: ItemSource.Manual,
  meaningSourceRef: "verify",
  meaningsOtherJson: null,
  status: ItemStatus.Learned,
  blockedReason: null,
  learnedAt: now,
  archivedAt: null,
  source: ItemSource.Manual,
  sourceRef: "verify",
  levelId: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
  approvedDecomposition: {
    id: "approved-1",
    characterId: "character-1",
    status: "approved",
    source: ItemSource.Manual,
    sourceRef: "verify",
    notes: null,
    createdAt: now,
    updatedAt: now,
    parts: [
      {
        id: "part-1",
        sortOrder: 0,
        resolutionKind: "prop",
        text: "亻",
        propId: "prop-1",
        characterId: null
      },
      {
        id: "part-2",
        sortOrder: 1,
        resolutionKind: "character",
        text: "尔",
        propId: null,
        characterId: "character-2"
      }
    ]
  },
  linkedWords: [
    {
      id: "word-1",
      simplified: "你好",
      pinyinDisplay: "ni3 hao3",
      meaningPrimary: "hello",
      status: ItemStatus.Learned
    }
  ]
};

const wordItem: DueWordReviewItem = {
  id: "word-2",
  simplified: "中国",
  pinyinDisplay: "zhong1 guo2",
  meaningPrimary: "China",
  learnedAt: now,
  reviewState: {
    id: "word-review-state-1",
    wordId: "word-2",
    schedulerType: SchedulerType.Fsrs,
    dueAt: now,
    stability: 2.5,
    difficulty: 5.2,
    lastReviewedAt: now,
    reviewCount: 1,
    lapseCount: 0,
    createdAt: now,
    updatedAt: now
  }
};

const wordDetail: WordDetailRecord = {
  id: "word-2",
  simplified: "中国",
  pinyinDisplay: "zhong1 guo2",
  pinyinSource: ItemSource.Manual,
  pinyinSourceRef: "verify",
  meaningPrimary: "China",
  meaningSource: ItemSource.Manual,
  meaningSourceRef: "verify",
  meaningsOtherJson: null,
  status: ItemStatus.Learned,
  blockedReason: null,
  learnedAt: now,
  archivedAt: null,
  source: ItemSource.Manual,
  sourceRef: "verify",
  levelId: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
  componentCharacters: [
    {
      id: "character-3",
      hanzi: "中",
      pinyinDisplay: "zhong1",
      meaningPrimary: "middle",
      status: ItemStatus.Learned
    },
    {
      id: "character-4",
      hanzi: "国",
      pinyinDisplay: "guo2",
      meaningPrimary: "country",
      status: ItemStatus.Learned
    }
  ],
  approvedSentences: [
    {
      id: "sentence-1",
      text: "ä¸­å›½å¾ˆå¤§ã€‚",
      translation: "China is big.",
      pinyinFull: "zhong1 guo2 hen3 da4.",
      approvalStatus: SentenceApprovalStatus.Approved,
      audioStatus: AudioStatus.None,
      audioPath: null,
      generationSource: ItemSource.Manual,
      notes: null,
      createdAt: now,
      updatedAt: now,
      linkedWords: [
        {
          id: "word-2",
          simplified: "ä¸­å›½",
          pinyinDisplay: "zhong1 guo2",
          meaningPrimary: "China",
          status: ItemStatus.Learned
        }
      ],
      analysisSpans: [],
      displaySpans: [
        {
          id: "span-1",
          sentenceId: "sentence-1",
          sortOrder: 0,
          text: "ä¸­å›½",
          spanType: "known_word",
          linkedWordId: "word-2",
          linkedCharacterId: null,
          glossText: "China",
          pinyinText: "zhong1 guo2",
          knowledgeState: "known",
          showGloss: false,
          showPinyin: false,
          createdAt: now,
          updatedAt: now
        },
        {
          id: "span-2",
          sentenceId: "sentence-1",
          sortOrder: 1,
          text: "å¾ˆå¤§",
          spanType: "punctuation",
          linkedWordId: null,
          linkedCharacterId: null,
          glossText: null,
          pinyinText: null,
          knowledgeState: "neutral",
          showGloss: false,
          showPinyin: false,
          createdAt: now,
          updatedAt: now
        }
      ]
    }
  ]
};

const characterMarkup = renderToStaticMarkup(
  <CharacterReviewSection
    detail={characterDetail}
    detailLoading={false}
    dueCount={2}
    feedback="Stored answer data revealed."
    gradeSubmitting={false}
    item={characterItem}
    onGrade={(_grade: ReviewGrade) => undefined}
    onReveal={() => undefined}
    revealDisabled={true}
    reviewedCount={1}
    totalCount={2}
  />
);

expectMatch(characterMarkup, /Character Review/);
expectMatch(characterMarkup, />你</);
expectMatch(characterMarkup, /Approved decomposition/);
expectMatch(characterMarkup, /亻 \+ 尔/);
expectMatch(characterMarkup, /Again/);
expectMatch(characterMarkup, /Easy/);

const wordMarkup = renderToStaticMarkup(
  <WordReviewSection
    detail={wordDetail}
    detailLoading={false}
    dueCount={1}
    feedback="Stored answer data revealed."
    gradeSubmitting={false}
    item={wordItem}
    onAddManualSentence={async () => true}
    onGrade={(_grade: ReviewGrade) => undefined}
    onReveal={() => undefined}
    revealDisabled={true}
    reviewedCount={0}
    sentenceSubmitting={false}
    totalCount={1}
  />
);

expectMatch(wordMarkup, /Word Review/);
expectMatch(wordMarkup, />中国</);
expectMatch(wordMarkup, /Component characters/);
expectMatch(wordMarkup, /Sentence bank/);
expectMatch(wordMarkup, /Audio unavailable/);
expectMatch(wordMarkup, /Add manual sentence/);
expectMatch(wordMarkup, /middle/);
expectMatch(wordMarkup, /country/);
expectMatch(wordMarkup, /Good/);

console.log("Ticket 012 review UI verification passed.");
