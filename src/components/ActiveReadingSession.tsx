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
  matchedCharCount: number; // ?먯쭊??留ㅼ묶: ?쎌? 湲????
  // Handlers
  onStopReading: () => void;
  onRetryVerse: () => void;
  onExitSession: () => void;
  onStartListening: () => void; // For the "Start Voice Recognition" button in READING state

  sessionCertificationMessage: string;
  onSessionCompleteConfirm: () => void; // Handler for "Other range / Menu" button
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
  onSessionCompleteConfirm
}) => {

  // Case 1: READING state (Preview before listening)
  if (readingState === ReadingState.READING && sessionTargetVerses.length > 0) {
    return (
      <>
        <div className="my-6">
          <h2 className="text-xl font-bold mb-2">?좏깮??踰붿쐞???깃꼍 蹂몃Ц</h2>
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
            ?ㅻ줈媛湲?          </button>
          <button
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
            onClick={onStartListening}
          >
            ?뚯꽦 ?몄떇 ?쒖옉
          </button>
        </div>
      </>
    );
  }

  // Case 2: LISTENING or SESSION_COMPLETED state
  if ((readingState === ReadingState.LISTENING || readingState === ReadingState.SESSION_COMPLETED) && sessionTargetVerses.length > 0) {
    return (
      <>
        <ProgressBar progress={sessionProgress} />

        {/* Main Reading Display */}
        <div className="my-4 p-4 bg-white rounded-lg shadow-md">
          <div className="mb-4">
            <div className="flex justify-between items-baseline mb-1">
              <p className="text-sm text-gray-500">?ㅼ쓬 援ъ젅 ?쎄린:</p>
              {currentTargetVerse && (
                <p className="text-md font-semibold text-indigo-700">
                  {currentTargetVerse.book} {currentTargetVerse.chapter}:{currentTargetVerse.verse}
                </p>
              )}
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <p className="text-xl font-semibold text-black leading-loose">
                {currentTargetVerse ? (
                  <>
                    {/* ?쎌? 遺遺?- 痍⑥냼??*/}
                    <span className="line-through text-gray-400">
                      {currentTargetVerse.text.substring(0, matchedCharCount)}
                    </span>
                    {/* ?꾩쭅 ???쎌? 遺遺?- 媛뺤“ */}
                    <span className="text-black">
                      {currentTargetVerse.text.substring(matchedCharCount)}
                    </span>
                  </>
                ) : (
                  "?쎄린 紐⑺몴 ?놁쓬"
                )}
              </p>
              {showAmenPrompt && hasDifficultWords && (
                <div className="mt-2 p-2 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-md animate-pulse">
                  <p className="font-bold text-center">?몄떇???대젮?뚯슂!</p>
                  <p className="text-sm text-center">"?꾨찘"???몄튂硫??ㅼ쓬 援ъ젅濡??섏뼱媛묐땲??</p>
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
                以묐떒
              </button>
              <button
                className="px-8 py-2 bg-yellow-500 text-white rounded-lg font-bold hover:bg-yellow-600 transition shadow-md"
                onClick={onRetryVerse}
              >
                ?ㅼ떆 ?쎄린
              </button>
            </div>
          )}

          <div className="mb-4">
            <p className="text-sm text-gray-500">?몄떇???뚯꽦:</p>
            <p className="text-md text-gray-700 min-h-[2.5em] p-2 bg-gray-100 rounded-md border">
              {transcript || <span className="text-gray-400 italic">?ｊ퀬 ?덉뒿?덈떎... (留먯???二쇱꽭??</span>}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500">吏湲덇퉴吏 ?쎌? ?댁슜:</p>
            <div className="text-sm text-gray-600 whitespace-pre-wrap p-2 bg-gray-50 rounded-md border max-h-40 overflow-y-auto">
              {matchedVersesContent || <span className="text-gray-400 italic">?꾩쭅 ?쎌? 援ъ젅???놁뒿?덈떎.</span>}
            </div>
          </div>
        </div>

        {readingState === ReadingState.LISTENING && (
          <p className="mt-3 text-xs text-center text-gray-600">?댁슜?????쎌쑝硫??먮룞?쇰줈 吏꾪뻾 ?곹솴????λ맗?덈떎. ?쎄린瑜?以묐떒?섎젮硫?'以묐떒' 踰꾪듉???꾨Ⅴ?몄슂.</p>
        )}

        {readingState === ReadingState.SESSION_COMPLETED && (
          <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 text-center p-6 bg-green-100 border-2 border-green-600 rounded-lg shadow-xl max-w-md w-11/12">
            <h2 className="text-2xl font-bold text-green-700 mb-3">?대쾲 ?몄뀡 ?쎄린 ?꾨즺!</h2>
            <p className="text-lg text-gray-700 mb-4 whitespace-pre-wrap">{sessionCertificationMessage}</p>
            <button
              onClick={onSessionCompleteConfirm}
              className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg shadow transition duration-150 ease-in-out"
            >
              ?ㅻⅨ 踰붿쐞 ?쎄린 ?먮뒗 硫붾돱 蹂닿린
            </button>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default ActiveReadingSession;
