import React from 'react';
import RecognitionDisplay from './RecognitionDisplay'; // While imported, we use inline structure in original App, but better to encapsulate or stick to App structure. 
// Actually, in the original App.tsx, RecognitionDisplay component was imported but the UI was inline.
// We will inline the UI here as well to match the original "Look and Feel" exactly.
import ProgressBar from './ProgressBar';
import { BibleVerse, SessionReadingProgress, ReadingState } from '../types';

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
}

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
  onSessionCompleteConfirm
}) => {

  // Case 1: READING state (Preview before listening)
  if (readingState === ReadingState.READING && sessionTargetVerses.length > 0) {
    return (
      <>
        <div className="my-6">
          <h2 className="text-xl font-bold mb-2">선택한 범위의 성경 본문</h2>
          <div className="bg-gray-50 border rounded-md p-4 max-h-96 overflow-y-auto">
            {sessionTargetVerses.map((v) => (
              <div key={`${v.book}-${v.chapter}-${v.verse}`} className="py-1 border-b last:border-b-0">
                <span className="font-semibold">{v.book} {v.chapter}:{v.verse}</span> <span>{v.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-4 mt-4">
          <button
            className="px-6 py-2 bg-gray-400 text-white rounded-lg font-bold hover:bg-gray-500 transition"
            onClick={onExitSession}
          >
            뒤로가기
          </button>
          <button
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
            onClick={onStartListening}
          >
            음성 인식 시작
          </button>
        </div>
      </>
    );
  }

  // Case 2: LISTENING or SESSION_COMPLETED state
  if ((readingState === ReadingState.LISTENING || readingState === ReadingState.SESSION_COMPLETED || readingState === ReadingState.SAVING) && sessionTargetVerses.length > 0) {
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
                className="text-xl font-semibold text-black leading-loose relative z-10 animate-fade-in-up"
              >
                {currentTargetVerse ? (
                  <>
                    <span className="line-through text-gray-400">
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

              {/* iOS 마이크 복구 버튼 (Rescue Button) */}
              {isStalled && (
                <div className="mt-4 p-4 bg-red-50 border-2 border-red-500 rounded-xl text-center shadow-lg animate-bounce">
                  <p className="font-bold text-red-700 mb-2">🎤 아이폰 마이크가 잠시 쉬고 있어요!</p>
                  <button
                    onClick={onStartListening}
                    className="w-full py-3 bg-red-600 text-white rounded-lg font-bold text-lg shadow-md hover:bg-red-700 transition"
                  >
                    여기 눌러 다시 깨우기
                  </button>
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

          <div className="mb-4">
            <p className="text-sm text-gray-500">인식된 음성:</p>
            <p className="text-md text-gray-700 min-h-[2.5em] p-2 bg-gray-100 rounded-md border">
              {transcript || <span className="text-gray-400 italic">듣고 있습니다... (말씀해 주세요)</span>}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500">지금까지 읽은 내용:</p>
            <div className="text-sm text-gray-600 whitespace-pre-wrap p-2 bg-gray-50 rounded-md border max-h-40 overflow-y-auto">
              {matchedVersesContent || <span className="text-gray-400 italic">아직 읽은 구절이 없습니다.</span>}
            </div>
          </div>
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
