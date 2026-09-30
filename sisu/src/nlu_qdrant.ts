/** * VG-B: I use Qdrant as a simple vector-based NLU.
 * 1. I embed each example utterance and store it in Qdrant with its dialogue move. 
 * 2. For a new utterance, I embed it and find the closest stored example. 
 * 3. If the similarity is below the threshold, I return [] as "not understood".
 */
import { QdrantClient } from "@qdrant/js-client-rest";
import { Move } from "./types";
import { WHQ } from "./utils";

export const COLLECTION = "sisu_nlu";
export const VECTOR_SIZE = 384; // size of the vectors of all-MiniLM-L6-v2
export const THRESHOLD = 0.6; // minimal cosine similarity; tune it with the demo script

// An embedder turns text into a vector of numbers
export type Embedder = (text: string) => Promise<number[]>;

//Training examples: utterance -> moves (the payload)
type Example = { text: string; moves: Move[] };

const askRoom: Move[] = [{ type: "ask", content: WHQ("booking_room") }];
const askFood: Move[] = [{ type: "ask", content: WHQ("favorite_food") }];
const answer = (content: string): Move[] => [{ type: "answer", content }];

export const examples: Example[] = [
  // where is the lecture?
  { text: "where is the lecture?", moves: askRoom },
  { text: "which room is the lecture in?", moves: askRoom },
  { text: "where is the class held?", moves: askRoom },
  { text: "what room is my lecture in?", moves: askRoom },
  { text: "tell me the room for the lecture", moves: askRoom },
  // what's your favorite food?
  { text: "what's your favorite food?", moves: askFood },
  { text: "what food do you like?", moves: askFood },
  { text: "what do you like to eat?", moves: askFood },
  // answers: food
  { text: "pizza", moves: answer("pizza") },
  { text: "I like pizza", moves: answer("pizza") },
  // answers: course
  { text: "dialogue systems 2", moves: answer("LT2319") },
  { text: "dialogue systems", moves: answer("LT2319") },
  { text: "the dialogue systems course", moves: answer("LT2319") },
  { text: "LT2319", moves: answer("LT2319") },
  // answers: day
  { text: "friday", moves: answer("friday") },
  { text: "on friday", moves: answer("friday") },
  { text: "thursday", moves: answer("thursday") },
  { text: "on thursday", moves: answer("thursday") },
  { text: "tuesday", moves: answer("tuesday") },
  { text: "on tuesday", moves: answer("tuesday") },
];

// The real embedder
let extractor: any = null; // loaded on first use (the first call downloads the model)

export const transformersEmbedder: Embedder = async (text) => {
  if (!extractor) {
    const { pipeline } = await import("@huggingface/transformers");
    extractor = await (pipeline as any)(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
};

//Talking to Qdrant
export function makeClient(): QdrantClient {
  return new QdrantClient({
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY, // only needed for Qdrant Cloud
  });
}

/** Create the collection and upload all examples */
export async function seedQdrant(
  embed: Embedder = transformersEmbedder,
  client: QdrantClient = makeClient(),
  vectorSize: number = VECTOR_SIZE
): Promise<void> {
  const { exists } = await client.collectionExists(COLLECTION);
  if (exists) {
    await client.deleteCollection(COLLECTION); // start from scratch
  }
  await client.createCollection(COLLECTION, {
    vectors: { size: vectorSize, distance: "Cosine" },
  });
  const points = [];
  for (let i = 0; i < examples.length; i++) {
    points.push({
      id: i,
      vector: await embed(examples[i].text),
      // PAYLOAD: whatever we want to get back later
      payload: { text: examples[i].text, moves: examples[i].moves },
    });
  }
  await client.upsert(COLLECTION, { wait: true, points });
  console.log(`[Qdrant] stored ${points.length} examples`);
}

export type NLUResult = { moves: Move[]; score: number; matched: string | null };

/** Find the most similar example */
export async function searchNLU(
  utterance: string,
  embed: Embedder = transformersEmbedder,
  client: QdrantClient = makeClient(),
  threshold: number = THRESHOLD
): Promise<NLUResult> {
  const vector = await embed(utterance);
  const result = await client.query(COLLECTION, {
    query: vector,
    limit: 1,
    with_payload: true,
  });
  const best = result.points[0];
  if (!best || best.score < threshold) {
    return { moves: [], score: best ? best.score : 0, matched: null };
  }
  const payload = best.payload as { text: string; moves: Move[] };
  return { moves: payload.moves, score: best.score, matched: payload.text };
}

/** Drop-in replacement for nlu() in nlug.ts*/
export async function nluQdrant(utterance: string): Promise<Move[]> {
  return (await searchNLU(utterance)).moves;
}