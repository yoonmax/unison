import type { RevealedAnswer } from "../types";

export interface AnswerCluster {
  word: string;
  answers: RevealedAnswer[];
}

/**
 * Group a round's answers by exact word, largest group first, preserving the
 * original order otherwise. Purely visual: matching words drift together.
 */
export function clusterAnswers(answers: readonly RevealedAnswer[]): AnswerCluster[] {
  const byWord = new Map<string, AnswerCluster>();
  for (const answer of answers) {
    const cluster = byWord.get(answer.word);
    if (cluster) cluster.answers.push(answer);
    else byWord.set(answer.word, { word: answer.word, answers: [answer] });
  }
  return [...byWord.values()].sort((a, b) => b.answers.length - a.answers.length);
}

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four"];

/** Gentle, non-judgmental one-liner describing how close the group came. */
export function agreementLine(answers: readonly RevealedAnswer[]): string {
  const clusters = clusterAnswers(answers);
  const total = answers.length;
  const biggest = clusters[0]?.answers.length ?? 0;

  if (biggest === total) return "One word. All of you.";
  if (biggest === 1) {
    return total === 2 ? "Two minds, two directions." : "Every mind took its own path.";
  }
  const pairs = clusters.filter((c) => c.answers.length === 2).length;
  if (total === 4 && pairs === 2) return "Two pairs. Getting warmer.";
  const remaining = total - biggest;
  if (remaining === 1) {
    return `${NUMBER_WORDS[biggest]} minds met. One to go.`;
  }
  return "Almost in sync.";
}
