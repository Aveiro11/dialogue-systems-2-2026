import { describe, expect, test } from "vitest";
import { seedQdrant, searchNLU, Embedder } from "../src/nlu_qdrant";

/**
 * This test uses a real Qdrant server.
 * If Qdrant is not running, the tests are skipped.
 *
 * I use a small fake embedder instead of the real language model
 * to keep the test fast. It lets me test the full pipeline:
 * seed -> search -> payload -> moves / threshold.
 */

const url = process.env.QDRANT_URL ?? "http://localhost:6333";
let qdrantIsUp = false;
try {
  qdrantIsUp = (await fetch(url)).ok;
} catch {
  qdrantIsUp = false;
}

const fakeEmbedder: Embedder = async (text) => {
  const vector = new Array(384).fill(0);
  for (const word of text.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ")) {
    if (!word) continue;
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % 384;
    vector[h] += 1;
  }
  const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0)) || 1;
  return vector.map((x) => x / norm);
};

describe.skipIf(!qdrantIsUp)("VG-B: Qdrant NLU", () => {
  test("seed the collection", async () => {
    await seedQdrant(fakeEmbedder);
  });

  test("exact example -> ask(booking_room)", async () => {
    const r = await searchNLU("Where is the lecture?", fakeEmbedder);
    expect(r.moves).toEqual([
      { type: "ask", content: { type: "whq", predicate: "booking_room" } },
    ]);
  });

  test("paraphrase -> ask(booking_room)", async () => {
    const r = await searchNLU("which room is the lecture held in", fakeEmbedder);
    expect(r.moves[0]).toEqual({
      type: "ask",
      content: { type: "whq", predicate: "booking_room" },
    });
  });

  test("short answer -> answer(friday)", async () => {
    const r = await searchNLU("Friday", fakeEmbedder);
    expect(r.moves).toEqual([{ type: "answer", content: "friday" }]);
  });

  test("nonsense -> [] (not understood)", async () => {
    const r = await searchNLU("bla bla", fakeEmbedder);
    expect(r.moves).toEqual([]);
  });
});