import { assign, createActor, fromPromise, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { KEY } from "./credentials";
import { DMContext, DMEvents, Message } from "./types";
import OpenAI from "openai";
import { QdrantClient } from "@qdrant/js-client-rest";

const REGION = "swedencentral";

const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1/",
  apiKey: "ollama",
  dangerouslyAllowBrowser: true,
});

const azureCredentials = {
  endpoint: `https://${REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
  key: KEY,
};

const qdrant = new QdrantClient({ host: "localhost", port: 6333 });
const RAG_COLLECTION = "studentSupport"

const embed = async (input: string) =>
  openai.embeddings
    .create({ model: "qwen3-embedding", input, dimensions: 384 })
    .then((result) => result.data[0].embedding);
/** backup: Azure access via FLoV proxy
const azureProxyCredentials = {
  proxyUrl: "https://rndserv.flov.gu.se:4000/api/token",
  key: "",
  };
*/

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: REGION,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
  bargeIn: false,
};

const BASE_SYSTEM_PROMPT =
  "You are a helpful voice assistant for Gothenburg University students. " +
  "Use the reference information below if it's relevant to the user's question. " +
  "If it's not relevant, ignore it and answer normally. Keep responses brief and conversational.";

function buildAugmentedMessages(context: DMContext): Message[] {
  const systemMessage: Message = {
    role: "system",
    content: context.ragContext
      ? `${BASE_SYSTEM_PROMPT}\n\nREFERENCE INFORMATION:\n${context.ragContext}`
      : BASE_SYSTEM_PROMPT,
  };
  return [systemMessage, ...context.messages.slice(1)];
}
// interface GrammarEntry {
//   person?: string;
//   day?: string;
//   time?: string;
// }

// const grammar: { [index: string]: GrammarEntry } = {
//   vlad: { person: "Vladislav Maraev" },
//   bora: { person: "Bora Kara" },
//   tal: { person: "Talha Bedir" },
//   tom: { person: "Tom Södahl Bladsjö" },
//   monday: { day: "Monday" },
//   tuesday: { day: "Tuesday" },
//   "10": { time: "10:00" },
//   "11": { time: "11:00" },
// };

// function isInGrammar(utterance: string) {
//   return utterance.toLowerCase() in grammar;
// }

// const SYSTEM_PROMPT: Message = {
//   role: "system",
//   content:
//     "You are a voice assistant",
// };

const dmMachine = setup({
  types: {
    /** you might need to extend these */
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    /** define your actions here */
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
      }),
  },
  actors: {
    chatCompletion: fromPromise<string, Message[]>(async ({ input }) => {
      const response = await openai.chat.completions.create({
        model: "llama3.2",
        messages: input,
      });
      return response.choices[0].message.content ?? "";
    }),
    queryRAG: fromPromise<string, string>(async ({ input }) => {
      const embedding = await embed(input); // embeds the user's utterance
      const result = await qdrant.query(RAG_COLLECTION, {
        query: embedding,
        with_payload: true,
        limit: 3, // top 3 most relevant chunks
      });
      return result.points.map((p: any) => p.payload.text).join("\n\n---\n\n");
    }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    messages: [{ role: "system", content: BASE_SYSTEM_PROMPT }],
    ragContext: "",
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Loop" },
    },
    // Greeting: {
    //   initial: "Prompt",
    //   on: {
    //     LISTEN_COMPLETE: [
    //       {
    //         target: "CheckGrammar",
    //         guard: ({ context }) => !!context.lastResult,
    //       },
    //       { target: ".NoInput" },
    //     ],
    //   },
    //   states: {
    //     Prompt: {
    //       entry: { type: "spst.speak", params: { utterance: `Hello world!` } },
    //       on: { SPEAK_COMPLETE: "Ask" },
    //     },
    //     NoInput: {
    //       entry: {
    //         type: "spst.speak",
    //         params: { utterance: `I can't hear you!` },
    //       },
    //       on: { SPEAK_COMPLETE: "Ask" },
    //     },
    //     Ask: {
    //       entry: { type: "spst.listen" },
    //       on: {
    //         RECOGNISED: {
    //           actions: assign(({ event }) => {
    //             return { lastResult: event.value };
    //           }),
    //         },
    //         ASR_NOINPUT: {
    //           actions: assign({ lastResult: null }),
    //         },
    //       },
    //     },
    //   },
    // },

    // CheckGrammar: {
    //   entry: {
    //     type: "spst.speak",
    //     params: ({ context }) => ({
    //       utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
    //         isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
    //       } in the grammar.`,
    //     }),
    //   },
    //   on: { SPEAK_COMPLETE: "Done" },
    // },
    Loop: {
      // on entry, pushing a hardcoded greeting into messages as an
      // "assistant" message. This corresponds to the diagram's
      entry: assign(({ context }) => ({
        messages: [
          ...context.messages,
          { role: "assistant", content: "Hello world!" } as Message,
        ],
      })),
      initial: "Speaking",
      states: {
        // Handles both the initial greeting AND every subsequent LLM reply,
        // since both get appended to the same `messages` array.
        Speaking: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: context.messages[context.messages.length - 1].content,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },

        // Done: {
        //   on: {
        //     CLICK: "Greeting",
        //   },
        // },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ context, event }) => ({
                messages: [...context.messages, { role: "user", content: event.value[0].utterance } as Message],
              })),
            },
            LISTEN_COMPLETE: "Retrieve", 
            ASR_NOINPUT: { target: "NoInput" },
          },
        },

        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Could you repeat that?" },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },

        Retrieve: {
          entry: assign({ ragContext: "" }),
          invoke: {
            src: "queryRAG",
            input: ({ context }) => context.messages[context.messages.length - 1].content, // latest utterance
            onDone: {
              target: "ChatCompletion",
              actions: assign(({ event }) => ({ ragContext: event.output })),
            },
            onError: {
              target: "ChatCompletion", // still answer, just without retrieved context
              actions: ({ event }) => console.error("RAG retrieval failed:", event.error),
            },
          },
        },

        ChatCompletion: {
          invoke: {
            src: "chatCompletion",
            input: ({ context }) => buildAugmentedMessages(context), 
            onDone: {
              target: "Speaking",
              actions: assign(({ context, event }) => ({
                messages: [...context.messages, { role: "assistant", content: event.output } as Message],
              })),
            },
            onError: {
              target: "Error",
              actions: ({ event }) => console.error("Chat completion failed:", event.error),
            },
          },
        },
        Error: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Something went wrong, please try again." },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
  },
});

const dmActor = createActor(dmMachine, {}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}
