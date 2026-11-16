/** User-facing action, workflow and rewrite options shared by the input and the draft editor. */
export const ACTIONS: { id: string; label: string; hint: string }[] = [
  { id: "analyze", label: "Analyze", hint: "What should I analyze?" },
  { id: "reply", label: "Draft a reply", hint: "Anything the reply should say or avoid?" },
  { id: "review_document", label: "Review a document", hint: "What should I look for?" },
  { id: "challenge", label: "Challenge a conclusion", hint: "Paste or describe the conclusion to challenge" },
  { id: "memo", label: "Create a memo", hint: "What is the memo about, and who is it for?" },
  { id: "summarize", label: "Summarize", hint: "Anything to focus on?" },
  { id: "ask", label: "Ask anything", hint: "Ask anything" },
];

export const WORKFLOWS: { id: string; label: string }[] = [
  { id: "", label: "Auto" }, { id: "email", label: "Email reply" }, { id: "document", label: "Document analysis" },
  { id: "reasoning", label: "Expert analysis" }, { id: "review", label: "Critical review" }, { id: "memo", label: "Memo" },
  { id: "writing", label: "Writing" }, { id: "knowledge", label: "Knowledge" }, { id: "strategy", label: "Strategic review" },
];

export const PRESETS: { id: string; label: string }[] = [
  { id: "shorter", label: "Shorter" }, { id: "direct", label: "More direct" }, { id: "warmer", label: "Warmer" }, { id: "firmer", label: "Firmer" },
  { id: "diplomatic", label: "More diplomatic" }, { id: "technical", label: "More technical" }, { id: "executive", label: "More executive" },
  { id: "expand", label: "Expand" }, { id: "my_style", label: "Rewrite in my style" },
];

