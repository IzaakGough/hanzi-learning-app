import { renderToStaticMarkup } from "react-dom/server";
import {
  ItemSource,
  ItemStatus,
  QueueItemType,
  type QueueListResponse
} from "@hanzi-learning-app/shared";
import { QueueHubSection } from "./App";

function expectMatch(value: string, pattern: RegExp) {
  if (!pattern.test(value)) {
    throw new Error(`Expected markup to match ${pattern}, but it did not.`);
  }
}

const queue: QueueListResponse = {
  counts: [
    { type: QueueItemType.DecompositionCandidate, count: 1 },
    { type: QueueItemType.UnresolvedProp, count: 1 },
    { type: QueueItemType.SentenceCandidate, count: 0 },
    { type: QueueItemType.AudioFailure, count: 0 },
    { type: QueueItemType.MissingLexicalData, count: 1 }
  ],
  items: [
    {
      id: "queue-decomp-1",
      dedupeKey: "decomposition_candidate:candidate-1",
      type: QueueItemType.DecompositionCandidate,
      state: "open",
      title: "学 decomposition candidate",
      description: "冖 + 子",
      createdAt: "2026-06-11T08:00:00.000Z",
      updatedAt: "2026-06-11T08:00:00.000Z",
      availableActions: [
        { action: "approve_decomposition_candidate", label: "Approve candidate" }
      ],
      character: {
        id: "char-1",
        hanzi: "学",
        pinyinDisplay: "xue2",
        meaningPrimary: "study",
        status: ItemStatus.Blocked,
        blockedReason: "missing_approved_decomposition"
      },
      candidate: {
        id: "candidate-1",
        characterId: "char-1",
        status: "candidate",
        source: ItemSource.Derived,
        sourceRef: "fixture",
        notes: null,
        createdAt: "2026-06-11T08:00:00.000Z",
        updatedAt: "2026-06-11T08:00:00.000Z",
        parts: [
          {
            id: "part-1",
            sortOrder: 0,
            resolutionKind: "literal",
            text: "冖",
            propId: null,
            characterId: null
          }
        ]
      },
      linkedWords: [
        {
          id: "word-1",
          simplified: "学习",
          pinyinDisplay: "xue2 xi2",
          meaningPrimary: "study",
          status: ItemStatus.Blocked
        }
      ]
    },
    {
      id: "queue-prop-1",
      dedupeKey: "unresolved_prop:part-2",
      type: QueueItemType.UnresolvedProp,
      state: "open",
      title: "习 unresolved prop",
      description: "Resolve 羽 before approval",
      createdAt: "2026-06-11T08:00:00.000Z",
      updatedAt: "2026-06-11T08:00:00.000Z",
      availableActions: [
        { action: "resolve_unresolved_prop", label: "Resolve prop" }
      ],
      part: {
        partId: "part-2",
        candidateId: "candidate-2",
        characterId: "char-2",
        characterHanzi: "习",
        literalText: "羽",
        existingPropOptions: [
          {
            id: "prop-1",
            name: "Feather",
            type: "component",
            shapeRef: "羽",
            meaningOrImage: "feather",
            isActive: 1
          }
        ],
        blockedDependencies: [
          {
            id: "char-2",
            text: "习",
            kind: "character",
            status: ItemStatus.Blocked
          }
        ]
      }
    },
    {
      id: "queue-lex-1",
      dedupeKey: "missing_lexical_data:word:word-3",
      type: QueueItemType.MissingLexicalData,
      state: "open",
      title: "问好",
      description: "Missing pinyin, primary meaning",
      createdAt: "2026-06-11T08:00:00.000Z",
      updatedAt: "2026-06-11T08:00:00.000Z",
      availableActions: [
        { action: "edit_missing_lexical_data", label: "Edit lexical data" }
      ],
      target: {
        id: "word-3",
        text: "问好",
        kind: "word"
      },
      blockedReason: "missing_pinyin",
      missingFields: ["pinyin", "primary meaning"]
    }
  ]
};

const decompositionMarkup = renderToStaticMarkup(
  <QueueHubSection
    actionItemId={null}
    activeType={QueueItemType.DecompositionCandidate}
    feedback="Ready"
    onApproveCandidate={() => undefined}
    onCreateLiteralProp={() => undefined}
    onResolveWithSuggestion={() => undefined}
    onSelectType={() => undefined}
    queue={queue}
  />
);

expectMatch(decompositionMarkup, /Shared content moderation and cleanup/);
expectMatch(decompositionMarkup, /Decomposition/);
expectMatch(decompositionMarkup, /Approve Candidate/);
expectMatch(decompositionMarkup, /学习/);

const unresolvedMarkup = renderToStaticMarkup(
  <QueueHubSection
    actionItemId={null}
    activeType={QueueItemType.UnresolvedProp}
    feedback="Ready"
    onApproveCandidate={() => undefined}
    onCreateLiteralProp={() => undefined}
    onResolveWithSuggestion={() => undefined}
    onSelectType={() => undefined}
    queue={queue}
  />
);

expectMatch(unresolvedMarkup, /Unresolved Props/);
expectMatch(unresolvedMarkup, /Match Feather/);
expectMatch(unresolvedMarkup, /Create Prop/);

console.log("Ticket 015 queue UI verification passed.");
