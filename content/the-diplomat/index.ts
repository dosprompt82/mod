/**
 * The Diplomat (Netflix): pilot show. Seasons 1–3 content; Season 4 is structure only.
 *
 * Sourcing (DECISIONS D-016): facts are paraphrased from per-episode summaries on Wikipedia
 * ("The Diplomat (American TV series)", episode tables, retrieved 2026-11-08). Each summary covers one
 * episode, so each fact reveals at the end of the episode it comes from. Whole-show pages (cast lists,
 * character bios) are never used, because they describe later events.
 * Episode-level gating only: runtimes are placeholders (D-017), so there are no mid-episode reveals.
 */
import type { Character, Episode, EpisodeRecap, Fact, Position, Relationship, SeasonRecap, ShowContent, SourceRef, SpoilerRule } from "../../src/spoiler/types";

const RUNTIME = 3600; // placeholder until runtimes are sourced (D-017)
const RETRIEVED = "2026-11-08";

const titles: string[][] = [
  ["The Cinderella Thing", "Don't Call It a Kidnapping", "Lambs in the Dark", "He Bought a Hat", "The Dogcatcher", "Some Lusty Tornado", "Keep Your Enemies Closer", "The James Bond Clause"],
  ["When a Stranger Calls", "St. Paul's", "The Ides of March", "The Other Army", "Our Lady of Immaculate Deception", "Dreadnought"],
  ["Emperor Dead", "Last Dance at the Country Club", "The Riderless Horse", "Arden", "Birdwatchers", "Amagansett", "PNG", "Schrodinger's Wife"],
  ["Windsor", "Redcoats", "The Typo", "Pagliacci", "Special Envoy", "The Dead", "Phony Negroni", "Warships"],
];
const released = ["2023-04-20", "2024-10-31", "2025-10-16", "2026-10-15"];

/** End of an episode: the default reveal point. */
const E = (season: number, episode: number): Position => ({ season, episode, second: RUNTIME });
const src = (s: number, e: number): SourceRef[] => [{
  kind: "wiki", ref: `Wikipedia, The Diplomat (American TV series), episode table S${s}E${e}`, checkedBy: "automated", checkedOn: RETRIEVED,
}];

let factSeq = 0;
/** fact(season, episode, text, mentions) — reveals at the end of that episode. */
const fact = (s: number, e: number, text: string, mentions: string[] = []): Fact => ({
  id: `f${++factSeq}`, text, revealAt: E(s, e), mentions, source: src(s, e), status: "published",
});

type Roles = [number, number, string][];
const character = (id: string, name: string, actor: string, intro: [number, number], roles: Roles, facts: Fact[], group?: string): Character => ({
  id, name, actor, introducedAt: E(...intro),
  roles: roles.map(([s, e, text]) => ({ text, revealAt: E(s, e) })),
  facts, ...(group ? { group } : {}), status: "published",
});

const characters: Character[] = [
  character("kate-wyler", "Kate Wyler", "Keri Russell", [1, 1], [
    [1, 1, "US Ambassador to the United Kingdom"],
    [3, 4, "US Ambassador to the United Kingdom and Second Lady of the United States"],
  ], [
    fact(1, 1, "A career diplomat, she takes the London ambassadorship at the request of the President and his chief of staff.", ["president-rayburn", "billie-appiah"]),
    fact(1, 1, "She and Hal arrive in London already planning to divorce.", ["hal-wyler"]),
    fact(1, 2, "She learns from Hal that she is being considered to replace the Vice President.", ["hal-wyler"]),
    fact(1, 3, "When she finds out Hal pushed her name to save their marriage, she lashes out at him, then tries to resign; the President refuses.", ["hal-wyler", "president-rayburn"]),
    fact(1, 7, "She was previously posted to Kabul.", []),
    fact(2, 2, "She tells Hal she did not sleep with Dennison, but had planned to in Paris.", ["hal-wyler", "austin-dennison"]),
    fact(2, 6, "She tells Stuart she now wants to become vice president.", ["stuart-hayford"]),
    fact(3, 2, "Passed over for vice president, she stays in London as ambassador instead of moving back to Washington with Hal.", ["hal-wyler"]),
    fact(3, 7, "She apologises for the Courageous attack to Frances Munning, Winfield House's British residence manager.", ["frances-munning"]),
  ], "US embassy"),
  character("hal-wyler", "Hal Wyler", "Rufus Sewell", [1, 1], [
    [1, 1, "Career diplomat; Kate's husband"],
    [3, 4, "Vice President of the United States"],
  ], [
    fact(1, 1, "A veteran diplomat himself, he tends to work his own channels behind Kate's back.", ["kate-wyler"]),
    fact(1, 2, "After being drugged and taken, he gets a call from Iran's deputy foreign minister, an old acquaintance, who insists Iran did not attack the carrier.", ["rasoul-shahin"]),
    fact(1, 5, "He kisses Cecilia Dennison while swimming at Chevening and confesses it to Kate.", ["cecilia-dennison", "kate-wyler"]),
    fact(1, 8, "Kate suspects he is angling to become secretary of state.", ["kate-wyler"]),
    fact(2, 1, "He survives the London attack with serious injuries and wakes up in hospital.", []),
    fact(2, 3, "He reacts badly to fireworks at the Independence Day party, and Kate comforts him.", ["kate-wyler"]),
    fact(3, 2, "In a 2010 flashback he is US ambassador to Iraq, Kate works for him, and he proposes to her.", ["kate-wyler"]),
    fact(3, 4, "As vice president he gets the UNCLOS treaty ratified.", []),
  ], "US embassy"),
  character("president-rayburn", "President William Rayburn", "Michael McKean", [1, 1], [[1, 1, "President of the United States"]], [
    fact(1, 3, "Kate convinces him Iran was not behind the carrier attack.", ["kate-wyler"]),
    fact(1, 6, "He overrules his secretary of state and backs military action against Lenkov's fighters in Libya.", ["miguel-ganon"]),
    fact(1, 7, "He authorises a joint operation with the British to arrest Lenkov.", []),
  ], "White House"),
  character("billie-appiah", "Billie Appiah", "Nana Mensah", [1, 1], [[1, 1, "White House chief of staff"]], [
    fact(1, 1, "She asks Stuart to prepare Kate as a possible replacement for the Vice President.", ["stuart-hayford", "kate-wyler"]),
    fact(1, 4, "She and Stuart once ran campaigns together.", ["stuart-hayford"]),
  ], "White House"),
  character("stuart-hayford", "Stuart Hayford", "Ato Essandoh", [1, 1], [[1, 1, "Deputy chief of mission, US Embassy London"]], [
    fact(1, 4, "A former campaign manager, he joined the Foreign Service to get away from Washington politics.", []),
    fact(1, 6, "He and Eidra agree to go public with their relationship.", ["eidra-park"]),
    fact(1, 8, "Eidra ends their relationship after he says he would follow Kate to Washington.", ["eidra-park", "kate-wyler"]),
    fact(2, 1, "He survives the London attack but loses his memory of the events just before it.", []),
    fact(2, 2, "He blames Kate for Ronnie's death.", ["kate-wyler", "ronnie-buckhurst"]),
    fact(2, 4, "He walks back his negative assessment of Kate to Appiah.", ["billie-appiah", "kate-wyler"]),
  ], "US embassy"),
  character("eidra-park", "Eidra Park", "Ali Ahn", [1, 1], [[1, 1, "CIA station chief, London"]], [
    fact(2, 1, "She tells Kate she will investigate the Prime Minister quietly to protect her.", ["kate-wyler", "nicol-trowbridge"]),
    fact(2, 2, "She keeps Roylin under CIA protection to get more information out of her.", ["margaret-roylin"]),
    fact(2, 4, "She had Stuart tested by a CIA officer over concerns about his mental state, and recorded it.", ["stuart-hayford"]),
    fact(3, 2, "Her career is in jeopardy after Roylin dies in CIA custody.", ["margaret-roylin"]),
  ], "US embassy"),
  character("austin-dennison", "Austin Dennison", "David Gyasi", [1, 1], [[1, 1, "UK Foreign Secretary"]], [
    fact(1, 6, "He lost the party leadership to Trowbridge in a contest Roylin engineered.", ["nicol-trowbridge", "margaret-roylin"]),
    fact(1, 6, "He and Kate admit they have feelings for each other.", ["kate-wyler"]),
    fact(2, 3, "He tries and fails to gather enough votes to force Trowbridge out.", ["nicol-trowbridge"]),
    fact(3, 4, "He and Kate kiss at his home, but he says the timing is wrong.", ["kate-wyler"]),
    fact(3, 8, "He married four weeks before the Chequers dinner.", []),
  ], "UK government"),
  character("nicol-trowbridge", "Nicol Trowbridge", "Rory Kinnear", [1, 1], [[1, 1, "Prime Minister of the United Kingdom"]], [
    fact(1, 2, "His vow to 'rain hellfire' on Iran goes viral.", []),
    fact(1, 3, "He misled the Americans about the carrier's condition to draw them in.", []),
    fact(1, 6, "He wants a show of force to head off a Scottish independence referendum.", []),
    fact(2, 1, "He leans on his wife Lydia for advice.", ["lydia-trowbridge"]),
    fact(2, 3, "Many MPs are angry with him, but the public sees him as a hero.", []),
  ], "UK government"),
  character("miguel-ganon", "Miguel Ganon", "Miguel Sandoval", [1, 1], [[1, 1, "US Secretary of State"]], [
    fact(1, 1, "He tries to have Kate removed as ambassador.", ["kate-wyler"]),
    fact(1, 6, "Hal believes he wants to be president and is trying to make the President look bad.", ["hal-wyler", "president-rayburn"]),
  ], "White House"),
  character("rasoul-shahin", "Rasoul Shahin", "Bijan Daneshmand", [1, 2], [[1, 2, "Iran's deputy foreign minister"]], [
    fact(1, 2, "An old acquaintance of Hal's.", ["hal-wyler"]),
  ], "Iran"),
  character("cecilia-dennison", "Cecilia Dennison", "T'Nia Miller", [1, 5], [[1, 5, "Austin Dennison's sister"]], [
    fact(1, 6, "She helps Kate reach Margaret Roylin.", ["kate-wyler", "margaret-roylin"]),
  ], "UK government"),
  character("margaret-roylin", "Margaret Roylin", "Celia Imrie", [1, 6], [[1, 6, "Former Conservative Party campaign manager"]], [
    fact(1, 6, "She engineered Trowbridge's win as party leader and still advises him.", ["nicol-trowbridge"]),
    fact(1, 6, "She suggests striking Lenkov's fighters in Libya.", []),
    fact(2, 1, "She goes missing, then calls Kate.", ["kate-wyler"]),
    fact(2, 2, "She claims British opponents of Scottish independence hired Lenkov, including Grove.", ["merritt-grove"]),
    fact(2, 4, "She confesses she hired Lenkov, saying the staged attack was meant to do little damage.", []),
  ], "UK government"),
  character("ronnie-buckhurst", "Ronnie Buckhurst", "Jess Chanliau", [1, 8], [[1, 8, "US embassy officer"]], [], "US embassy"),
  character("merritt-grove", "Merritt Grove", "Simon Chandler", [1, 8], [[1, 8, "Conservative MP"]], [
    fact(1, 8, "Hal's Chatham House speech catches his attention.", ["hal-wyler"]),
    fact(2, 1, "He had arranged Russian-sourced donations to the Conservative Party.", []),
  ], "UK government"),
  character("lydia-trowbridge", "Lydia Trowbridge", "Pandora Colin", [2, 1], [[2, 1, "The Prime Minister's wife"]], [
    fact(2, 1, "She warns Dennison not to interfere between her husband and Roylin.", ["austin-dennison", "margaret-roylin"]),
  ], "UK government"),
  character("grace-penn", "Grace Penn", "Allison Janney", [2, 5], [
    [2, 5, "Vice President of the United States"],
    [2, 6, "President of the United States"],
  ], [
    fact(2, 5, "The White House sends her to London to help contain the Roylin situation.", ["margaret-roylin"]),
    fact(2, 5, "She gives Kate a blunt reality check about the vice presidency.", ["kate-wyler"]),
    fact(2, 6, "She explains to Kate why a Scottish naval base is vital to US and UK nuclear defence.", ["kate-wyler"]),
    fact(3, 1, "She is sworn in at the US embassy in London.", []),
    fact(3, 3, "After hearing Kate out, she goes ahead with Hal as her nominee.", ["kate-wyler", "hal-wyler"]),
  ], "White House"),
  character("callum-ellis", "Callum Ellis", "Aidan Turner", [3, 5], [[3, 5, "British intelligence officer"]], [
    fact(3, 5, "He alerts Kate to a Russian submarine in distress off the British coast.", ["kate-wyler"]),
    fact(3, 7, "He tells Kate the submarine carries an operational Poseidon nuclear torpedo.", ["kate-wyler"]),
  ], "UK government"),
  character("todd-penn", "Todd Penn", "Bradley Whitford", [3, 6], [[3, 6, "The President's husband"]], [
    fact(3, 6, "He resents feeling like he plays second fiddle.", []),
  ], "White House"),
  character("frances-munning", "Frances Munning", "Penny Downie", [3, 7], [[3, 7, "Residence manager, Winfield House"]], [], "US embassy"),
];

const rel = (a: string, b: string, versions: [number, number, string, Relationship["versions"][number]["kind"]][]): Relationship => ({
  a, b, versions: versions.map(([s, e, label, kind]) => ({ label, kind, revealAt: E(s, e) })),
});

const relationships: Relationship[] = [
  rel("kate-wyler", "hal-wyler", [[1, 1, "Married, planning to divorce", "romance"], [3, 3, "Separated in private", "romance"], [3, 8, "Back together", "romance"]]),
  rel("kate-wyler", "austin-dennison", [[1, 1, "Diplomatic counterparts", "work"], [1, 6, "Admitted feelings", "romance"], [2, 5, "Trust broken", "conflict"], [3, 4, "Kissed; he pulled back", "romance"]]),
  rel("kate-wyler", "stuart-hayford", [[1, 1, "Her deputy", "work"], [2, 2, "Blames her for Ronnie's death", "conflict"], [2, 4, "Working together again", "work"]]),
  rel("kate-wyler", "billie-appiah", [[1, 1, "Vetting her for the vice presidency", "work"]]),
  rel("stuart-hayford", "eidra-park", [[1, 6, "Dating", "romance"], [1, 8, "Broke up", "conflict"]]),
  rel("stuart-hayford", "billie-appiah", [[1, 4, "Former campaign colleagues", "work"]]),
  rel("hal-wyler", "cecilia-dennison", [[1, 5, "Shared a kiss", "romance"]]),
  rel("nicol-trowbridge", "austin-dennison", [[1, 1, "Prime Minister and Foreign Secretary", "work"], [1, 6, "Old leadership rivals", "conflict"], [2, 5, "Mended their relationship", "alliance"]]),
  rel("nicol-trowbridge", "margaret-roylin", [[1, 6, "She made him party leader", "alliance"], [2, 4, "He attacked her after her confession", "conflict"]]),
  rel("nicol-trowbridge", "lydia-trowbridge", [[2, 1, "Married", "family"]]),
  rel("austin-dennison", "cecilia-dennison", [[1, 5, "Siblings", "family"]]),
  rel("hal-wyler", "grace-penn", [[3, 1, "She asks him to be her running mate", "work"]]),
  rel("grace-penn", "todd-penn", [[3, 6, "Married", "family"]]),
  rel("kate-wyler", "callum-ellis", [[3, 5, "Affair", "romance"]]),
];

const recap = (season: number, episode: number, short: string, previously: string[]): EpisodeRecap => ({ season, episode, short, long: "", previously, status: "published" });

const episodeRecaps: EpisodeRecap[] = [
  recap(1, 1, "A British aircraft carrier is attacked in the Persian Gulf, killing 41 sailors. Career diplomat Kate Wyler reluctantly becomes US ambassador to the UK, arriving with her husband Hal, a diplomat who can't stay out of her business. Washington quietly sizes her up for the vice presidency. Suspicion falls on Iran. At the end, Hal is drugged and driven away.", []),
  recap(1, 2, "Hal turns up unharmed: an Iranian contact used the abduction to insist Iran didn't attack the carrier. Trowbridge's 'hellfire' threat goes viral, and the President plans a surprise trip to London. Kate tells Hal to leave her, and he blurts out that she's in the running for vice president.", ["The carrier was attacked and Iran is the main suspect.", "Kate and Hal plan to divorce.", "Hal was drugged and taken at the end of the first episode."]),
  recap(1, 3, "Kate persuades the President that Iran is innocent, revealing Hal as her source. She learns Trowbridge exaggerated the carrier's damage. Furious that Hal floated her for vice president to save their marriage, she tries to resign. The President refuses, and Appiah pretends not to hear.", ["Hal's Iranian contact says Iran was not behind the attack.", "Kate has just learned she's being considered for vice president.", "The President is coming to London."]),
  recap(1, 4, "Kate and her team secretly reach out to Iranian intelligence. Trowbridge embarrasses the US at a gala. In a covert meeting, the Iranian ambassador names Roman Lenkov, head of a Russian mercenary group, as the man behind the attack, then collapses. Kate and Hal sleep together.", ["The President backed off sending a carrier group after Kate's advice.", "Kate tried to resign and was refused."]),
  recap(1, 5, "At Chevening, Dennison hosts a strategy session on Iran and Russia. Trowbridge barges in demanding military action. Hal kisses Dennison's sister Cecilia and confesses it. The Iranian ambassador's death turns out to be a heart attack. Kate stuns the room by handing Trowbridge a list of Russian targets.", ["The Iranian ambassador pointed to Russian mercenary leader Roman Lenkov.", "Pressure is mounting for a response to Russia."]),
  recap(1, 6, "Kate's target list costs her Dennison's trust, and an all-night push produces sanctions instead. Kate and Dennison admit their feelings. Kate finds Trowbridge is taking advice from Margaret Roylin, who suggests striking Lenkov's fighters in Libya to help defeat a Scottish independence vote. The President approves.", ["Kate gave Trowbridge a list of Russian targets.", "Hal confessed to kissing Cecilia."]),
  recap(1, 7, "The Russian ambassador tips Kate that Lenkov will visit a villa in southern France. Kate flies to Washington but can barely get a word in. The President authorises a joint operation to arrest Lenkov. Back in London, Trowbridge vents about the cancelled Libya plan.", ["The US backed strikes on Lenkov's fighters in Libya.", "Roylin is quietly advising Trowbridge."]),
  recap(1, 8, "Kate wins French approval for the Lenkov operation, then learns it is designed to kill him rather than arrest him, and she and Dennison come to suspect Trowbridge. Eidra breaks up with Stuart. In London, Hal, Stuart and Ronnie reach MP Merritt Grove just as a car bomb goes off.", ["A joint operation to arrest Lenkov is planned.", "Kate is still being weighed for vice president."]),
  recap(2, 1, "Grove is dead; Hal, Stuart and Ronnie are badly hurt. MI5 confirms the bomb was British. Kate suspects someone high in the UK government. Roylin has disappeared. Hal wakes, Stuart can't remember the attack, and Ronnie dies. Then Roylin calls Kate.", ["A car bomb hit Hal, Stuart, Ronnie and MP Merritt Grove.", "Kate and Dennison suspect Trowbridge hired Lenkov."]),
  recap(2, 2, "At Grove's funeral, Eidra briefly shows Roylin to Dennison and Trowbridge. Roylin blames British opponents of Scottish independence for recruiting the mercenaries and hints that Kate's call cost Grove his life. The CIA holds Roylin. Stuart blames Kate for Ronnie's death.", ["Ronnie died; Grove is dead; Hal and Stuart survived.", "Roylin resurfaced by calling Kate."]),
  recap(2, 3, "British special forces kill Lenkov. Kate wonders if Roylin played them. Dennison's attempt to topple Trowbridge stalls. At the Independence Day party, fireworks trigger both Stuart and Hal.", ["Roylin is in CIA hands and has named British extremists.", "Dennison is trying to rescind the kill order on Lenkov."]),
  recap(2, 4, "Roylin admits she hired Lenkov for a staged attack that was meant to do little damage, and says MP Stendig planted the car bomb. A covert test of Trowbridge's reaction ends with him attacking Roylin. Stuart takes back his criticism of Kate.", ["Lenkov is dead.", "Dennison's move against Trowbridge stalled."]),
  recap(2, 5, "Trowbridge won't take Roylin, and Kate loses the trust of both him and Dennison. Vice President Grace Penn flies in to manage the crisis. Then Hal tells Kate that Penn gave Roylin the idea to attack the ship.", ["Roylin confessed to hiring Lenkov.", "Trowbridge attacked Roylin when he heard the confession."]),
  recap(2, 6, "Penn maneuvers to keep her job and lectures Kate on why a Scottish nuclear base matters. Hal goes straight to the President with what Penn did. The shock kills President Rayburn, and Penn becomes President.", ["Hal says Penn suggested the attack to Roylin.", "Kate now wants the vice presidency."]),
  recap(3, 1, "Penn is sworn in at the US embassy in London. Trowbridge says police will finally take Roylin. In a CIA safe house, Roylin takes a large dose of drugs. Penn asks Hal, not Kate, to be her vice president.", ["The President died during Hal's call, and Penn is now President.", "Penn's role in the attack is a closely held secret."]),
  recap(3, 2, "A flashback shows Hal proposing to Kate in Baghdad in 2010. In the present, Hal bargains for Kate to be named special envoy. Roylin dies of an overdose, putting Eidra's job at risk. Kate decides to stay in London.", ["Penn asked Hal to be her vice president.", "Roylin took drugs while awaiting transfer."]),
  recap(3, 3, "Washington is uneasy about Kate being ambassador and Second Lady at once. Kate and Hal agree to a secret divorce. Hal's promises to senators make Penn hesitate, but after Kate vouches for him, Penn goes ahead with his nomination.", ["Roylin is dead and Eidra's career is in danger.", "Kate chose to stay in London."]),
  recap(3, 4, "Hal is confirmed as vice president and gets UNCLOS ratified. The long distance strains the Wylers. Kate and Dennison kiss, but he stops it. Eidra meets Dennison secretly to save her career.", ["Kate and Hal agreed to a secret divorce.", "Penn decided to nominate Hal."]),
  recap(3, 5, "Five months on, Hal finds Kate involved with British spy Callum Ellis, who brings word of a Russian submarine in distress. A former Lenkov colonel claims the US was behind the Courageous attack. The Wylers fly to brief Penn.", ["Hal is vice president; Kate is ambassador and Second Lady.", "Dennison turned Kate down."]),
  recap(3, 6, "At Penn's Long Island home, the two couples clash. They decide to blame the late President Rayburn and tell Trowbridge privately. At the press conference, Trowbridge breaks the deal and blames Rayburn publicly.", ["A former Lenkov colonel says the US was behind the attack.", "A Russian submarine is in distress off Britain."]),
  recap(3, 7, "Kate sneaks back into Winfield amid protests. Callum reveals the submarine carries a Poseidon nuclear torpedo. Kate apologises to the residence manager, and Penn agrees to a summit in the UK.", ["Trowbridge publicly blamed Rayburn for the attack.", "Callum is tracking the Russian submarine."]),
  recap(3, 8, "Penn apologises to Trowbridge in London. At Chequers, Todd asks if she's having an affair with Hal. Kate and Hal reconcile. Then Kate realises Penn and Hal secretly recovered the weapon and used her idea as cover.", ["The submarine carries a Poseidon nuclear torpedo.", "Penn is coming to the UK for a summit."]),
];

const seasonRecaps: SeasonRecap[] = [
  { season: 1, status: "published", sixtySeconds: "After a British carrier is attacked, Kate Wyler becomes US ambassador in London while her marriage to Hal falls apart and Washington eyes her for vice president. The trail leads from Iran to Russian mercenary Roman Lenkov. Kate comes to suspect Prime Minister Trowbridge, and the season ends with a car bomb in London.", full: [] },
  { season: 2, status: "published", sixtySeconds: "In the aftermath of the London bombing, Roylin admits hiring Lenkov for a staged attack that went wrong. Kate learns Vice President Grace Penn gave Roylin the idea. Hal confronts the President, who dies, and Penn becomes President.", full: [] },
  { season: 3, status: "published", sixtySeconds: "Penn picks Hal as vice president; Roylin dies in CIA custody; the Wylers quietly separate. Facing the truth about the attack, the US blames the late President Rayburn, and Trowbridge goes public. A Russian submarine with a nuclear torpedo forces a summit, the Wylers reconcile, and Kate discovers Penn and Hal secretly took the weapon.", full: [] },
];

const rule = (name: string, pattern: RegExp, revealAt: Position): SpoilerRule => ({ name, pattern, revealAt, verified: true });

const spoilerRules: SpoilerRule[] = [
  rule("Lenkov named as behind the carrier attack", /\bLenkov\b[^.]{0,80}\b(behind|directed|funded|hired)\b|\b(behind|directed|funded)\b[^.]{0,80}\bLenkov\b/i, E(1, 4)),
  rule("Trowbridge suspected of hiring Lenkov", /\b(suspect\w*|hired by)\b[^.]{0,60}\bTrowbridge\b/i, E(1, 8)),
  rule("Roylin hired Lenkov", /\bRoylin\b[^.]{0,80}\b(hired|confess\w*|admits?)\b/i, E(2, 4)),
  rule("Stendig planted the bomb", /\bStendig\b/i, E(2, 4)),
  rule("Penn suggested the attack", /\bPenn\b[^.]{0,80}\b(idea|suggest\w*|what Penn did|role)\b/i, E(2, 5)),
  rule("US behind the attack", /\b(US|United States|Americans?)\b[^.]{0,30}\b(was|were) behind\b|\bblam\w* (the late )?(President )?Rayburn\b/i, E(3, 5)),
  rule("End of Season 1 car bomb", /\b(car bomb|car-bomb|bombing|explosion)\b/i, E(1, 8)),
  rule("Who died in the car bomb", /\b(Grove|Ronnie)\b[^.]{0,40}\b(dead|died|dies|death|killed)\b/i, E(2, 1)),
  rule("Lenkov killed", /\bLenkov\b[^.]{0,40}\b(killed|dead|dies|died)\b|\bkill\w* Lenkov\b/i, E(2, 3)),
  rule("The President's death and Penn takes office",
    /\bRayburn\b[^.]{0,80}\b(dies|died|death|dead|funeral|late)\b|\bthe late President\b|\bPresident Penn\b|\bPenn\b[^.]{0,40}\b(becomes|is now|sworn in)\b[^.]{0,20}\b(President|sworn)\b|\bPenn is sworn in\b|\bPenn becomes President\b/i,
    E(2, 6)),
  rule("Who becomes Vice President", /\bHal\b[^.]{0,60}\b(her vice president|running mate|nominee|nomination|confirmed as vice president)\b|\bVice President Wyler\b/i, E(3, 1)),
  rule("Roylin's fate", /\bRoylin\b[^.]{0,80}\b(dies|died|dead|death|overdose|drugs)\b/i, E(3, 1)),
  rule("Wylers separate", /\bsecret divorce\b|\bseparated?\b/i, E(3, 3)),
  rule("Wylers reconcile", /\b(reconcil\w*|back together|take her back)\b/i, E(3, 8)),
  rule("Russian submarine", /\bRussian submarine\b|\bsubmarine in distress\b/i, E(3, 5)),
  rule("Poseidon torpedo", /\bPoseidon\b|\bnuclear torpedo\b/i, E(3, 7)),
  rule("Who took the weapon", /\b(secretly )?(recovered|retrieved|took)\b[^.]{0,40}\bweapon\b/i, E(3, 8)),
];

const content: ShowContent = {
  show: {
    slug: "the-diplomat",
    title: "The Diplomat",
    description: "A veteran US diplomat is unexpectedly made ambassador to the United Kingdom in the middle of an international crisis.",
    network: "Netflix",
    status: "airing",
    seasons: titles.map((ts, si) => ({
      number: si + 1,
      episodes: ts.map((title, ei): Episode => ({ season: si + 1, number: ei + 1, title, runtimeSec: RUNTIME, releasedOn: released[si]!, confirmed: true })),
    })),
  },
  characters, relationships, episodeRecaps, seasonRecaps, spoilerRules,
};

export default content;
