/**
 * VG-B demo
 */
import { seedQdrant, searchNLU, THRESHOLD } from "../src/nlu_qdrant";

const tryThese = [
  "where is the lecture?", // exactly one of the examples
  "in which room do I have my class", // a paraphrase the system has never seen
  "what kind of food do you enjoy", // paraphrase of the food question
  "friday please", // answer with extra words
  "dialogue systems two", // answer spelled differently
  "bla bla", // nonsense: should be below the threshold
];

console.log("Threshold:", THRESHOLD);
console.log("Seeding Qdrant (the first run also downloads the language model)...");
await seedQdrant();

for (const utterance of tryThese) {
  const r = await searchNLU(utterance);
  console.log(
    `\n"${utterance}"\n  score:   ${r.score.toFixed(3)}\n  matched: ${r.matched}\n  moves:   ${JSON.stringify(r.moves)}`
  );
}