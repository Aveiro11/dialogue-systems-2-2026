import { assign, createActor, setup, AnyMachineSnapshot } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
// import { KEY } from "../azure";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  // key: KEY,
};

const settings = {
  azureCredentials: azureCredentials,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
  azureRegion: "northeurope",
};

const dmMachine = setup({
  actions: {
    /** speak and listen */
    speak_output_top: ({ context }) =>
      context.ssRef.send({
        type: "SPEAK",
        value: {
          utterance: context.is.output[0],
        },
      }),
    listen: ({ context }) =>
      context.ssRef.send({
        type: "LISTEN",
      }),

    /** update rules */
    enqueue_recognition_result: assign(({ context, event }) => {
      const newIS = {
        ...context.is,
        input: [event.value[0].utterance, ...context.is.input],
      };
      console.log("[IS enqueue_recognition_result]", newIS);
      return { is: newIS };
    }),
    enqueue_input_timeout: assign(({ context }) => {
      const newIS = {
        ...context.is,
        input: ["timeout", ...context.is.input],
      };
      console.log("[IS enqueue_input_timeout]", newIS);
      return { is: newIS };
    }),
    dequeue_input: assign(({ context }) => {
      const newIS = {
        ...context.is,
        input: context.is.input.slice(1),
      };
      console.log("[IS dequeue_input]", newIS);
      return { is: newIS };
    }),
    dequeue_output: assign(({ context }) => {
      const newIS = { ...context.is, output: context.is.output.slice(1) };
      console.log("[IS dequeue_output]", newIS);
      return { is: newIS };
    }),
    enqueue_output_from_input: assign(({ context }) => {
      const newIS = {
        ...context.is,
        output: [context.is.input[0], ...context.is.output],
      };
      console.log("[IS enqueue_output_from_input]", newIS);
      return { is: newIS };
    }),
  },
  guards: {
    /** preconditions */
    lastInputIsTimeout: ({ context }) => context.is.input[0] === "timeout",
    inputIsNotEmpty: ({ context }) => !!context.is.input[0],
    outputIsNotEmpty: ({ context }) => !!context.is.output[0],
  },
  types: {} as {
    context: {
      ssRef?: any;
      is: { input: string[]; output: string[] };
    };
  },
}).createMachine({
  context: ({ spawn }) => {
    return {
      ssRef: spawn(speechstate, { input: settings }),
      is: { input: ["ping"], output: [] },
    };
  },
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.ssRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: {
        CLICK: "Main",
      },
    },
    Main: {
      initial: "Process",
      states: {
        Process: {
          always: [
            {
              guard: "lastInputIsTimeout",
              actions: "dequeue_input",
            },
            {
              guard: "inputIsNotEmpty",
              actions: ["enqueue_output_from_input", "dequeue_input"],
            },
            {
              guard: "outputIsNotEmpty",
              actions: ["speak_output_top", "dequeue_output"],
            },
          ],
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: "listen",
          on: {
            RECOGNISED: {
              target: "Process",
              actions: "enqueue_recognition_result",
            },
            ASR_NOINPUT: {
              target: "Process",
              actions: "enqueue_input_timeout",
            },
          },
        },
      },
    },
  },
});

export const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

let is = dmActor.getSnapshot().context.is;
console.log("[IS (initial)]", is);
dmActor.subscribe((snapshot: AnyMachineSnapshot) => {
  /* if you want to log some parts of the state */

  // is !== snapshot.context.is && console.log("[IS]", snapshot.context.is);
  is = snapshot.context.is;
});

export function setupButton(element: HTMLElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor
    .getSnapshot()
    .context.ssRef.subscribe((snapshot: AnyMachineSnapshot) => {
      element.innerHTML = `${Object.values(snapshot.getMeta())[0]["view"]}`;
    });
}
