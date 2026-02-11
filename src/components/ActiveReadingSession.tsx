import React from 'react';
import RecognitionDisplay from './RecognitionDisplay'; // While imported, we use inline structure in original App, but better to encapsulate or stick to App structure. 
// Actually, in the original App.tsx, RecognitionDisplay component was imported but the UI was inline.
// We will inline the UI here as well to match the original "Look and Feel" exactly.
import ProgressBar from './ProgressBar';
import { BibleVerse, SessionReadingProgress, ReadingState } from '../types';
import doreMapping from '../data/dore_mapping.json';

interface ActiveReadingSessionProps {
  readingState: ReadingState;
  sessionTargetVerses: BibleVerse[];
  currentTargetVerse: BibleVerse | null;
  sessionProgress: SessionReadingProgress;
  transcript: string;
  matchedVersesContent: string;
  showAmenPrompt: boolean;
  hasDifficultWords: boolean;
  matchedCharCount: number; // 점진적 매칭: 읽은 글자 수

  // Handlers
  onStopReading: () => void;
  onRetryVerse: () => void;
  onExitSession: () => void;
  onStartListening: () => void; // For the "Start Voice Recognition" button in READING state

  sessionCertificationMessage: string;
  isStalled: boolean; // 추가
  onSessionCompleteConfirm: () => void;
  isResume?: boolean; // 추가
  isListening: boolean; // 추가
  isMicWaiting: boolean; // 추가
  sttError?: string | null; // 추가
  // 녹음 모드 관련
  isRecordingEnabled?: boolean;
  onManualNextVerse?: () => void;
  recordingCount?: number;
  isAudioUploading?: boolean;
  audioUploadProgress?: { current: number; total: number } | null;
  onUploadRecordings?: () => void;
}

// 성능 최적화: 읽은 누적 구절 영역을 별도 컴포넌트로 분리하여
// 음성 인식 중(transcript 업데이트 시) 불필요하게 리렌더링되지 않도록 함
// 추가 최적화: 렌더링 시 최근 10개 구절만 표시 (DOM 부하 감소)
const MatchedHistoryDisplay = React.memo(({ content }: { content: string }) => {
  // 전체 내용을 줄 단위로 분리하고 최근 10개만 표시
  const lines = content ? content.trim().split('\n') : [];
  const recentLines = lines.slice(-10); // 마지막 10개만
  const hiddenCount = lines.length - recentLines.length;

  return (
    <div>
      <p className="text-sm text-gray-500 font-medium mb-1">
        지금까지 읽은 내용: {lines.length > 0 && <span className="text-amber-600">({lines.length}절)</span>}
      </p>
      <div className="text-sm text-gray-600 whitespace-pre-wrap p-3 bg-gray-50 rounded-xl border border-gray-100 max-h-40 overflow-y-auto shadow-inner">
        {lines.length === 0 ? (
          <span className="text-gray-400 italic">아직 읽은 구절이 없습니다.</span>
        ) : (
          <>
            {hiddenCount > 0 && (
              <div className="text-xs text-gray-400 mb-2 pb-2 border-b border-gray-200">
                ⋯ {hiddenCount}절 더 읽음
              </div>
            )}
            {recentLines.join('\n')}
          </>
        )}
      </div>
    </div>
  );
});

const ActiveReadingSession: React.FC<ActiveReadingSessionProps> = ({
  readingState,
  sessionTargetVerses,
  currentTargetVerse,
  sessionProgress,
  transcript,
  matchedVersesContent,
  showAmenPrompt,
  hasDifficultWords,
  matchedCharCount,
  onStopReading,
  onRetryVerse,
  onExitSession,
  onStartListening,
  sessionCertificationMessage,
  isStalled, // 추가
  onSessionCompleteConfirm,
  isResume, // 추가
  isListening, // 추가
  isMicWaiting,
  sttError,
  isRecordingEnabled,
  onManualNextVerse,
  recordingCount,
  isAudioUploading,
  audioUploadProgress,
  onUploadRecordings
}) => {
  // 현재 세션 범위 내의 모든 장 정보 추출 및 매칭되는 도레 판화들 찾기
  const matchedDores = React.useMemo(() => {
    if (!sessionTargetVerses || sessionTargetVerses.length === 0) return [];

    // 세션 본문에서 모든 고유한 장 번호 추출
    const chaptersInSession = Array.from(new Set(sessionTargetVerses.map(v => v.chapter)));
    const bookName = sessionTargetVerses[0].book;

    // 해당 권과 장 범위에 맞는 모든 판화 필터링
    return doreMapping.filter(m =>
      m.book === bookName && chaptersInSession.includes(m.chapter)
    ).sort((a, b) => a.chapter - b.chapter || parseInt(a.id) - parseInt(b.id));
  }, [sessionTargetVerses]);

  const hasMultipleImages = matchedDores.length > 1;

  // Case 1: READING state (Preview before listening)
  if (readingState === ReadingState.READING && sessionTargetVerses.length > 0) {
    return (
      <>
        <div className="my-6">
          {/* 도레 판화 전시 (범위 내 매칭되는 모든 판화) */}
          {matchedDores.length > 0 && (
            <div className={`mb-6 animate-fade-in ${hasMultipleImages ? 'relative' : ''}`}>
              {hasMultipleImages && (
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-amber-600">📜</span>
                  <p className="text-sm font-bold text-gray-700 historical-text">이번 통독 범위의 성화들 ({matchedDores.length}장)</p>
                  <p className="text-[10px] text-gray-400 ml-auto">좌우로 밀어서 감상하세요 →</p>
                </div>
              )}

              <div className={`${hasMultipleImages ? 'flex overflow-x-auto gap-4 pb-4 snap-x no-scrollbar' : ''}`}>
                {matchedDores.map((img) => (
                  <div key={img.id} className={`${hasMultipleImages ? 'flex-shrink-0 w-72 snap-center' : 'w-full'}`}>
                    <div className="dore-frame">
                      <div className="dore-image-container max-h-[50vh]">
                        <img
                          src={`/img/dore/images/${img.filename}`}
                          alt={img.title}
                          className="dore-img object-contain"
                          style={{ maxHeight: 'inherit' }}
                        />
                        <div className="dore-overlay">
                          <p className="historical-text text-amber-200 text-[10px] mb-1 uppercase tracking-widest opacity-80">Gustave Doré</p>
                          <h3 className={`historical-text font-bold ${hasMultipleImages ? 'text-lg' : 'text-xl'}`}>{img.title}</h3>
                          <p className="text-gray-300 text-[10px] mt-1">{img.book} {img.chapter}장</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!hasMultipleImages && (
                <p className="text-[10px] text-gray-400 mt-2 text-center italic">※ 이 이미지는 고전 판화가 구스타프 도레의 성경 일러스트입니다.</p>
              )}
            </div>
          )}

          {/* 버튼 영역을 본문 위로 이동하여 스크롤 없이 보이도록 조치 */}
          <div className="flex gap-4 mb-8">
            <button
              className="flex-1 px-6 py-3 bg-gray-400 text-white rounded-xl font-bold hover:bg-gray-500 transition shadow-md"
              onClick={onExitSession}
            >
              뒤로가기
            </button>
            <button
              className="flex-[2] px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg ripple-effect active:scale-95"
              onClick={onStartListening}
            >
              {isResume ? '이어서 읽기' : '선택범위 읽기 시작'}
            </button>
          </div>

          <h2 className="text-xl font-bold mb-2 text-gray-800">선택한 범위의 성경 본문</h2>
          <div className={`bg-white border-2 border-indigo-50 rounded-xl p-4 overflow-y-auto shadow-inner transition-all duration-500 ${matchedDores.length > 0 ? 'max-h-64' : 'max-h-[65vh]'
            }`}>
            {sessionTargetVerses.slice(sessionProgress.sessionInitialSkipCount).map((v) => (
              <div key={`${v.book}-${v.chapter}-${v.verse}`} className="py-2.5 border-b border-gray-100 last:border-b-0">
                <span className="font-bold text-indigo-600 mr-2">{v.book} {v.chapter}:{v.verse}</span>
                <span className="text-gray-800 leading-relaxed text-lg">{v.text}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Case 2: LISTENING, SESSION_COMPLETED, SAVING or PREPARING state
  if ((readingState === ReadingState.LISTENING || readingState === ReadingState.SESSION_COMPLETED || readingState === ReadingState.SAVING || readingState === ReadingState.PREPARING) && (sessionTargetVerses.length > 0 || readingState === ReadingState.PREPARING)) {
    return (
      <>
        <ProgressBar progress={sessionProgress} />

        {/* Main Reading Display */}
        <div className="my-4 p-4 bg-white rounded-lg shadow-md">
          <div className="mb-4">
            <div className="flex justify-between items-baseline mb-1">
              <p className="text-sm text-gray-500">다음 구절 읽기:</p>
              {currentTargetVerse && (
                <p className="text-md font-semibold text-indigo-700">
                  {currentTargetVerse.book} {currentTargetVerse.chapter}:{currentTargetVerse.verse}
                </p>
              )}
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 relative overflow-hidden">
              {/* 마이크 활성 상태 애니메이션 (Heartbeat) */}
              {readingState === ReadingState.LISTENING && !isStalled && (
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-pulse"></div>
              )}

              <p
                key={currentTargetVerse ? `${currentTargetVerse.book}-${currentTargetVerse.chapter}-${currentTargetVerse.verse}` : 'no-verse'}
                className={`text-xl font-semibold text-black leading-loose relative z-10 animate-fade-in-up transition-opacity duration-300 ${!isListening ? 'opacity-30' : 'opacity-100'}`}
              >
                {currentTargetVerse ? (
                  <>
                    <span
                      className="text-amber-900 font-bold"
                      style={{
                        textShadow: isListening ? '0 0 10px rgba(245, 158, 11, 0.8), 0 0 20px rgba(251, 191, 36, 0.5), 0 0 30px rgba(252, 211, 77, 0.3)' : 'none',
                        opacity: isListening ? 0.7 : 0.3,
                        transition: 'all 0.5s ease-out'
                      }}
                    >
                      {currentTargetVerse.text.substring(0, matchedCharCount)}
                    </span>
                    <span className="text-black">
                      {currentTargetVerse.text.substring(matchedCharCount)}
                    </span>
                  </>
                ) : (
                  "읽기 목표 없음"
                )}
              </p>

              {/* 마이크 복구 버튼 (Android/iOS 공통) */}
              {(isStalled || isMicWaiting) && (
                <div className="mt-4 p-4 bg-red-50 border-2 border-red-500 rounded-xl text-center shadow-lg animate-bounce">
                  <p className="font-bold text-red-700 mb-2">🎤 마이크가 응답하지 않아요!</p>
                  <button
                    onClick={onStartListening}
                    className="w-full py-3 bg-red-600 text-white rounded-lg font-bold text-lg shadow-md hover:bg-red-700 transition"
                  >
                    마이크 다시 깨우기
                  </button>
                  <p className="mt-2 text-xs text-red-500 opacity-70">안드로이드에서 드물게 발생하는 현상입니다. 눌러주시면 바로 재시작됩니다.</p>
                </div>
              )}

              {showAmenPrompt && !isStalled && (
                <div className="mt-2 p-2 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-md animate-pulse">
                  <p className="font-bold text-center">인식이 어려우신가요?</p>
                  <p className="text-sm text-center">"아멘"을 외치면 다음 구절로 넘어갑니다.</p>
                </div>
              )}
            </div>
          </div>

          {readingState === ReadingState.LISTENING && (
            <div className="flex justify-center gap-4 my-4">
              <button
                className="px-8 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition shadow-md"
                onClick={onStopReading}
              >
                중단
              </button>
              <button
                className="px-8 py-2 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 transition shadow-md"
                onClick={onRetryVerse}
              >
                다시 읽기
              </button>
            </div>
          )}

          {/* [녹음 특화 UI] 녹음 모드라면 수동 이동 버튼 표시, 아니면 기존 STT 창 표시 */}
          <div className="mb-4">
            {isRecordingEnabled ? (
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                    <span className="text-sm font-bold text-indigo-900">고품질 녹음 중...</span>
                  </div>
                  <p className="text-xs text-indigo-400">말씀을 다 읽으셨다면 아래 버튼을 눌러주세요</p>
                </div>

                <button
                  onClick={onManualNextVerse}
                  className="w-full py-8 bg-indigo-600 text-white rounded-3xl text-2xl font-black shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-3 hover:bg-indigo-700"
                >
                  <span className="text-3xl">✅</span> 다음 절 읽기 완료
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm text-gray-500 font-medium">인식된 음성:</p>
                  {readingState === ReadingState.LISTENING && (
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${isListening ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600 animate-pulse'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      {isListening ? '마이크 활성 중' : '마이크 연결 중...'}
                    </div>
                  )}
                </div>
                <p className={`text-md text-gray-700 min-h-[2.5em] p-3 rounded-xl border transition-all duration-300 ${isListening ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                  {transcript || <span className="text-gray-400 italic">{isListening ? '지금 읽어주세요...' : '마이크를 깨우고 있습니다...'}</span>}
                </p>
              </>
            )}
            {sttError && !isRecordingEnabled && (
              <div className="mt-2 text-xs text-red-500 font-bold animate-pulse text-center">
                ⚠️ {sttError}
              </div>
            )}
          </div>

          <MatchedHistoryDisplay content={matchedVersesContent} />
        </div>

        {readingState === ReadingState.LISTENING && (
          <p className="mt-3 text-xs text-center text-gray-600">내용을 다 읽으면 자동으로 진행 상황이 저장됩니다. 읽기를 중단하려면 '중단' 버튼을 누르세요.</p>
        )}

        {readingState === ReadingState.SAVING && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl text-center max-w-xs w-full mx-4 transform animate-in zoom-in-95 duration-300">
              <div className="mb-4 flex justify-center">
                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              </div>
              <h2 className="text-xl font-black text-gray-800 mb-2">진도 저장 중</h2>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                오늘의 통독 여정을 안전하게<br />기록하고 있습니다. 잠시만 기다려주세요.
              </p>
            </div>
          </div>
        )}

        {readingState === ReadingState.PREPARING && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl text-center max-w-xs w-full mx-4 transform animate-in zoom-in-95 duration-300">
              <div className="mb-6 flex justify-center">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-amber-100 border-t-amber-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl animate-pulse">🎤</span>
                  </div>
                </div>
              </div>
              <h2 className="text-xl font-black text-gray-800 mb-2">마이크 준비 중</h2>
              <p className="text-sm text-gray-500 font-medium leading-relaxed mb-4">
                아이폰에서 마이크 권장 설정을<br />확인하고 있습니다.
              </p>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full w-2/3 animate-[loading_2s_ease-in-out_infinite]"></div>
              </div>
              <p className="mt-4 text-[11px] text-amber-600 font-bold bg-amber-50 py-2 px-3 rounded-xl">
                팝업이 뜨면 '허용'을 눌러주세요
              </p>
            </div>
          </div>
        )}

        {readingState === ReadingState.SESSION_COMPLETED && (
          <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 text-center p-6 bg-green-100 border-2 border-green-600 rounded-lg shadow-xl max-w-md w-11/12">
            <h2 className="text-2xl font-bold text-green-700 mb-3">이번 세션 읽기 완료!</h2>
            <p className="text-lg text-gray-700 mb-4 whitespace-pre-wrap">{sessionCertificationMessage}</p>
            <button
              onClick={onSessionCompleteConfirm}
              className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg shadow transition duration-150 ease-in-out"
            >
              다른 범위 읽기 또는 메뉴 보기
            </button>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default ActiveReadingSession;
