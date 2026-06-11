import { renderToStaticMarkup } from "react-dom/server";
import { ItemStatus, type DashboardSummaryResponse } from "@hanzi-learning-app/shared";
import { DashboardOverviewSection, LearningSection } from "./App";

function expectMatch(value: string, pattern: RegExp) {
  if (!pattern.test(value)) {
    throw new Error(`Expected markup to match ${pattern}, but it did not.`);
  }
}

const now = new Date("2026-06-11T08:00:00.000Z").toISOString();

const dashboard: DashboardSummaryResponse = {
  dueReview: {
    characterCount: 2,
    wordCount: 1,
    totalCount: 3
  },
  learningProgress: {
    level: {
      id: "level-21",
      course: "demo",
      sequenceNumber: 21,
      title: "Introductions",
      isComplete: false,
      nextCharacterId: "character-1",
      characters: [
        {
          id: "character-1",
          hanzi: "学",
          pinyinDisplay: "xue2",
          pinyinInitial: "x",
          pinyinFinal: "ue",
          tone: "2",
          meaningPrimary: "study",
          status: ItemStatus.Ready,
          learnedAt: null,
          isLearnable: true,
          blockedReasons: [],
          hasApprovedDecomposition: true
        }
      ],
      words: [
        {
          id: "word-1",
          simplified: "学生",
          pinyinDisplay: "xue2 sheng1",
          meaningPrimary: "student",
          status: ItemStatus.Ready,
          learnedAt: null,
          isLearnable: true,
          blockedReasons: [],
          componentCharacters: []
        },
        {
          id: "word-2",
          simplified: "学习",
          pinyinDisplay: "xue2 xi2",
          meaningPrimary: "study",
          status: ItemStatus.Blocked,
          learnedAt: null,
          isLearnable: false,
          blockedReasons: ["component_characters_unlearned"],
          componentCharacters: []
        }
      ]
    },
    courseComplete: false,
    learnedCharacterCount: 2,
    learnedWordCount: 1,
    totalLevelCount: 3
  },
  contentQueue: {
    hasWork: true,
    charactersNeedingApprovalCount: 2,
    unresolvedPropCount: 3
  }
};

const dashboardMarkup = renderToStaticMarkup(
  <DashboardOverviewSection
    dashboard={dashboard}
    onOpenLearning={() => undefined}
    onOpenQueue={() => undefined}
    onOpenReview={() => undefined}
  />
);

expectMatch(dashboardMarkup, /Due review is ready first/);
expectMatch(dashboardMarkup, /Start Review/);
expectMatch(dashboardMarkup, /Continue Learning/);
expectMatch(dashboardMarkup, /Queue Work/);
expectMatch(dashboardMarkup, /Unlocked words waiting/);
expectMatch(dashboardMarkup, /Characters needing approval/);

const learningMarkup = renderToStaticMarkup(
  <LearningSection
    feedback={`Saved at ${now}`}
    onMarkCharacterLearned={() => undefined}
    onMarkWordLearned={() => undefined}
    progress={dashboard.learningProgress}
    submittingItemId={null}
  />
);

expectMatch(learningMarkup, /Current level progression/);
expectMatch(learningMarkup, />学</);
expectMatch(learningMarkup, /Words ready now/);
expectMatch(learningMarkup, /学生/);
expectMatch(learningMarkup, /Mark Character Learned/);
expectMatch(learningMarkup, /Mark Word Learned/);

console.log("Ticket 013 dashboard UI verification passed.");
