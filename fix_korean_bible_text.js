const fs = require('fs');
const path = require('path');

// 파일 경로
const inputFilePath = path.join(__dirname, '개역한글판.txt');
const outputFilePath = path.join(__dirname, '개역한글판_fixed.txt');

// 텍스트 파일 읽기
const fileContent = fs.readFileSync(inputFilePath, 'utf8');
const lines = fileContent.split('\n');

// 수정된 내용을 저장할 배열
const modifiedLines = [];

// 장 번호 패턴
const chapterPattern = /^(\d+)장$/;

// 절 번호 패턴
const versePattern = /^(\d+)\s+(.+)$/;

let isAfterChapter = false;
let skipEmptyLines = 0;

// 각 줄 처리
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // 장 번호 확인
  if (chapterPattern.test(line)) {
    isAfterChapter = true;
    skipEmptyLines = 0;
    modifiedLines.push(line);
    continue;
  }
  
  // 빈 줄 처리
  if (line === '') {
    modifiedLines.push(line);
    if (isAfterChapter) {
      skipEmptyLines++;
    }
    continue;
  }
  
  // 장 번호 다음에 나오는 텍스트가 절 번호 없이 시작하면, "1 "을 앞에 추가
  if (isAfterChapter && skipEmptyLines > 0 && !versePattern.test(line)) {
    console.log(`절 번호 추가: "${line}" -> "1 ${line}"`);
    modifiedLines.push(`1 ${line}`);
    isAfterChapter = false;
  } else {
    modifiedLines.push(line);
    isAfterChapter = false;
  }
}

// 수정된 내용을 파일로 저장
fs.writeFileSync(outputFilePath, modifiedLines.join('\n'));

console.log(`수정 완료! 결과 파일: ${outputFilePath}`);
