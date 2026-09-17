import { Action, Proposition, Question } from "./types";

export function objectsEqual(obj1: any, obj2: any) {
  if (obj1 === obj2) {
    return true; // same reference or both are null/undefined
  }

  if (
    typeof obj1 !== "object" ||
    typeof obj2 !== "object" ||
    obj1 === null ||
    obj2 === null
  ) {
    return false; // primitive values or one of them is null
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false; // different number of properties
  }

  for (let key of keys1) {
    if (!keys2.includes(key) || !objectsEqual(obj1[key], obj2[key])) {
      return false; // different properties or values
    }
  }

  return true;
}

export function WHQ(predicate: string): Question {
  return {
    type: "whq",
    predicate: predicate,
  };
}

export function findout(q: Question): Action {
  return {
    type: "findout",
    content: q,
  };
}

export function consultDB(q: Question): Action {
  return {
    type: "consultDB",
    content: q,
  };
}

export function getFactArgument(facts: Proposition[], predicate: string) {
  for (let fact of facts) {
    if (fact.predicate == predicate) {
      return fact.argument;
    }
  }
}
