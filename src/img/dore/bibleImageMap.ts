// 구스타브 도레 성경 삽화와 성경 권/장 매핑

interface BibleImageMapping {
  bookId: string;  // 책 ID (창, 출, 레 등)
  chapter?: number; // 특정 장이 있는 경우
  imageFile: string; // 이미지 파일명
  title: string;    // 이미지 제목
}

// 주요 이미지 매핑
export const bibleImageMappings: BibleImageMapping[] = [
  // 창세기
  { bookId: "창", chapter: 1, imageFile: "001_THE_CREATION_OF_EVE.jpg", title: "하와의 창조" },
  { bookId: "창", chapter: 3, imageFile: "002_THE_EXPULSION_FROM_THE_GARDEN.jpg", title: "에덴동산에서의 추방" },
  { bookId: "창", chapter: 4, imageFile: "003_THE_MURDER_OF_ABEL.jpg", title: "아벨의 죽음" },
  { bookId: "창", chapter: 7, imageFile: "004_THE_DELUGE.jpg", title: "대홍수" },
  { bookId: "창", chapter: 9, imageFile: "005_NOAH_CURSING_HAM.jpg", title: "노아가 함을 저주함" },
  { bookId: "창", chapter: 11, imageFile: "006_THE_TOWER_OF_BABEL.jpg", title: "바벨탑" },
  { bookId: "창", chapter: 18, imageFile: "007_ABRAHAM_ENTERTAINS_THREE_STRANGERS.jpg", title: "아브라함과 세 사람" },
  { bookId: "창", chapter: 19, imageFile: "008_THE_DESTRUCTION_OF_SODOM.jpg", title: "소돔의 멸망" },
  { bookId: "창", chapter: 21, imageFile: "009_THE_EXPULSION_OF_HAGAR.jpg", title: "하갈의 추방" },
  { bookId: "창", chapter: 21, imageFile: "010_HAGAR_IN_THE_WILDERESS.jpg", title: "광야의 하갈" },
  { bookId: "창", chapter: 22, imageFile: "011_THE_TRIAL_OF_THE_FAITH_OF_ABRAHAM.jpg", title: "아브라함의 믿음의 시험" },
  { bookId: "창", chapter: 23, imageFile: "012_THE_BURIAL_OF_SARAH.jpg", title: "사라의 장례" },
  { bookId: "창", chapter: 24, imageFile: "013_ELIEZER_AND_REBEKAH.jpg", title: "엘리에셀과 리브가" },
  { bookId: "창", chapter: 27, imageFile: "014_ISAAC_BLESSING_JACOB.jpg", title: "이삭이 야곱을 축복함" },
  { bookId: "창", chapter: 29, imageFile: "015_JACOB_TENDING_THE_FLOCKS.jpg", title: "양떼를 치는 야곱" },
  { bookId: "창", chapter: 37, imageFile: "016_JOSEPH_SOLD_INTO_EGYPT.jpg", title: "애굽에 팔려간 요셉" },
  { bookId: "창", chapter: 41, imageFile: "017_JOSEPH_INTERPRETING_PHARAOHS_DREAM.jpg", title: "요셉이 바로의 꿈을 해석함" },
  { bookId: "창", chapter: 45, imageFile: "018_JOSEPH_MAKING_HIMSELF_KNOWN_TO_HIS_BRETHREN.jpg", title: "형제들에게 자신을 드러내는 요셉" },
  
  // 출애굽기
  { bookId: "출", chapter: 2, imageFile: "019_MOSES_IN_THE_BULRUSHES.jpg", title: "갈대상자 속의 모세" },
  
  // 여호수아
  { bookId: "수", chapter: 10, imageFile: "020_THE_WAR_AGAINST_GIBEON.jpg", title: "기브온 전쟁" },
  
  // 사사기
  { bookId: "삿", chapter: 4, imageFile: "021_SISERA_SLAIN_BY_JAEL.jpg", title: "야엘에게 죽임을 당한 시스라" },
  { bookId: "삿", chapter: 5, imageFile: "022_DEBORAHS_SONG_OF_TRIUMPH.jpg", title: "드보라의 승리의 노래" },
  { bookId: "삿", chapter: 11, imageFile: "023_JEPHTHAH_MET_BY_HIS_DAUGHTER.jpg", title: "딸을 만난 입다" },
  { bookId: "삿", chapter: 11, imageFile: "024_JEPHTHAHS_DAUGHTER_AND_HER_COMPANIONS.jpg", title: "입다의 딸과 그 동료들" },
  { bookId: "삿", chapter: 14, imageFile: "025_SAMSON_SLAYING_THE_LION.jpg", title: "사자를 죽이는 삼손" },
  { bookId: "삿", chapter: 16, imageFile: "026_SAMSON_AND_DELILAH.jpg", title: "삼손과 들릴라" },
  { bookId: "삿", chapter: 16, imageFile: "027_THE_DEATH_OF_SAMSON.jpg", title: "삼손의 죽음" },
  
  // 룻기
  { bookId: "룻", chapter: 1, imageFile: "028_NAOMI_AND_HER_DAUGHTERSINLAW.jpg", title: "나오미와 며느리들" },
  { bookId: "룻", chapter: 2, imageFile: "029_RUTH_AND_BOAZ.jpg", title: "룻과 보아스" },
  
  // 사무엘상
  { bookId: "삼상", chapter: 6, imageFile: "030_THE_RETURN_OF_THE_ARK.jpg", title: "법궤의 귀환" },
  { bookId: "삼상", chapter: 16, imageFile: "031_SAUL_AND_DAVID.jpg", title: "사울과 다윗" },
  { bookId: "삼상", chapter: 24, imageFile: "032_DAVID_SPARING_SAUL.jpg", title: "사울을 살려준 다윗" },
  { bookId: "삼상", chapter: 31, imageFile: "033_DEATH_OF_SAUL.jpg", title: "사울의 죽음" },
  
  // 사무엘하
  { bookId: "삼하", chapter: 18, imageFile: "034_THE_DEATH_OF_ABSALOM.jpg", title: "압살롬의 죽음" },
  { bookId: "삼하", chapter: 19, imageFile: "035_DAVID_MOURNING_OVER_ABSALOM.jpg", title: "압살롬을 애도하는 다윗" },
  
  // 열왕기상
  { bookId: "왕상", chapter: 3, imageFile: "036_SOLOMON.jpg", title: "솔로몬" },
  { bookId: "왕상", chapter: 3, imageFile: "037_THE_JUDGMENT_OF_SOLOMON.jpg", title: "솔로몬의 재판" },
  { bookId: "왕상", chapter: 5, imageFile: "038_THE_CEDARS_DESTINED_FOR_THE_TEMPLE.jpg", title: "성전을 위한 백향목" },
  { bookId: "왕상", chapter: 13, imageFile: "039_THE_PROPHET_SLAIN_BY_A_LION.jpg", title: "사자에게 죽임 당한 선지자" },
  
  // 열왕기하
  { bookId: "왕하", chapter: 1, imageFile: "040_ELIJAH_DESTROYING_THE_MESSENGERS_OF_AHAZIAH.jpg", title: "아하시야의 사자들을 멸한 엘리야" },
  { bookId: "왕하", chapter: 2, imageFile: "041_ELIJAHS_ASCENT_IN_A_CHARIOT_OF_FIRE.jpg", title: "불 수레를 타고 올라간 엘리야" },
  { bookId: "왕하", chapter: 9, imageFile: "042_DEATH_OF_JEZEBEL.jpg", title: "이세벨의 죽음" },
  
  // 에스더
  { bookId: "에", chapter: 7, imageFile: "043_ESTHER_CONFOUNDING_HAMAN.jpg", title: "하만을 당혹케 한 에스더" },
  
  // 이사야
  { bookId: "사", imageFile: "044_ISAIAH.jpg", title: "이사야" },
  { bookId: "사", chapter: 37, imageFile: "045_DESTRUCTION_OF_SENNACHERIBS_HOST.jpg", title: "산헤립 군대의 멸망" },
  
  // 예레미야
  { bookId: "렘", imageFile: "046_BARUCH.jpg", title: "바룩" },
  
  // 에스겔
  { bookId: "겔", imageFile: "047_EZEKIEL_PROPHESYIN.jpg", title: "예언하는 에스겔" },
  { bookId: "겔", chapter: 1, imageFile: "048_THE_VISION_OF_EZEKIEL.jpg", title: "에스겔의 환상" },
  
  // 다니엘
  { bookId: "단", imageFile: "049_DANIEL.jpg", title: "다니엘" },
  { bookId: "단", chapter: 3, imageFile: "050_THE_FIERY_FURNACE.jpg", title: "불타는 풀무" },
  { bookId: "단", chapter: 5, imageFile: "051_BELSHAZZARS_FEAST.jpg", title: "벨사살의 잔치" },
  { bookId: "단", chapter: 6, imageFile: "052_DANIEL_IN_THE_LIONS_DEN.jpg", title: "사자굴의 다니엘" },
  
  // 아모스
  { bookId: "암", imageFile: "053_THE_PROPHET_AMOS.jpg", title: "선지자 아모스" },
  
  // 요나
  { bookId: "욘", chapter: 3, imageFile: "054_JONAH_CALLING_NINEVEH_TO_REPENTANCE.jpg", title: "니느웨를 회개로 부르는 요나" },
  
  // 마태복음
  { bookId: "마", chapter: 1, imageFile: "057_THE_NATIVITY.jpg", title: "예수 탄생" },
  { bookId: "마", chapter: 2, imageFile: "058_THE_STAR_IN_THE_EAST.jpg", title: "동방의 별" },
  { bookId: "마", chapter: 2, imageFile: "059_THE_FLIGHT_INTO_EGYPT.jpg", title: "애굽으로의 도피" },
  { bookId: "마", chapter: 2, imageFile: "060_THE_MASSACRE_OF_THE_INNOCENTS.jpg", title: "무고한 아이들의 학살" },
  { bookId: "마", chapter: 5, imageFile: "063_SERMON_ON_THE_MOUNT.jpg", title: "산상수훈" },
  
  // 마가복음
  { bookId: "막", chapter: 4, imageFile: "064_CHRIST_STILLING_THE_TEMPEST.jpg", title: "폭풍을 잠잠케 하신 그리스도" },
  { bookId: "막", chapter: 6, imageFile: "068_JESUS_WALKING_ON_THE_WATER.jpg", title: "물 위를 걷는 예수님" },
  { bookId: "막", chapter: 12, imageFile: "071_THE_WIDOWS_MITE.jpg", title: "과부의 헌금" },
  { bookId: "막", chapter: 5, imageFile: "072_RAISING_OF_THE_DAUGHTER_OF_JAIRUS.jpg", title: "야이로의 딸을 살리심" },
  
  // 누가복음
  { bookId: "눅", chapter: 2, imageFile: "061_JESUS_QUESTIONING_THE_DOCTORS.jpg", title: "박사들에게 질문하는 예수" },
  { bookId: "눅", chapter: 10, imageFile: "073_THE_GOOD_SAMARITAN.jpg", title: "선한 사마리아인" },
  { bookId: "눅", chapter: 10, imageFile: "074_ARRIVAL_OF_THE_SAMARITAN_AT_THE_INN.jpg", title: "여관에 도착한 사마리아인" },
  { bookId: "눅", chapter: 15, imageFile: "075_THE_PRODIGAL_SON.jpg", title: "탕자" },
  { bookId: "눅", chapter: 16, imageFile: "076_LAZARUS_AND_THE_RICH_MAN.jpg", title: "나사로와 부자" },
  { bookId: "눅", chapter: 18, imageFile: "077_THE_PHARISEE_AND_THE_PUBLICAN.jpg", title: "바리새인과 세리" },
  
  // 요한복음
  { bookId: "요", chapter: 4, imageFile: "078_JESUS_AND_THE_WOMAN_OF_SAMARIA.jpg", title: "예수님과 사마리아 여인" },
  { bookId: "요", chapter: 8, imageFile: "079_JESUS_AND_THE_WOMAN_TAKEN_IN_ADULTERY.jpg", title: "간음하다 잡힌 여인과 예수님" },
  { bookId: "요", chapter: 11, imageFile: "080_THE_RESURRECTION_OF_LAZARUS.jpg", title: "나사로의 부활" },
  
  // 복음서 공통
  { bookId: "마", chapter: 21, imageFile: "069_CHRISTS_ENTRY_INTO_JERUSALEM.jpg", title: "예루살렘 입성" },
  { bookId: "마", chapter: 22, imageFile: "070_JESUS_AND_THE_TRIBUTE_MONEY.jpg", title: "예수님과 세금" },
  { bookId: "마", chapter: 26, imageFile: "082_THE_LAST_SUPPER.jpg", title: "최후의 만찬" },
  { bookId: "마", chapter: 26, imageFile: "083_THE_AGONY_IN_THE_GARDEN.jpg", title: "겟세마네의 고뇌" },
  { bookId: "마", chapter: 26, imageFile: "084_PRAYER_OF_JESUS_IN_THE_GARDEN_OF_OLIVES.jpg", title: "감람산에서의 기도" },
  { bookId: "마", chapter: 26, imageFile: "085_THE_BETRAYAL.jpg", title: "배신" },
  { bookId: "마", chapter: 27, imageFile: "086_CHRIST_FAINTING_UNDER_THE_CROSS.jpg", title: "십자가 아래 쓰러지신 그리스도" },
  { bookId: "마", chapter: 27, imageFile: "087_THE_FLAGELLATION.jpg", title: "채찍질" },
  { bookId: "마", chapter: 27, imageFile: "088_THE_CRUCIFIXION.jpg", title: "십자가 처형" },
  { bookId: "마", chapter: 27, imageFile: "089_CLOSE_OF_THE_CRUCIFIXION.jpg", title: "십자가 처형의 끝" },
  { bookId: "마", chapter: 27, imageFile: "090_THE_BURIAL_OF_JESUS.jpg", title: "예수님의 장례" },
  { bookId: "마", chapter: 28, imageFile: "091_THE_ANGEL_AT_THE_SEPULCHER.jpg", title: "무덤의 천사" },
  { bookId: "마", chapter: 28, imageFile: "092_THE_JOURNEY_TO_EMMAUS.jpg", title: "엠마오로의 여행" },
  { bookId: "마", chapter: 28, imageFile: "093_THE_ASCENSION.jpg", title: "승천" },
  
  // 사도행전
  { bookId: "행", chapter: 7, imageFile: "094_THE_MARTYRDOM_OF_ST_STEPHEN.jpg", title: "스테반의 순교" },
  { bookId: "행", chapter: 9, imageFile: "095_SAULS_CONVERSION.jpg", title: "사울의 회심" },
  { bookId: "행", chapter: 12, imageFile: "096_THE_DELIVERANCE_OF_ST_PETER.jpg", title: "베드로의 구출" },
  { bookId: "행", chapter: 19, imageFile: "097_PAUL_AT_EPHESUS.jpg", title: "에베소의 바울" },
  { bookId: "행", chapter: 21, imageFile: "098_PAUL_MENACED_BY_THE_JEWS.jpg", title: "유대인들에게 위협받는 바울" },
  { bookId: "행", chapter: 27, imageFile: "099_PAULS_SHIPWRECK.jpg", title: "바울의 배 난파" }
];

// 성경 책 기본 이미지 (특정 장이 지정되지 않았을 때 사용)
export const bookDefaultImages: Record<string, string> = {
  "창": "001_THE_CREATION_OF_EVE.jpg",
  "출": "019_MOSES_IN_THE_BULRUSHES.jpg",
  "삿": "025_SAMSON_SLAYING_THE_LION.jpg",
  "룻": "029_RUTH_AND_BOAZ.jpg",
  "삼상": "031_SAUL_AND_DAVID.jpg",
  "삼하": "034_THE_DEATH_OF_ABSALOM.jpg",
  "왕상": "036_SOLOMON.jpg",
  "왕하": "041_ELIJAHS_ASCENT_IN_A_CHARIOT_OF_FIRE.jpg",
  "에": "043_ESTHER_CONFOUNDING_HAMAN.jpg",
  "사": "044_ISAIAH.jpg",
  "렘": "046_BARUCH.jpg",
  "겔": "048_THE_VISION_OF_EZEKIEL.jpg",
  "단": "049_DANIEL.jpg",
  "암": "053_THE_PROPHET_AMOS.jpg",
  "욘": "054_JONAH_CALLING_NINEVEH_TO_REPENTANCE.jpg",
  "마": "057_THE_NATIVITY.jpg",
  "막": "064_CHRIST_STILLING_THE_TEMPEST.jpg",
  "눅": "075_THE_PRODIGAL_SON.jpg",
  "요": "080_THE_RESURRECTION_OF_LAZARUS.jpg",
  "행": "094_THE_MARTYRDOM_OF_ST_STEPHEN.jpg",
};

// 이미지 가져오기 도우미 함수
export function getBibleImage(bookId: string, chapter?: number): string | null {
  // 특정 장에 맞는 이미지 찾기
  if (chapter) {
    const specificImage = bibleImageMappings.find(
      mapping => mapping.bookId === bookId && mapping.chapter === chapter
    );
    
    if (specificImage) {
      return specificImage.imageFile;
    }
  }
  
  // 특정 장에 이미지가 없으면 해당 책의 기본 이미지 반환
  return bookDefaultImages[bookId] || null;
}

// 이미지 제목 가져오기
export function getBibleImageTitle(imageFile: string): string {
  const mapping = bibleImageMappings.find(m => m.imageFile === imageFile);
  if (mapping) {
    return mapping.title;
  }
  
  // 파일 이름에서 제목 추출 (대체 방법)
  const titlePart = imageFile.split('_').slice(1).join('_').replace('.jpg', '');
  return titlePart.split('_').join(' ');
}
