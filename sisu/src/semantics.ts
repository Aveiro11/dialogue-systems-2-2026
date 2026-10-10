import { ShortAnswer, Proposition, Question, Domain } from "./types";

export function relevant(
  domain: Domain,
  a: ShortAnswer | Proposition,
  q: Question
): boolean {
  if (
    typeof a === "string" &&
    domain.predicates[q.predicate] === domain.individuals[a]
  ) {
    return true;
  }
  if (typeof a === "object" && q.predicate === a.predicate) {
    return true;
  }
  return false;
}

export function resolves(a: ShortAnswer | Proposition, q: Question): boolean {
  if (typeof a === "object" && q.predicate === a.predicate) {
    return true;
  }
  return false;
}

export function combine(
  domain: Domain,
  q: Question,
  a: ShortAnswer | Proposition
): Proposition {
  if (
    typeof a === "string" &&
    domain.predicates[q.predicate] === domain.individuals[a]
  ) {
    return { predicate: q.predicate, argument: a };
  }
  if (typeof a === "object" && q.predicate === a.predicate) {
    return a;
  }
  throw new Error("Combine failed.");
}
