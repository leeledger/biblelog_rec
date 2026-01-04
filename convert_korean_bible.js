const fs = require('fs');
const path = require('path');

// 성경 책 약어 매핑 테이블
const bookAbbreviations = {
  '1': { fullName: '창세기', abbr: '창' },
  '2': { fullName: '출애굽기', abbr: '출' },
  '3': { fullName: '레위기', abbr: '레' },
  '4': { fullName: '민수기', abbr: '민' },
  '5': { fullName: '신명기', abbr: '신' },
  '6': { fullName: '여호수아', abbr: '수' },
  '7': { fullName: '사사기', abbr: '삿' },
  '8': { fullName: '룻기', abbr: '룻' },
  '9': { fullName: '사무엘상', abbr: '삼상' },
  '10': { fullName: '사무엘하', abbr: '삼하' },
  '11': { fullName: '열왕기상', abbr: '왕상' },
  '12': { fullName: '열왕기하', abbr: '왕하' },
  '13': { fullName: '역대상', abbr: '대상' },
  '14': { fullName: '역대하', abbr: '대하' },
  '15': { fullName: '에스라', abbr: '스' },
  '16': { fullName: '느헤미야', abbr: '느' },
  '17': { fullName: '에스더', abbr: '에' },
  '18': { fullName: '욥기', abbr: '욥' },
  '19': { fullName: '시편', abbr: '시' },
  '20': { fullName: '잠언', abbr: '잠' },
  '21': { fullName: '전도서', abbr: '전' },
  '22': { fullName: '아가', abbr: '아' },
  '23': { fullName: '이사야', abbr: '사' },
  '24': { fullName: '예레미야', abbr: '렘' },
  '25': { fullName: '예레미야애가', abbr: '애' },
  '26': { fullName: '에스겔', abbr: '겔' },
  '27': { fullName: '다니엘', abbr: '단' },
  '28': { fullName: '호세아', abbr: '호' },
  '29': { fullName: '요엘', abbr: '욜' },
  '30': { fullName: '아모스', abbr: '암' },
  '31': { fullName: '오바댜', abbr: '옵' },
  '32': { fullName: '요나', abbr: '욘' },
  '33': { fullName: '미가', abbr: '미' },
  '34': { fullName: '나훔', abbr: '나' },
  '35': { fullName: '하박국', abbr: '합' },
  '36': { fullName: '스바냐', abbr: '습' },
  '37': { fullName: '학개', abbr: '학' },
  '38': { fullName: '스가랴', abbr: '슥' },
  '39': { fullName: '말라기', abbr: '말' },
  '40': { fullName: '마태복음', abbr: '마' },
  '41': { fullName: '마가복음', abbr: '막' },
  '42': { fullName: '누가복음', abbr: '눅' },
  '43': { fullName: '요한복음', abbr: '요' },
  '44': { fullName: '사도행전', abbr: '행' },
  '45': { fullName: '로마서', abbr: '롬' },
  '46': { fullName: '고린도전서', abbr: '고전' },
  '47': { fullName: '고린도후서', abbr: '고후' },
  '48': { fullName: '갈라디아서', abbr: '갈' },
  '49': { fullName: '에베소서', abbr: '엡' },
  '50': { fullName: '빌립보서', abbr: '빌' },
  '51': { fullName: '골로새서', abbr: '골' },
  '52': { fullName: '데살로니가전서', abbr: '살전' },
  '53': { fullName: '데살로니가후서', abbr: '살후' },
  '54': { fullName: '디모데전서', abbr: '딤전' },
  '55': { fullName: '디모데후서', abbr: '딤후' },
  '56': { fullName: '디도서', abbr: '딛' },
  '57': { fullName: '빌레몬서', abbr: '몬' },
  '58': { fullName: '히브리서', abbr: '히' },
  '59': { fullName: '야고보서', abbr: '약' },
  '60': { fullName: '베드로전서', abbr: '벧전' },
  '61': { fullName: '베드로후서', abbr: '벧후' },
  '62': { fullName: '요한일서', abbr: '요일' },
  '63': { fullName: '요한이서', abbr: '요이' },
  '64': { fullName: '요한삼서', abbr: '요삼' },
  '65': { fullName: '유다서', abbr: '유' },
  '66': { fullName: '요한계시록', abbr: '계' }
};

// 파일 경로
const inputFilePath = path.join(__dirname, '개역한글판.txt');
const outputBibleJsonPath = path.join(__dirname, 'public', 'bible.json');
const outputHierarchicalJsonPath = path.join(__dirname, 'public', 'bible_hierarchical.json');

// 텍스트 파일 읽기
const fileContent = fs.readFileSync(inputFilePath, 'utf8');
const lines = fileContent.split('\n');

// 파싱을 위한 변수들
let currentBook = '';
let currentBookAbbr = '';
let currentChapter = '';
let bibleJson = {};
let hierarchicalJson = {};
let currentBookNumber = 0;

// 각 줄 처리
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // 장 구분 확인 (예: "1장")
  const chapterMatch = line.match(/^(\d+)장$/);
  if (chapterMatch) {
    currentChapter = chapterMatch[1];
    console.log(`처리 중: ${currentBookAbbr} ${currentChapter}장`);
    
    // 계층적 JSON에 장 추가
    if (!hierarchicalJson[currentBookAbbr]) {
      hierarchicalJson[currentBookAbbr] = {};
    }
    hierarchicalJson[currentBookAbbr][currentChapter] = {};
    continue;
  }
  
  // 책 구분 확인 (특별한 패턴이 없으므로 수동으로 처리해야 할 수 있음)
  // 여기서는 예시로 파일 내에 책 구분이 명확하지 않으므로 
  // 첫 번째 책(창세기)부터 시작한다고 가정
  if (currentBook === '' && currentChapter === '' && line === '') {
    currentBookNumber = 1;
    currentBook = bookAbbreviations[currentBookNumber].fullName;
    currentBookAbbr = bookAbbreviations[currentBookNumber].abbr;
    console.log(`시작: ${currentBook} (${currentBookAbbr})`);
    continue;
  }
  
  // 절 구분 확인 (예: "1 태초에...")
  const verseMatch = line.match(/^(\d+)\s+(.+)$/);
  if (verseMatch && currentChapter) {
    const verseNumber = verseMatch[1];
    const verseContent = verseMatch[2];
    
    // bible.json 형식으로 추가
    const key = `${currentBookAbbr}${currentChapter}:${verseNumber}`;
    bibleJson[key] = verseContent;
    
    // bible_hierarchical.json 형식으로 추가
    hierarchicalJson[currentBookAbbr][currentChapter][verseNumber] = verseContent;
  }
}

// JSON 파일로 저장
fs.writeFileSync(outputBibleJsonPath, JSON.stringify(bibleJson, null, 2));
fs.writeFileSync(outputHierarchicalJsonPath, JSON.stringify(hierarchicalJson, null, 2));

console.log('변환 완료!');
console.log(`bible.json 저장됨: ${outputBibleJsonPath}`);
console.log(`bible_hierarchical.json 저장됨: ${outputHierarchicalJsonPath}`);
