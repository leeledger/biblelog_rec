import React from 'react';
import ChapterSelector from './ChapterSelector';
import BookCompletionStatus from './BookCompletionStatus';
import Leaderboard from './Leaderboard';
import { User, UserProgress } from '../types';
import { AVAILABLE_BOOKS } from '../constants';

interface DashboardProps {
  currentUser: User;
  userOverallProgress: UserProgress | null;
  totalBibleChapters: number;
  overallCompletedChaptersCount: number;
  
  // Chapter Selector Props
  selectedBookForSelector: string;
  startChapterForSelector: number;
  endChapterForSelector: number;
  // Handler for chapter selection update might be needed if ChapterSelector controls are lifted, 
  // but ChapterSelector manages its own internal state mostly, except for defaults.
  
  onStartReading: (book: string, startCh: number, endCh: number) => void;
  onShowHallOfFame: () => void;
  onBibleReset: () => void;
  
  // View State
  showBookCompletionStatus: boolean;
  setShowBookCompletionStatus: (show: boolean) => void;
  currentView: 'IDLE_SETUP' | 'LEADERBOARD';
  setCurrentView: (view: 'IDLE_SETUP' | 'LEADERBOARD') => void;
  bibleResetLoading: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  userOverallProgress,
  totalBibleChapters,
  overallCompletedChaptersCount,
  selectedBookForSelector,
  startChapterForSelector,
  endChapterForSelector,
  onStartReading,
  onShowHallOfFame,
  onBibleReset,
  showBookCompletionStatus,
  setShowBookCompletionStatus,
  currentView,
  setCurrentView,
  bibleResetLoading
}) => {
  return (
    <>
      {/* Overall Bible Progress Display */}
      {currentUser && totalBibleChapters > 0 && (
        <div className="my-4 p-4 bg-sky-50 border border-sky-200 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-sky-700 mb-2">성경 전체 완독 진행률</h3>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-sky-500 h-4 rounded-full transition-all duration-300 ease-out relative"
              style={{ width: `${totalBibleChapters > 0 ? (overallCompletedChaptersCount / totalBibleChapters) * 100 : 0}%` }}
            >
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {totalBibleChapters > 0 ? ((overallCompletedChaptersCount / totalBibleChapters) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-1.5 text-right">
            {overallCompletedChaptersCount} / {totalBibleChapters} 장 완독
          </p>
        </div>
      )}

      {/* Continue Reading Section */}
      <div className="my-4 p-4 bg-blue-50 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-blue-700">이어 읽기</h3>
        {userOverallProgress && userOverallProgress.lastReadBook ? (
          <p className="text-sm text-gray-600">
            마지막 읽은 곳: {userOverallProgress.lastReadBook} {userOverallProgress.lastReadChapter}장 {userOverallProgress.lastReadVerse}절
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            아직 읽기 기록이 없습니다. 아래에서 시작할 부분을 선택하세요.
          </p>
        )}
        {userOverallProgress && userOverallProgress.lastReadBook && selectedBookForSelector && (
          <p className="text-sm text-gray-500 mt-1">
            추천 시작: {selectedBookForSelector} {startChapterForSelector}장 (아래에서 변경 가능)
          </p>
        )}
      </div>

      <ChapterSelector
        onStartReading={onStartReading}
        defaultBook={selectedBookForSelector}
        defaultStartChapter={startChapterForSelector}
        defaultEndChapter={endChapterForSelector}
        completedChapters={userOverallProgress?.completedChapters}
      />

      {/* Control Buttons */}
      {currentUser && userOverallProgress && (
        <div className="my-8 flex flex-col gap-3 items-center w-full max-w-md mx-auto">
          {/* 권별 완독 현황 보기 버튼 */}
          <button
            onClick={() => setShowBookCompletionStatus(!showBookCompletionStatus)}
            className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-blue-300 to-sky-300 text-white rounded-2xl shadow-lg border border-blue-200 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <span className="text-2xl mr-1">📖</span>
            {showBookCompletionStatus ? '권별 완독 현황 숨기기' : '권별 완독 현황 보기'}
          </button>
          
          {showBookCompletionStatus && (
            <BookCompletionStatus 
              userProgress={userOverallProgress} 
              availableBooks={AVAILABLE_BOOKS} 
            />
          )}

          {/* 함께 걷는 여정 버튼 */}
          <button
            onClick={() => setCurrentView(currentView === 'LEADERBOARD' ? 'IDLE_SETUP' : 'LEADERBOARD')}
            className={`w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-purple-500 via-fuchsia-400 to-pink-300 text-white rounded-2xl shadow-lg border border-purple-200 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-fuchsia-300 ${currentView === 'LEADERBOARD' ? 'ring-2 ring-fuchsia-400' : ''}`}
          >
            <span className="text-2xl mr-1">👣</span>
            {currentView === 'LEADERBOARD' ? '함께 걷는 여정 숨기기' : '함께 걷는 여정 보기'}
          </button>
          
          {currentView === 'LEADERBOARD' && (
            <div className="my-4 p-4 bg-gray-50 rounded-lg shadow w-full">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">👣 함께 걷는 말씀의 발자국</h3>
              <Leaderboard key={userOverallProgress ? `lb-${userOverallProgress.lastReadBook}-${userOverallProgress.lastReadChapter}-${userOverallProgress.lastReadVerse}` : 'lb-no-progress'} />
            </div>
          )}
          
          {/* 명예의 전당 버튼 */}
          <button
            onClick={onShowHallOfFame}
            className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 text-amber-900 rounded-2xl shadow-xl border-2 border-yellow-300 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-amber-300 drop-shadow-glow"
            style={{ boxShadow: '0 0 16px 2px #ffe06655' }}
          >
            <span className="text-2xl mr-1">🏆</span>
            명예의 전당
          </button>

          {/* 다시 시작 버튼 */}
          {(currentUser as any).completed_count > 0 && overallCompletedChaptersCount === totalBibleChapters && (
            <button
              disabled={bibleResetLoading}
              onClick={onBibleReset}
              className="w-full h-14 px-6 text-lg font-bold tracking-tight bg-gradient-to-r from-white via-yellow-100 to-yellow-200 text-amber-700 rounded-2xl border-2 border-amber-300 shadow-xl mt-1 flex items-center justify-center gap-2 transition-transform duration-150 hover:scale-[1.04] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-amber-300 drop-shadow-glow disabled:opacity-60"
              style={{ boxShadow: '0 0 14px 2px #ffe06644' }}
            >
              <span className="text-2xl mr-1">🔄</span>
              {bibleResetLoading ? '재진행 중...' : '다시 말씀 원정 시작하기'}
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default Dashboard;
