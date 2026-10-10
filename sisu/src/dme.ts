import { setup, assign, sendTo, AnyTransitionConfig } from "xstate";
import { rules } from "./rules";
import { SaysMovesEvent, DMEEvent, DMEContext } from "./types";

/**
 * Creates a transition with a guarded ISU.
 *
 * @param nextState Target state.
 * @param ruleName Name of ISU rule.
 * @param [sendBackNextMoves=false] If `true`, communicate next move to the parent machine.
 */
function isuTransition(
  nextState: string,
  ruleName: string,
  sendBackNextMoves: boolean = false
): AnyTransitionConfig {
  return {
    target: nextState,
    guard: { type: "isu", params: { name: ruleName } },
    actions: [{ type: "isu", params: { name: ruleName } }],
  };
}

export const dme = setup({
  types: {} as {
    input: DMEContext;
    context: DMEContext;
    events: DMEEvent;
  },
  guards: {
    isu: ({ context }, params: { name: string }) =>
      !!rules[params.name](context),
    latestSpeakerIsUsr: ({ context }) => {
      return context.latest_speaker == "usr";
    },
  },
  actions: {
    sendBackNextMoves: sendTo(
      ({ context }) => context.parentRef,
      ({ context }) => {
        return {
          type: "NEXT_MOVES",
          value: context.is.next_moves,
        };
      }
    ),
    isu: assign(({ context }, params: { name: string }) => {
      let ruleName = params.name;
      let newIS = rules[ruleName](context)!(); // we assume that this is never called without a guard
      console.info(`[ISU ${ruleName}]`);
      console.dir(newIS, { depth: null, colors: true });
      return { is: newIS };
    }),
    updateLatestMoves: assign(({ context, event }) => {
      console.info("[DM updateLatestMoves]");
      console.dir(event, { depth: null, colors: true });
      return {
        latest_moves: (event as SaysMovesEvent).value.moves,
        latest_speaker: (event as SaysMovesEvent).value.speaker,
        is: {
          ...context.is,
          next_moves: [],
        },
      };
    }),
  },
}).createMachine({
  context: ({ input }) => {
    return input;
  },
  initial: "Select",
  states: {
    Select: {
      initial: "SelectAction",
      states: {
        SelectAction: {
          always: [
            isuTransition("SelectMove", "select_respond"),
            isuTransition("SelectMove", "select_from_plan"),
            { target: "SelectMove" }, // TODO check it -- needed for greeting
          ],
        },
        SelectMove: {
          always: [
            isuTransition("SelectionDone", "select_ask"),
            isuTransition("SelectionDone", "select_answer"),
            isuTransition("SelectionDone", "select_other"),
            { target: "SelectionDone" },
          ],
        },
        SelectionDone: {
          always: [{ actions: [{ type: "sendBackNextMoves" }] }],
          type: "final",
        },
      },
      onDone: "Update",
    },
    Update: {
      initial: "Init",
      states: {
        Init: {
          always: isuTransition("Grounding", "clear_agenda"),
        },
        Grounding: {
          // TODO: rename to Perception?
          on: {
            SAYS: {
              target: "Integrate",
              actions: [
                {
                  type: "updateLatestMoves",
                },
                { type: "isu", params: { name: "get_latest_move" } },
              ],
            },
          },
        },
        Integrate: {
          always: [
            isuTransition("DowndateQUD", "integrate_usr_request"),
            isuTransition("DowndateQUD", "integrate_sys_ask"),
            isuTransition("DowndateQUD", "integrate_usr_ask"),
            isuTransition("DowndateQUD", "integrate_answer"),
            isuTransition("DowndateQUD", "integrate_greet"),
            { target: "DowndateQUD" },
          ],
        },
        DowndateQUD: {
          always: [
            isuTransition("LoadPlan", "downdate_qud"),
            isuTransition("LoadPlan", "find_plan"),
            { target: "LoadPlan" },
          ],
        },
        LoadPlan: {
          always: { target: "ExecPlan" },
        },
        ExecPlan: {
          always: [
            isuTransition("ExecPlan", "remove_findout"),
            isuTransition("ExecPlan", "exec_consultDB"),
            { target: "FinalGroup" },
          ],
        },
        FinalGroup: {
          type: "final",
        },
      },
      onDone: [
        {
          target: "Select",
          guard: "latestSpeakerIsUsr",
        },
        { target: "Update" },
      ],
    },
  },
});
