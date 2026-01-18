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

  // 모달이 열리면 배경 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    const isValidGroupId = typeof groupId === 'number' && !isNaN(groupId);
    const url = isValidGroupId
      ? `/api/hall-of-fame?groupId=${groupId}&t=${Date.now()}`
      : `/api/hall-of-fame?t=${Date.now()}`;

    console.log(`[HallOfFame] groupId prop: ${groupId}, type: ${typeof groupId}, isValid: ${isValidGroupId}`);
    console.log(`[HallOfFame] Fetching URL: ${url}`);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* 성스러운 빛 효과 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-gradient-radial from-amber-200/30 via-transparent to-transparent animate-pulse" />
      </div>

      <div className="relative bg-gradient-to-b from-amber-50 via-white to-amber-50 rounded-[2rem] shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden border-4 border-amber-200/50">
        {/* 상단 장식 */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300" />

        {/* 닫기 버튼 */}
        <button
          className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow-lg text-amber-600 hover:text-amber-800 text-2xl font-bold transition-all"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>

        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className="overflow-y-auto max-h-[85vh] p-8">
          {/* 헤더 */}
          <div className="flex flex-col items-center mb-6 pt-4">
            {/* 트로피 아이콘 */}
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-amber-400/20 blur-2xl rounded-full scale-150" />
              <div className="relative bg-gradient-to-br from-amber-400 to-amber-600 p-5 rounded-full shadow-xl">
                <svg className="w-10 h-10 text-white drop-shadow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 00-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 00.75-.75 2.25 2.25 0 00-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.22 49.22 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-black text-amber-800 mb-1 text-center">
              {groupName ? groupName : '개인 통독'}
            </h1>
            <p className="text-amber-500 font-black tracking-[0.4em] text-[10px] uppercase">명예의 전당</p>
          </div>

          {/* 성경 구절 카드 */}
          <div className="relative mb-8 p-6 bg-white rounded-2xl shadow-inner border border-amber-100">
            {/* 십자가 장식 */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow">✝</div>

            <div className="flex flex-col items-center text-center pt-2">
              <p className="text-base text-amber-900 font-serif leading-relaxed break-keep italic">
                "내가 달려갈 길과 주 예수께 받은 사명<br />
                곧 하나님의 은혜의 복음을 증언하는 일을 마치려 함에는<br />
                나의 생명조차 조금도 귀한 것으로 여기지 아니하노라"
              </p>
              <div className="mt-4 text-amber-600 text-xs font-bold tracking-wider">
                — 사도행전 20:24 —
              </div>
            </div>
          </div>

          {/* 완독자 목록 */}
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
              <p className="mt-4 text-amber-700 font-medium text-sm">영광의 기록을 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 font-bold">{error}</div>
          ) : (
            <div className="space-y-3">
              {entries.length === 0 ? (
                <div className="text-center py-8 bg-amber-50/50 rounded-xl border border-dashed border-amber-200">
                  <p className="text-amber-600 font-medium text-sm">
                    아직 이 방의 완독자가 없습니다.<br />
                    <span className="text-amber-400">첫 번째 주인공이 되어보세요!</span>
                  </p>
                </div>
              ) : entries.map((entry, index) => (
                <div
                  key={`${entry.user_id}-${entry.round}`}
                  className="group flex items-center gap-4 bg-white hover:bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-100 transition-all hover:shadow-md"
                >
                  {/* 순위 배지 */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow
                    ${index === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white' :
                      index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white' :
                        index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                          'bg-amber-100 text-amber-700'}`}
                  >
                    {index + 1}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-800 truncate">{entry.username}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(entry.completed_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>

                  {/* 완독 횟수 */}
                  <div className="flex-shrink-0 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {entry.round}회
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HallOfFame;
