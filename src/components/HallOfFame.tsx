import React, { useEffect, useState } from 'react';

interface HallOfFameEntry {
  user_id: number;
  username: string;
  round: number;
  completed_at: string;
}

const HallOfFame: React.FC<{ groupId?: number | null; groupName?: string; onClose?: () => void }> = ({ groupId, groupName, onClose }) => {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // groupId가 유효한 숫자인지 확인 (NaN, undefined, null 모두 개인 통독으로 처리)
    const isValidGroupId = typeof groupId === 'number' && !isNaN(groupId);
    const url = isValidGroupId
      ? `/api/hall-of-fame?groupId=${groupId}&t=${Date.now()}`
      : `/api/hall-of-fame?t=${Date.now()}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setEntries(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('명예의 전당 정보를 불러올 수 없습니다:', err);
        setEntries([]);
        setLoading(false);
      });
  }, [groupId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
      <div className="relative bg-white rounded-[3rem] shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto border-8 border-amber-50">
        <button
          className="absolute top-6 right-6 text-gray-400 hover:text-amber-600 text-3xl font-bold transition-colors"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="bg-amber-100 p-4 rounded-full mb-4 shadow-inner">
            <svg className="w-12 h-12 text-amber-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 00-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 00.75-.75 2.25 2.25 0 00-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.22 49.22 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" clipRule="evenodd" />
            </svg>
          </div>

          <h1 className="text-3xl font-black text-amber-800 mb-2">
            {groupName ? `🏆 ${groupName}` : '🏆 개인 통독'}
          </h1>
          <p className="text-amber-600 font-bold tracking-[0.3em] text-xs uppercase mb-8">Hall of Fame</p>

          <div className="w-full mb-10 p-10 bg-gradient-to-br from-amber-50 to-orange-50 border-double border-8 border-amber-100/50 shadow-xl rounded-[3.5rem] relative">
            <div className="flex flex-col items-center text-center">
              <span className="text-6xl text-amber-200 font-serif leading-none mb-4">“</span>
              <p className="text-xl text-amber-900 font-serif leading-relaxed break-keep max-w-[90%] font-bold italic">
                내가 달려갈 길과 주 예수께 받은 사명<br />
                곧 하나님의 은혜의 복음을 증언하는 일을 마치려 함에는<br />
                나의 생명조차 조금도 귀한 것으로 여기지 아니하노라
              </p>
              <span className="text-6xl text-amber-200 font-serif leading-none mt-4 rotate-180">“</span>
              <div className="mt-6 flex items-center gap-3 justify-center">
                <div className="h-px w-8 bg-amber-300"></div>
                <div className="bg-amber-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full tracking-widest uppercase">
                  Acts 20:24
                </div>
                <div className="h-px w-8 bg-amber-300"></div>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
            <p className="mt-4 text-amber-700 font-medium">영광의 기록을 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 font-bold">{error}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-4">
            {entries.length === 0 ? (
              <div className="col-span-2 text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                <p className="text-gray-400 font-medium">아직 이 방의 완독자가 없습니다.<br />첫 번째 주인공이 되어보세요!</p>
              </div>
            ) : entries.map(entry => (
              <div key={`${entry.user_id}-${entry.round}`} className="group hover:scale-[1.02] transition-all bg-gradient-to-br from-white to-amber-50 rounded-[2rem] shadow-lg p-6 border-2 border-amber-100 flex flex-col items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                  <svg className="w-8 h-8 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                </div>
                <div className="text-xl font-black text-indigo-900 mb-1">{entry.username}</div>
                <div className="text-amber-600 font-black text-sm mb-2">{entry.round}회 완독</div>
                <div className="text-[11px] text-gray-400 font-medium bg-white px-3 py-1 rounded-full shadow-sm">
                  {new Date(entry.completed_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HallOfFame;
