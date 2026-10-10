import { SpeechStateExternalEvent } from "speechstate";

type Individuals = Predicates;
type Predicates = { [index: string]: string };
export type Domain = {
  plans: PlanInfo[];
  predicates: Predicates; // Mapping from predicate to sort
  individuals: Individuals; // Mapping from individual to sort
};

export type PlanInfo = {
  type: "action" | "issue";
  content: null | Proposition | ShortAnswer | Question;
  plan: Action[];
};

export type Database = {
  consultDB: (q: Question, p: Proposition[]) => Proposition | null;
};

export type ShortAnswer = string;
export type Proposition = {
  predicate: string;
  argument: string;
};

export type Question = WhQuestion;
type WhQuestion = { type: "whq"; predicate: string };

interface OtherMove {
  type: "greet" | "request";
  content: null | string;
}
interface AnswerMove {
  type: "answer";
  content: Proposition | ShortAnswer;
}
interface AskMove {
  type: "ask";
  content: Question;
}

export type Move = OtherMove | AnswerMove | AskMove;

export type Action = {
  type:
    | "greet"
    | "respond" // not to be used in plans
    | "raise"
    | "findout"
    | "consultDB";
  content: null | Question;
};

type Speaker = "usr" | "sys";

export interface InformationState {
  next_moves: Move[];
  domain: Domain;
  database: Database;
  private: { agenda: Action[]; plan: Action[]; bel: Proposition[] };
  shared: {
    lu?: { speaker: Speaker; moves: Move[] };
    qud: Question[];
    com: Proposition[];
  };
}

export interface DMContext extends TotalInformationState {
  ssRef: any;
  lastUserMoves?: Move[];
}

export interface DMEContext extends TotalInformationState {
  parentRef: any;
}

export interface TotalInformationState {
  /** interface variables */
  latest_speaker?: Speaker;
  latest_moves?: Move[];

  /** information state */
  is: InformationState;
}

export type DMEvent =
  | { type: "CLICK" }
  | SpeechStateExternalEvent
  | NextMovesEvent;

export type DMEEvent = SaysMovesEvent;

export type SaysMovesEvent = {
  type: "SAYS";
  value: { speaker: Speaker; moves: Move[] };
};

export type NextMovesEvent = {
  type: "NEXT_MOVES";
  value: Move[];
};
