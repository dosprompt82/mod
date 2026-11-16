import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocReviewResult, type ResultActions } from "../components/Results";
import type { Analysis } from "../lib/types";
import { mockFetch, renderApp } from "./utils";

const analysis: Analysis = {
  id: "an1", workspace_id: "w1", workflow: "doc_review", title: "Review: West Lake Bond memo", summary: "", markdown: "", structured: true,
  provider: "anthropic", parent_analysis_id: null, approved: false, created_at: "", sources: [],
  content: {
    title: "Review", document_name: "West Lake Bond Memo Draft.docx", document_description: "West Lake Bond memo (draft 11/15/2026, 24 pages)",
    scope_note: "The file has no Word comments or tracked changes, and the Bond Terms weren't provided, so this review is of the memo alone.",
    score: 6.5, score_reasons: ["The Listing Failure Step-Up is analyzed under the wrong model.", "The issue price is never stated."],
    presentation_notes: ["The same four-step analysis is written out ten times."], strengths: ["The memo covers every redemption and interest feature."],
    elevator_pitch: "West Lake issued $275 million of 11% senior secured bonds.",
    key_questions: [{ ref: "12", topic: "Listing failure step-up", document_conclusion: "Embedded derivative, immaterial", reviewer_view: "Disagree with the model", assessment: "disagree", findings: ["P1"] }],
    findings: [
      { id: "P1", tier: "primary", title: "Listing Failure Step-Up", location: "Issue #12, Listing Failure Step-Up Feature", summary: "Registration payment arrangement.",
        comment: "Please first evaluate whether it is a registration payment arrangement under ASC 825-20.", guidance_cited: ["ASC 825-20"] },
      { id: "S1", tier: "secondary", title: "ASC 815-15-25-26 step", location: "Issues #2 through #13", summary: "Step misapplied.",
        comment: "Please restructure the additional step.", guidance_cited: [] },
    ],
    missing_documents: ["Bond Terms"],
  },
};

const act: ResultActions = { challenge: vi.fn(), memo: vi.fn(), reviseDocument: vi.fn(), deliverable: vi.fn(), revise: vi.fn(), reviseDraft: vi.fn() };

test("document review shows score, table, tiers and paste-ready comments that copy exactly", async () => {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  mockFetch([]);
  renderApp(<DocReviewResult a={analysis} act={act} />);
  expect(screen.getByText("West Lake Bond memo (draft 11/15/2026, 24 pages)")).toBeInTheDocument();
  expect(screen.getByTestId("review-score")).toHaveTextContent("6.5");
  expect(screen.getByText("It loses points for 2 reasons:")).toBeInTheDocument();
  expect(screen.getByTestId("key-questions")).toHaveTextContent("Memo conclusion");
  expect(screen.getByText("Primary")).toBeInTheDocument();
  expect(screen.getByText("Secondary")).toBeInTheDocument();
  await userEvent.click(screen.getByTestId("copy-P1"));
  expect(writeText).toHaveBeenLastCalledWith("Please first evaluate whether it is a registration payment arrangement under ASC 825-20.");
  await userEvent.click(screen.getByTestId("copy-all-comments"));
  expect(writeText).toHaveBeenLastCalledWith(
    "P1. Issue #12, Listing Failure Step-Up Feature\n\nPlease first evaluate whether it is a registration payment arrangement under ASC 825-20.\n\n"
    + "S1. Issues #2 through #13\n\nPlease restructure the additional step.");
  await userEvent.click(screen.getByRole("button", { name: /Draft revised memo/ }));
  expect(act.reviseDocument).toHaveBeenCalled();
});
