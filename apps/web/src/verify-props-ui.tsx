import { renderToStaticMarkup } from "react-dom/server";
import { PropsSection, getPropEditorDraft } from "./App";

function expectDeepEqual(actual: unknown, expected: unknown) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}.`);
  }
}

function expectMatch(value: string, pattern: RegExp) {
  if (!pattern.test(value)) {
    throw new Error(`Expected markup to match ${pattern}, but it did not.`);
  }
}

const sampleProp = {
  id: "prop-1",
  name: "Sun Wheel",
  type: "known_character" as const,
  shapeRef: "你",
  meaningOrImage: "you",
  notes: null,
  isActive: 1,
  createdAt: "2026-06-12T12:00:00.000Z",
  updatedAt: "2026-06-12T12:00:00.000Z"
};

const emptyDraft = getPropEditorDraft(null);
expectDeepEqual(emptyDraft, {
  name: "",
  type: "component",
  shapeRef: "",
  isActive: true
});

const selectedDraft = getPropEditorDraft(sampleProp);
expectDeepEqual(selectedDraft, {
  name: "Sun Wheel",
  type: "known_character",
  shapeRef: "你",
  isActive: true
});

const markup = renderToStaticMarkup(
  <PropsSection
    editingPropId={null}
    feedback="Ready"
    loading={false}
    onSave={() => undefined}
    propsList={[sampleProp]}
  />
);

expectMatch(markup, /Manage mnemonic props/);
expectMatch(markup, /Edit Prop/);
expectMatch(markup, /Create a new prop/);

console.log("Props UI verification passed.");
