import React, { useState, useEffect } from 'react';
import { UserProgress } from '../types';
import * as authService from '../services/authService';
import { AVAILABLE_BOOKS } from '../constants'; // To get book order if needed

// authService.getAllUsersWithProgress()가 반환하는 데이터 구조에 대한 인터페이스
interface UserDataForLeaderboard {
  username: string;
  progress: UserProgress; // UserProgress에는 lastProgressUpdateDate가 포함됨
  completionRate: number;
  completed_count?: number; // 완독 횟수
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  progressDisplay: string;
  completionRate: number;
  lastProgressUpdateDate?: string; // ISO string, UserProgress에서 가져옴
  completed_count: number; // 완독 횟수
  // Raw progress for sorting
  book: string;
  chapter: number;
  verse: number;
}

// Define the canonical order of Bible books (for now, only Genesis)
const BOOK_ORDER = AVAILABLE_BOOKS.map(b => b.name);

interface LeaderboardProps {
  groupId?: number | null;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ groupId }) => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10); // 초기 노출 개수

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      setIsLoading(true);
      setVisibleCount(10); // 그룹 변경 시 노출 개수 리셋
      try {
        const usersData: UserDataForLeaderboard[] = await authService.getAllUsersWithProgress(groupId); // Pass groupId

        // 백엔드에서 이미 정렬 및 필터링을 해서 오므로, 클라이언트에서는 포맷팅만 수행
        const formattedData: LeaderboardEntry[] = usersData.map((user, index) => {
          let progressDisplay = "아직 읽기 시작 안 함";
          if (user.progress && (user.progress.lastReadBook || user.progress.lastReadChapter > 0 || user.progress.lastReadVerse > 0)) {
            progressDisplay = `${user.progress.lastReadBook || '??'} ${user.progress.lastReadChapter}장 ${user.progress.lastReadVerse}절`;
          }
          return {
            completionRate: user.completionRate,
            rank: index + 1,
            username: user.username,
            progressDisplay: progressDisplay,
            book: user.progress?.lastReadBook || '',
            chapter: user.progress?.lastReadChapter || 0,
            verse: user.progress?.lastReadVerse || 0,
            lastProgressUpdateDate: user.progress?.lastProgressUpdateDate,
            completed_count: user.completed_count || 0,
          };
        });

        setLeaderboardData(formattedData);
      } catch (error) {
        console.error("Failed to fetch leaderboard data:", error);
        setLeaderboardData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [groupId]);

  if (isLoading) {
    return (
      <div className="mt-8 p-8 bg-white shadow-xl rounded-2xl text-center">
        <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mb-4"></div>
        <p className="text-gray-600 font-medium font-sans">말씀의 발자국을 찾는 중...</p>
      </div>
    );
  }

  if (leaderboardData.length === 0) {
    return (
      <div className="mt-8 p-10 bg-white shadow-xl rounded-2xl text-center border border-dashed border-gray-200">
        <span className="text-4xl block mb-4">✨</span>
        <p className="text-gray-500 font-medium font-sans">
          {groupId ? '이 그룹에 아직 활동 중인 멤버가 없습니다.' : '개인 통독을 시작한 멤버가 아직 없습니다.'}<br />
          <span className="text-xs opacity-60 mt-2 block">(0% 진행 사용자는 랭킹에서 제외됩니다)</span>
        </p>
      </div>
    );
  }

  const displayedData = leaderboardData.slice(0, visibleCount);
  const hasMore = leaderboardData.length > visibleCount;

  return (
    <div className="mt-8 bg-white shadow-2xl rounded-3xl overflow-hidden border border-gray-100 flex flex-col font-sans">
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 py-6 px-6 shadow-inner">
        <h2 className="text-xl sm:text-2xl font-black text-center text-white mb-1 break-keep drop-shadow-md tracking-tight uppercase">
          {groupId ? '🏅 그룹 랭킹 🏅' : '✨ 개인 통독 랭킹 ✨'}
        </h2>
        <p className="text-center text-indigo-100 text-xs font-medium opacity-90">
          {groupId ? '우리 공동체의 소중한 동행' : '홀로 서서 걷는 말씀의 시간'}
        </p>
      </div>

      <div className="flex-grow overflow-hidden">
        {/* 모바일 뷰 (Card Layout) */}
        <div className="md:hidden p-4 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
          {displayedData.map((entry) => (
            <div
              key={entry.username}
              className={`rounded-2xl p-4 shadow-sm border transition-all duration-300 ${entry.rank <= 3 ? 'bg-gradient-to-br from-amber-50 to-white border-amber-100' : 'bg-gray-50 border-gray-100'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`
                    ${entry.rank === 1 ? 'bg-amber-400 text-white' :
                      entry.rank === 2 ? 'bg-slate-300 text-white' :
                        entry.rank === 3 ? 'bg-amber-600 text-white' :
                          'bg-indigo-50 text-indigo-400'} 
                    rounded-full w-7 h-7 flex items-center justify-center font-black text-xs shadow-sm
                  `}>
                    {entry.rank}
                  </div>
                  <div className="font-black text-gray-800 truncate max-w-[120px] flex items-center gap-1">
                    {entry.username}
                  </div>
                  {entry.completed_count > 0 && (
                    <div className="flex items-center bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                      🏆 {entry.completed_count}
                    </div>
                  )}
                </div>
                <div className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                  {entry.completionRate.toFixed(1)}%
                </div>
              </div>
              <p className="text-[11px] text-gray-500 flex justify-between items-center">
                <span>📍 {entry.progressDisplay}</span>
                <span className="opacity-60 italic">{entry.lastProgressUpdateDate ? entry.lastProgressUpdateDate.slice(5, 10).replace('-', '/') : ''}</span>
              </p>
            </div>
          ))}
        </div>

        {/* 데스크톱 뷰 (Table Layout) */}
        <div className="hidden md:block p-0 max-h-[60vh] overflow-y-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-left text-gray-400 font-bold border-b border-gray-100 uppercase tracking-widest text-[10px]">
                <th className="py-4 px-6">Rank</th>
                <th className="py-4 px-6">User</th>
                <th className="py-4 px-6">Last Progress</th>
                <th className="py-4 px-6">Rate</th>
              </tr>
            </thead>
            <tbody>
              {displayedData.map((entry) => (
                <tr
                  key={entry.username}
                  className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${entry.rank <= 3 ? 'bg-amber-50/20' : ''}`}
                >
                  <td className="py-4 px-6">
                    <div className={`
                      ${entry.rank === 1 ? 'bg-amber-400' :
                        entry.rank === 2 ? 'bg-slate-300' :
                          entry.rank === 3 ? 'bg-amber-600' :
                            'bg-gray-100 text-gray-400'} 
                      rounded-lg w-8 h-8 flex items-center justify-center font-black text-xs text-white shadow-sm
                    `}>
                      {entry.rank}
                    </div>
                  </td>
                  <td className="py-4 px-6 font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      {entry.username}
                      {entry.completed_count > 0 && (
                        <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                          🏆 {entry.completed_count}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-gray-500 font-medium">
                    {entry.progressDisplay}
                    {entry.lastProgressUpdateDate && (
                      <span className="ml-2 text-[10px] opacity-40 font-normal italic">({new Date(entry.lastProgressUpdateDate).toLocaleDateString()})</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full inline-block font-black text-xs shadow-sm shadow-indigo-100">
                      {entry.completionRate.toFixed(1)}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 더 보기 버튼 */}
      {hasMore && (
        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
          <button
            onClick={() => setVisibleCount(prev => prev + 20)}
            className="px-6 py-2 bg-white text-indigo-600 text-xs font-black rounded-full border border-indigo-100 hover:bg-indigo-50 active:scale-95 transition-all shadow-sm flex items-center gap-2 mx-auto"
          >
            기록 더 보기 ({leaderboardData.length - visibleCount}명 남음) <span>▼</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
