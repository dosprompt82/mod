/** Content types for a show. One folder per show under content/<slug>/. */
export type Position = { season: number; episode: number; second: number };

export interface Episode {
  season: number; number: number; title: string; runtimeSec: number; releasedOn: string;
  /** False until title, runtime and date are checked against the Netflix listing. Unconfirmed titles are never served. */
  confirmed: boolean;
}
export interface Season { number: number; episodes: Episode[] }
export interface Show { slug: string; title: string; description: string; network: string; seasons: Season[]; status: "airing" | "ended" }

export interface SourceRef {
  kind: "official-synopsis" | "episode-viewing" | "press" | "reviewer" | "wiki";
  ref: string;
  checkedBy: string;
  checkedOn: string;
}
export type Status = "draft" | "verified" | "published";

export interface Fact {
  id: string;
  text: string;
  revealAt: Position;
  /** Character ids referenced in the text. */
  mentions: string[];
  source: SourceRef[];
  status: Status;
}

export interface Character {
  id: string;
  name: string;
  actor: string;
  /** The card does not exist before this position. */
  introducedAt: Position;
  roles: { text: string; revealAt: Position }[];
  facts: Fact[];
  imageId?: string;
  group?: string;
  /** Not in the spec type: gates unverified introductions too (DECISIONS D-003). */
  status: Status;
}

export interface Relationship {
  a: string;
  b: string;
  versions: { label: string; kind: "family" | "romance" | "work" | "alliance" | "conflict"; revealAt: Position }[];
}

export interface EpisodeRecap { season: number; episode: number; short: string; long: string; previously: string[]; status: Status }
export interface SeasonRecap { season: number; sixtySeconds: string; full: string[]; status: Status }
export interface SpoilerRule { name: string; pattern: RegExp; revealAt: Position; verified: boolean }

export interface ShowContent {
  show: Show;
  characters: Character[];
  relationships: Relationship[];
  episodeRecaps: EpisodeRecap[];
  seasonRecaps: SeasonRecap[];
  spoilerRules: SpoilerRule[];
}
