import React from 'react';
import ChapterSelector from './ChapterSelector';
import BookCompletionStatus from './BookCompletionStatus';
import BibleTreeStatus from './BibleTreeStatus';
import Leaderboard from './Leaderboard';
import GroupManagement from './GroupManagement';
import { User, UserProgress, Group } from '../types';
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
  startVerseForSelector: number;

  onStartReading: (book: string, startCh: number, endCh: number, startVerse?: number) => void;
  onShowHallOfFame: () => void;
  onBibleReset: () => void;

  // View State
  showBookCompletionStatus: boolean;
  setShowBookCompletionStatus: (show: boolean) => void;
  currentView: 'IDLE_SETUP' | 'LEADERBOARD';
  setCurrentView: (view: 'IDLE_SETUP' | 'LEADERBOARD') => void;
  bibleResetLoading: boolean;
  isLoading: boolean;

  // Group Props
  userGroups: Group[];
  selectedGroupId: number | null;
  onSelectGroup: (groupId: number | null) => void;
  onGroupAction: () => Promise<void>;
}


const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  userOverallProgress,
  totalBibleChapters,
  overallCompletedChaptersCount,
  selectedBookForSelector,
  startChapterForSelector,
  endChapterForSelector,
  startVerseForSelector,
  onStartReading,
  onShowHallOfFame,
  onBibleReset,
  showBookCompletionStatus,
  setShowBookCompletionStatus,
  currentView,
  setCurrentView,
  bibleResetLoading,
  isLoading,
  userGroups,
  selectedGroupId,
  onSelectGroup,
  onGroupAction
}) => {
  const [showGroupModal, setShowGroupModal] = React.useState(false);
  const activeGroup = userGroups.find(g => g.id === selectedGroupId);

  return (
    <>
      {/* 말씀의 열매 맺기 진행률 - 새로운 테마 적용 */}
      {currentUser && totalBibleChapters > 0 && (
        <div className="my-6 p-6 bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-100 rounded-[2rem] shadow-lg shadow-emerald-100/50 relative overflow-hidden group">
          {/* 장식용 배경 나뭇잎 아이콘 (선택 사항) */}
          <div className="absolute top-[-10px] right-[-10px] text-4xl opacity-10 rotate-12 group-hover:rotate-45 transition-transform duration-700">🌿</div>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl animate-pulse">🌳</span>
            <h3 className="text-lg font-bold text-emerald-800 tracking-tight">생명의 말씀 나무 열매 맺기</h3>
          </div>

          <div className="relative h-6 w-full bg-emerald-900/10 rounded-full p-1 border border-emerald-200 shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all duration-1000 ease-out relative group"
              style={{ width: `${totalBibleChapters > 0 ? (overallCompletedChaptersCount / totalBibleChapters) * 100 : 0}%` }}
            >
              {/* 진행 바 위의 은은한 광택 효과 */}
              <div className="absolute inset-0 bg-white/20 rounded-full animate-radiant"></div>

              {/* 끝부분 열매 포인트 */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-amber-500 rounded-full border-2 border-white shadow-md animate-bounce-subtle"></div>
            </div>
          </div>

          <div className="flex justify-between items-end mt-3 px-1">
            <div className="flex flex-col">
              <p className="text-[11px] text-emerald-600 font-bold uppercase tracking-widest">Growth Progress</p>
              <p className="text-2xl font-black text-emerald-900 leading-none">
                {totalBibleChapters > 0 ? ((overallCompletedChaptersCount / totalBibleChapters) * 100).toFixed(1) : '0.0'}
                <span className="text-sm font-bold ml-0.5">%</span>
              </p>
            </div>
            <p className="text-sm font-bold text-emerald-700/80 mb-0.5">
              전체 1,189장 중 <span className="text-emerald-900 underline decoration-amber-400 decoration-2 underline-offset-4">{overallCompletedChaptersCount}장</span> 결실
            </p>
          </div>
        </div>
      )}

      {/* 여정 및 범위 선택 카드 통합 */}
      <div className="mt-8 mb-8 overflow-hidden rounded-3xl border border-indigo-100 shadow-xl">
        {/* 상단: 그룹/여정 선택 영역 */}
        <div className="p-5 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black flex items-center gap-2">
              <span className="text-2xl">📍</span> 그룹 선택
            </h3>
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 text-sm font-black rounded-xl hover:bg-indigo-50 active:scale-95 transition-all shadow-lg"
            >
              <span>⚙️</span> 그룹 관리
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => onSelectGroup(null)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${selectedGroupId === null ? 'bg-white text-indigo-700 shadow-md' : 'bg-indigo-500 bg-opacity-30 text-indigo-100 hover:bg-opacity-40'}`}
            >
              개인 통독
            </button>
            {userGroups.map(group => (
              <button
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${selectedGroupId === group.id ? 'bg-white text-indigo-700 shadow-md' : 'bg-indigo-500 bg-opacity-30 text-indigo-100 hover:bg-opacity-40'}`}
              >
                🏢 {group.name}
              </button>
            ))}
          </div>

          {activeGroup && (
            <div className="mt-4 bg-black bg-opacity-10 p-3 rounded-xl flex justify-between items-center text-xs">
              <span className="font-bold">초대 코드: <strong className="select-all text-white font-mono tracking-wider ml-1">{activeGroup.invite_code}</strong></span>
              <span className="opacity-70">그룹장: {activeGroup.owner_id === currentUser.id ? '나 (관리자)' : (activeGroup.owner_name || '동역자')}</span>
            </div>
          )}

          {userGroups.length === 0 && (
            <p className="mt-3 text-[11px] text-indigo-100 opacity-80 italic">
              * 동역자들과 함께하고 싶다면 <strong>'그룹 관리'</strong>에서 공동체를 만드세요!
            </p>
          )}

          {/* 마지막 읽은 위치 표시 - 그룹 선택 영역 내 */}
          {userOverallProgress && (
            <div className="mt-4 bg-white bg-opacity-15 backdrop-blur-sm p-3 rounded-xl border border-white border-opacity-20">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📖</span>
                <div>
                  <p className="text-[11px] text-indigo-100 opacity-80">
                    {selectedGroupId ? `${activeGroup?.name || '그룹'}에서` : '개인 통독'} 마지막 읽은 곳
                  </p>
                  <p className="text-base font-black text-white">
                    {userOverallProgress.lastReadBook
                      ? `${userOverallProgress.lastReadBook} ${userOverallProgress.lastReadChapter}장 ${userOverallProgress.lastReadVerse || 1}절`
                      : '아직 기록이 없어요'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 하단: 범위 선택 (ChapterSelector) */}
        <div className="bg-white">
          <ChapterSelector
            onStartReading={onStartReading}
            defaultBook={selectedBookForSelector}
            defaultStartChapter={startChapterForSelector}
            defaultEndChapter={endChapterForSelector}
            defaultStartVerse={startVerseForSelector}
            completedChapters={userOverallProgress?.completedChapters}
            isLoading={isLoading}
          />
        </div>
      </div>

      <GroupManagement
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        currentUser={currentUser}
        userGroups={userGroups}
        onGroupAction={onGroupAction}
      />

      {/* Control Buttons */}
      {currentUser && userOverallProgress && (
        <div className="my-8 flex flex-col gap-4 items-center w-full mx-auto">
          <button
            onClick={() => setShowBookCompletionStatus(!showBookCompletionStatus)}
            className="w-full h-16 px-6 text-xl font-black bg-gradient-to-r from-emerald-500 to-teal-400 text-white rounded-3xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <span>🌳</span>
            {showBookCompletionStatus ? '현황 숨기기' : '생명의 말씀 나무'}
          </button>

          {showBookCompletionStatus && (
            <div className="w-full animate-in slide-in-from-top duration-300">
              <BibleTreeStatus
                userProgress={userOverallProgress}
              />
            </div>
          )}

          <button
            onClick={() => setCurrentView(currentView === 'LEADERBOARD' ? 'IDLE_SETUP' : 'LEADERBOARD')}
            className={`w-full h-16 px-6 text-xl font-black bg-gradient-to-r from-purple-600 to-pink-400 text-white rounded-3xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 ${currentView === 'LEADERBOARD' ? 'ring-4 ring-pink-200' : ''}`}
          >
            <span>👣</span>
            {currentView === 'LEADERBOARD' ? '순위표 닫기' : '함께 걷는 여정'}
          </button>

          {currentView === 'LEADERBOARD' && (
            <div className="my-4 p-4 bg-white rounded-3xl shadow-xl border border-gray-100 w-full animate-in slide-in-from-top duration-300">
              <Leaderboard
                key={`lb-${selectedGroupId}`}
                groupId={selectedGroupId}
              />
            </div>
          )}

          <button
            onClick={onShowHallOfFame}
            className="w-full h-16 px-6 text-xl font-black bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 rounded-3xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 border-b-4 border-amber-500"
          >
            <span>🏆</span>
            명예의 전당
          </button>

          {/* 완독 리셋 버튼: 진행률이 100% (1189장) 일 때 노출 */}
          {overallCompletedChaptersCount >= totalBibleChapters && totalBibleChapters > 0 && (
            <button
              disabled={bibleResetLoading}
              onClick={onBibleReset}
              className="w-full h-20 px-6 text-2xl font-black bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-3xl shadow-2xl mt-4 flex flex-col items-center justify-center gap-1 hover:scale-[1.05] active:scale-95 transition-all border-4 border-white animate-bounce-subtle"
            >
              <div className="flex items-center gap-3">
                <span>🔄</span>
                {bibleResetLoading ? '차세대 원정 준비 중...' : '새로운 원정 시작'}
              </div>
              <span className="text-xs opacity-80 font-normal">모든 기록을 초기화하고 다음 라운드로!</span>
            </button>
          )}
        </div>
      )}

    </>
  );
};

export default Dashboard;
