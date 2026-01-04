import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname 구현 (ES 모듈에서는 기본적으로 제공되지 않음)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 성경 파일 읽기
const biblePath = path.join(__dirname, 'public', 'bible_hierarchical.json');
const bibleData = JSON.parse(fs.readFileSync(biblePath, 'utf8'));

// 단어 추출 및 빈도 계산을 위한 맵
const wordFrequency = new Map();

// 정규식 패턴: 한글 단어 추출 (2음절 이상)
const koreanWordPattern = /[\uAC00-\uD7A3]+/g;

// 제외할 일반적인 단어들 (예시)
const commonWords = new Set([
  '그리고', '그러나', '그러므로', '그런데', '그리하여',
  '그것은', '그것이', '그것을', '그것의', '그들은', '그들이', '그들을',
  '이것은', '이것이', '이것을', '이것의', '우리는', '우리가', '우리를',
  '너희는', '너희가', '너희를', '그러니', '그러면', '그러하여',
  '아니라', '아니면', '아니하고', '이러하니', '이러하매'
]);

// 고어체 표현 감지를 위한 정규식 패턴들
const archaicPatterns = [
  /가라사대/,   // "말씀하시되"의 고어체
  /하시매/,     // "하시니"의 고어체
  /하셨으니/,   // "하셨으니"
  /하시니라/,   // "하셨다"의 고어체
  /더라/,       // ~했더라 (과거형 고어체 어미)
  /리라/,       // ~하리라 (미래형 고어체 어미)
  /니라/,       // ~이니라, ~하니라 (고어체 종결 어미)
  /하여금/,     // ~하게 하다 (고어체)
  /지라/,       // ~하더라 (과거 서술형 고어체)
  /하되/,       // ~하면서 (고어체)
  /하심이/,     // ~하심이 (고어체)
  /거늘/,       // ~했는데 (고어체)
  /이었으되/,   // ~이었지만 (고어체)
  /이었으니/    // ~이었으니 (고어체)
];

// 모든 성경 구절 순회
for (const book in bibleData) {
  for (const chapter in bibleData[book]) {
    for (const verse in bibleData[book][chapter]) {
      const text = bibleData[book][chapter][verse];
      
      // 한글 단어 추출
      const words = text.match(koreanWordPattern) || [];
      
      // 각 단어 처리
      words.forEach(word => {
        // 일반적인 단어 제외
        if (commonWords.has(word)) return;
        
        // 길이가 2 미만인 단어 제외 (한글자 단어는 대부분 쉬움)
        if (word.length < 2) return;
        
        // 고어체 패턴 확인
        const isArchaicWord = archaicPatterns.some(pattern => pattern.test(word));
        
        // 4음절 이상이거나 고어체 표현을 포함하는 단어 추가
        if (word.length >= 4 || isArchaicWord) {
          wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        }
      });
    }
  }
}

// 빈도수에 따라 정렬
const sortedWords = [...wordFrequency.entries()]
  .sort((a, b) => b[1] - a[1])  // 빈도수 기준 내림차순
  .map(([word]) => word);       // 단어만 추출

// 중복 제거 및 알파벳 순 정렬
const uniqueWords = [...new Set(sortedWords)].sort();

// 결과 저장
const outputPath = path.join(__dirname, 'difficult_words_new.ts');
const outputContent = `export const DIFFICULT_WORDS = [\n  "${uniqueWords.join('",\n  "')}"\n];\n`;

fs.writeFileSync(outputPath, outputContent, 'utf8');

console.log(`총 ${uniqueWords.length}개의 어려운 단어를 찾아 ${outputPath}에 저장했습니다.`);
