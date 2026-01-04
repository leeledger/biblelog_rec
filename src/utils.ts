import { DIFFICULT_WORDS as DIFFICULT_WORDS_MAIN } from "./difficult_words";
import { DIFFICULT_WORDS as DIFFICULT_WORDS_BIBLICAL } from "./difficult_words_back";

// 두 파일의 어려운 단어 목록을 병합
const DIFFICULT_WORDS = [...DIFFICULT_WORDS_MAIN, ...DIFFICULT_WORDS_BIBLICAL];

/**
 * Normalizes text by removing whitespace and punctuation.
 * @param text The text to normalize.
 * @returns The normalized text.
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s\.\!\?\,\(\)\[\]\{\}\:\"\']/g, '');
}

export function containsDifficultWord(text: string): boolean {
  return DIFFICULT_WORDS.some(word => text.includes(word));
}

// Utility functions

/**
 * Calculates the Levenshtein distance between two strings.
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns The Levenshtein distance.
 */
export function calculateLevenshteinDistance(s1: string, s2: string): number {
  if (s1.length < s2.length) {
    return calculateLevenshteinDistance(s2, s1);
  }

  if (s2.length === 0) {
    return s1.length;
  }

  const previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);

  for (let i = 0; i < s1.length; i++) {
    const s1Char = s1[i];
    const currentRow = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      const s2Char = s2[j];
      const insertions = previousRow[j + 1] + 1;
      const deletions = currentRow[j] + 1;
      const substitutions = previousRow[j] + (s1Char === s2Char ? 0 : 1);

      currentRow.push(Math.min(insertions, deletions, substitutions));
    }
    for (let k = 0; k < previousRow.length; k++) {
      previousRow[k] = currentRow[k];
    }
  }

  return previousRow[s2.length];
}

/**
 * Calculates the similarity between a target string and a buffer string.
 */
export function calculateSimilarity(targetText: string, bufferTextToSearch: string): number {
  const L_target = targetText.length;
  const L_buffer = bufferTextToSearch.length;

  if (L_target === 0) return 100;
  if (L_buffer === 0 && L_target > 0) return 0;

  const distance = calculateLevenshteinDistance(targetText, bufferTextToSearch);
  let coreEdits = distance - Math.max(0, L_buffer - L_target);
  coreEdits = Math.max(0, coreEdits);

  let similarityScore = ((L_target - coreEdits) / L_target) * 100;
  if (coreEdits > L_target) {
    similarityScore = 0;
  }

  return Math.max(0, Math.min(100, similarityScore));
}

/**
 * 구절 텍스트에서 인식된 텍스트가 어느 지점까지 읽혔는지 찾습니다.
 * 슬라이딩 윈도우 방식을 사용하여 중간부터 읽기나 누적되지 않는 결과에도 대응합니다.
 */
export function findMatchedPrefixLength(
  verseText: string,
  recognizedText: string,
  similarityThreshold: number = 70
): number {
  if (!verseText || !recognizedText) return 0;

  const normalizedVerse = normalizeText(verseText);
  const normalizedRecognized = normalizeText(recognizedText);

  if (normalizedRecognized.length === 0) return 0;
  if (normalizedVerse.length === 0) return 0;

  const charToOriginalIndex: number[] = [];
  for (let i = 0; i < verseText.length; i++) {
    const char = verseText[i];
    if (!/[\s\.\!\?\,\(\)\[\]\{\}\:\"\']/g.test(char)) {
      charToOriginalIndex.push(i);
    }
  }

  let bestNormalizedIndex = 0;
  let highestSimilarity = 0;

  const windowSize = normalizedRecognized.length;

  // 전체 구절에서 인식된 텍스트와 가장 유사한 구간 검색
  for (let i = 1; i <= normalizedVerse.length; i++) {
    const segmentStart = Math.max(0, i - windowSize);
    const verseSegment = normalizedVerse.substring(segmentStart, i);
    const similarity = calculateSimilarity(verseSegment, normalizedRecognized);

    if (similarity >= similarityThreshold && similarity >= highestSimilarity) {
      highestSimilarity = similarity;
      bestNormalizedIndex = i;
    }
  }

  // 폴백: 끝 단어가 명확하게 포함된 지점 검색
  if (highestSimilarity < similarityThreshold) {
    const lastPartLen = Math.min(normalizedRecognized.length, 5);
    if (lastPartLen >= 2) {
      const lastPart = normalizedRecognized.slice(-lastPartLen);
      const idx = normalizedVerse.indexOf(lastPart);
      if (idx !== -1) {
        bestNormalizedIndex = idx + lastPart.length;
      }
    }
  }

  if (bestNormalizedIndex > 0 && bestNormalizedIndex <= charToOriginalIndex.length) {
    return charToOriginalIndex[bestNormalizedIndex - 1] + 1;
  }

  return 0;
}