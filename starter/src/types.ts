import { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import { AnyActorRef } from "xstate";

export type Message = {
  role: "assistant" | "user" | "system";
  content: string;
};

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  messages: Message[];
  ragContext: string;
  noInputCount: number; // tracks consecutive silence timeouts
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };