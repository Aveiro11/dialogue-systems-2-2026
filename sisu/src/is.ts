import { InformationState } from "./types";
import {
  objectsEqual,
  WHQ,
  findout,
  consultDB,
  getFactArgument,
} from "./utils";

export const initialIS = (): InformationState => {
  const predicates: { [index: string]: string } = {
    // Mapping from predicate to sort
    favorite_food: "food",
    booking_course: "course",
    booking_day: "day",
  };
  const individuals: { [index: string]: string } = {
    // Mapping from individual to sort
    pizza: "food",
    LT2319: "course",
    // Task 1: the possible answers to a "day" question
    friday: "day",
    thursday: "day",
    tuesday: "day",
  };
  // Task 1: the table from the lab: course -> day -> room
  const roomTable: { [course: string]: { [day: string]: string } } = {
    LT2319: { friday: "G212", thursday: "J440", tuesday: "J440" },
  };
  return {
    domain: {
      predicates: predicates,
      individuals: individuals,
      plans: [
        {
          type: "issue",
          content: WHQ("booking_room"),
          plan: [
            findout(WHQ("booking_day")),     // Task 1: ask the day first
            findout(WHQ("booking_course")),
            consultDB(WHQ("booking_room")),
          ],
        },
      ],
    },
    database: {
            consultDB: (question, facts) => {
        if (objectsEqual(question, WHQ("booking_room"))) {
          // Look up what the user told us so far
          const course = getFactArgument(facts, "booking_course");
          const day = getFactArgument(facts, "booking_day");
          if (course && day) {
            // Look in the table. "?." means "don't crash if it's missing"
            const room = roomTable[course]?.[day];
            if (room) {
              return { predicate: "booking_room", argument: room };
            }
          }
        }
        return null;
      },
    },
    next_moves: [],
    private: {
      plan: [],
      agenda: [
        {
          type: "greet",
          content: null,
        },
      ],
      bel: [{ predicate: "favorite_food", argument: "pizza" }],
    },
    shared: { lu: undefined, qud: [], com: [] },
  };
};
