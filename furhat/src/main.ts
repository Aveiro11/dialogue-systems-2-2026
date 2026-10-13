import { setup, createActor, fromPromise, assign } from "xstate";

const FURHATURI = "172.19.64.1:54321";

async function fhVoice(name: string) {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encName = encodeURIComponent(name);
  return fetch(`http://${FURHATURI}/furhat/voice?name=${encName}`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function fhSay(text: string) {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  const encText = encodeURIComponent(text);
  return fetch(`http://${FURHATURI}/furhat/say?text=${encText}&blocking=true`, {
    method: "POST",
    headers: myHeaders,
    body: "",
  });
}

async function newGesture() {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/gesture?blocking=false`, {
    method: "POST",
    headers: myHeaders,
    body: JSON.stringify({
      name: "newGesture",
      frames: [
        {
          time: [], //ADD THE TIME FRAME OF YOUR LIKING
          persist: true,
          params: {
            //ADD PARAMETERS HERE IN ORDER TO CREATE A GESTURE
          },
        },
        {
          time: [], //ADD TIME FRAME IN WHICH YOUR GESTURE RESETS
          persist: true,
          params: {
            reset: true,
          },
        },
        //ADD MORE TIME FRAMES IF YOUR GESTURE REQUIRES THEM
      ],
      class: "furhatos.gestures.Gesture",
    }),
  });
}

async function fhGesture(text: string) {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(
    `http://${FURHATURI}/furhat/gesture?name=${text}&blocking=true`,
    {
      method: "POST",
      headers: myHeaders,
      body: "",
    },
  );
}

async function fhListen() {
  const myHeaders = new Headers();
  myHeaders.append("accept", "application/json");
  return fetch(`http://${FURHATURI}/furhat/listen`, {
    method: "GET",
    headers: myHeaders,
  })
    .then((response) => response.body)
    .then((body) => body.getReader().read())
    .then((reader) => reader.value)
    .then((value) => JSON.parse(new TextDecoder().decode(value)).message);
}

// attend to the closest user
async function fhAttend() {
  return fetch(`http://${FURHATURI}/furhat/attend?user=CLOSEST`, {
    method: "POST",
    headers: { accept: "application/json" },
    body: "",
  });
}

// LED ring colour
async function fhLed(red: number, green: number, blue: number) {
  return fetch(
    `http://${FURHATURI}/furhat/led?red=${red}&green=${green}&blue=${blue}`,
    { method: "POST", headers: { accept: "application/json" }, body: "" },
  );
}

// custom gesture (smile + raised brows + head tilt)
async function fhSmileGesture() {
  return fetch(`http://${FURHATURI}/furhat/gesture?blocking=true`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      name: "myHappyTilt",
      frames: [
        {
          time: [0.4, 1.6],
          persist: false,
          params: { SMILE_OPEN: 0.8, BROW_UP_LEFT: 0.7, BROW_UP_RIGHT: 0.7, NECK_TILT: 10 },
        },
        { time: [2.2], persist: false, params: { reset: true } },
      ],
      class: "furhatos.gestures.Gesture",
    }),
  });
}

// play a sound file through Furhat
async function fhPlaySound(url: string) {
  return fetch(
    `http://${FURHATURI}/furhat/say?url=${encodeURIComponent(url)}&lipsync=false&blocking=true`,
    { method: "POST", headers: { accept: "application/json" }, body: "" },
  );
}

// gesture + sound at the same time
async function fhGestureWithSound(url: string) {
  return Promise.all([fhSmileGesture(), fhPlaySound(url)]);
}

const SOUND_URL = "http://localhost:8000/child_laughing.wav";

const dmMachine = setup({
  types: { context: {} as { heard: string } },
  actors: {
    fhVoice: fromPromise<any, null>(async () =>
      fhVoice("en-US-EchoMultilingualNeural"),
    ),
    fhAttend: fromPromise<any, null>(async () => fhAttend()),
    fhSay: fromPromise<any, { text: string }>(async ({ input }) =>
      fhSay(input.text),
    ),
    fhL: fromPromise<any, null>(async () => fhListen()),
    fhSmile: fromPromise<any, null>(async () => fhSmileGesture()),
    fhSoundGesture: fromPromise<any, null>(async () =>
      fhGestureWithSound(SOUND_URL),
    ),
  },
}).createMachine({
  id: "root",
  initial: "Start",
  context: { heard: "" },
  entry: () => fhLed(255, 255, 255), // white = idle
  states: {
    Start: { after: { 1000: "SetVoice" } },
    SetVoice: {
      invoke: { src: "fhVoice", input: null, onDone: "Attend", onError: "Fail" },
    },
    Attend: {
      invoke: { src: "fhAttend", input: null, onDone: "Greeting", onError: "Fail" },
    },
    Greeting: {
      entry: () => fhLed(0, 0, 255), // blue = speaking
      invoke: {
        src: "fhSay",
        input: { text: "Hi, how are you today?" },
        onDone: "Listen",
        onError: "Fail",
      },
    },
    Listen: {
      entry: () => fhLed(0, 255, 0), // green = listening
      invoke: {
        src: "fhL",
        input: null,
        onDone: {
          target: "Reply",
          actions: assign({ heard: ({ event }) => event.output }),
        },
        onError: "Fail",
      },
    },
    Reply: {
      entry: () => fhLed(0, 0, 255),
      invoke: {
        src: "fhSay",
        input: ({ context }) => ({
          text: context.heard
            ? `You said: ${context.heard}`
            : "Sorry, I didn't catch that.",
        }),
        onDone: "Smile",
        onError: "Fail",
      },
    },
    Smile: {
      invoke: { src: "fhSmile", input: null, onDone: "SoundGesture", onError: "Fail" },
    },
    SoundGesture: {
      invoke: {
        src: "fhSoundGesture",
        input: null,
        onDone: "Listen",
        onError: "Fail",
      },
    },
    Fail: { entry: () => fhLed(255, 0, 0) }, // red = error
  },
});

const actor = createActor(dmMachine).start();
actor.subscribe((snapshot) => {
  console.log(snapshot.value, snapshot.context);
});

actor.subscribe((snapshot) => {
  console.log(snapshot.value);
});

