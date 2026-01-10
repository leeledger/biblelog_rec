import React, { useState, useMemo, useRef } from 'react';
import { UserProgress, BookChapterInfo } from '../types';
import { AVAILABLE_BOOKS } from '../constants';

interface BibleTreeStatusProps {
    userProgress: UserProgress | null;
    onSelectBook?: (book: BookChapterInfo) => void;
}

interface FlowerNode {
    name: string;
    x: number; // % based
    y: number; // % based
    color: string;
}

// 66권의 위치를 실제 나무 이미지 비율에 맞춰 재배치 (모바일 세로 스크롤 고려)
const BIBLE_TREE_MAP: FlowerNode[] = [
    // 구약 - 모세오경 (뿌리 및 하단 몸통)
    { name: '창세기', x: 50, y: 92, color: '#FCD34D' },
    { name: '출애굽기', x: 42, y: 88, color: '#FCD34D' },
    { name: '레위기', x: 58, y: 88, color: '#FCD34D' },
    { name: '민수기', x: 35, y: 84, color: '#FCD34D' },
    { name: '신명기', x: 65, y: 84, color: '#FCD34D' },

    // 구약 - 역사서 (중단 몸통 및 하단 가지)
    { name: '여호수아', x: 25, y: 78, color: '#FB923C' },
    { name: '사사기', x: 38, y: 76, color: '#FB923C' },
    { name: '룻기', x: 18, y: 74, color: '#FB923C' },
    { name: '사무엘상', x: 30, y: 71, color: '#FB923C' },
    { name: '사무엘하', x: 45, y: 72, color: '#FB923C' },
    { name: '열왕기상', x: 20, y: 67, color: '#FB923C' },
    { name: '열왕기하', x: 32, y: 64, color: '#FB923C' },
    { name: '역대상', x: 48, y: 65, color: '#FB923C' },
    { name: '역대하', x: 60, y: 68, color: '#FB923C' },
    { name: '에스라', x: 15, y: 62, color: '#FB923C' },
    { name: '느헤미야', x: 25, y: 59, color: '#FB923C' },
    { name: '에스더', x: 40, y: 60, color: '#FB923C' },

    // 구약 - 시가서 (나무 정중앙 핵심부)
    { name: '욥기', x: 52, y: 78, color: '#60A5FA' },
    { name: '시편', x: 50, y: 74, color: '#60A5FA' },
    { name: '잠언', x: 55, y: 70, color: '#60A5FA' },
    { name: '전도서', x: 48, y: 68, color: '#60A5FA' },
    { name: '아가', x: 53, y: 66, color: '#60A5FA' },

    // 구약 - 대예언서 (좌측 큰 가지)
    { name: '이사야', x: 12, y: 55, color: '#A78BFA' },
    { name: '예레미야', x: 20, y: 53, color: '#A78BFA' },
    { name: '예레미야애가', x: 28, y: 55, color: '#A78BFA' },
    { name: '에스겔', x: 15, y: 48, color: '#A78BFA' },
    { name: '다니엘', x: 22, y: 45, color: '#A78BFA' },

    // 구약 - 소예언서 (좌측 상단 잔가지)
    { name: '호세아', x: 10, y: 42, color: '#C084FC' },
    { name: '요엘', x: 18, y: 40, color: '#C084FC' },
    { name: '아모스', x: 26, y: 42, color: '#C084FC' },
    { name: '오바댜', x: 12, y: 35, color: '#C084FC' },
    { name: '요나', x: 22, y: 33, color: '#C084FC' },
    { name: '미가', x: 30, y: 35, color: '#C084FC' },
    { name: '나훔', x: 15, y: 28, color: '#C084FC' },
    { name: '하박국', x: 25, y: 26, color: '#C084FC' },
    { name: '스바냐', x: 32, y: 28, color: '#C084FC' },
    { name: '학개', x: 18, y: 22, color: '#C084FC' },
    { name: '스가랴', x: 28, y: 18, color: '#C084FC' },
    { name: '말라기', x: 22, y: 14, color: '#C084FC' },

    // 신약 - 복음서 및 사도행전 (우측 큰 가지)
    { name: '마태복음', x: 75, y: 80, color: '#34D399' },
    { name: '마가복음', x: 88, y: 78, color: '#34D399' },
    { name: '누가복음', x: 82, y: 74, color: '#34D399' },
    { name: '요한복음', x: 92, y: 72, color: '#34D399' },
    { name: '사도행전', x: 78, y: 68, color: '#10B981' },

    // 신약 - 바울서신 (우측 중앙 가지군)
    { name: '로마서', x: 85, y: 64, color: '#F472B6' },
    { name: '고린도전서', x: 72, y: 62, color: '#F472B6' },
    { name: '고린도후서', x: 80, y: 59, color: '#F472B6' },
    { name: '갈라디아서', x: 90, y: 60, color: '#F472B6' },
    { name: '에베소서', x: 75, y: 55, color: '#F472B6' },
    { name: '빌립보서', x: 82, y: 53, color: '#F472B6' },
    { name: '골로새서', x: 92, y: 54, color: '#F472B6' },
    { name: '데살로니가전서', x: 70, y: 50, color: '#F472B6' },
    { name: '데살로니가후서', x: 78, y: 47, color: '#F472B6' },
    { name: '디모데전서', x: 86, y: 48, color: '#F472B6' },
    { name: '디모데후서', x: 72, y: 43, color: '#F472B6' },
    { name: '디도서', x: 80, y: 41, color: '#F472B6' },
    { name: '빌레몬서', x: 88, y: 42, color: '#F472B6' },

    // 신약 - 일반서신 (우측 상단 잔가지)
    { name: '히브리서', x: 65, y: 38, color: '#FB7185' },
    { name: '야고보서', x: 75, y: 35, color: '#FB7185' },
    { name: '베드로전서', x: 85, y: 36, color: '#FB7185' },
    { name: '베드로후서', x: 68, y: 30, color: '#FB7185' },
    { name: '요한일서', x: 78, y: 28, color: '#FB7185' },
    { name: '요한이서', x: 88, y: 30, color: '#FB7185' },
    { name: '요한삼서', x: 72, y: 24, color: '#FB7185' },
    { name: '유다서', x: 82, y: 22, color: '#FB7185' },

    // 신약 - 요한계시록 (하늘/나무 최정상)
    { name: '요한계시록', x: 50, y: 15, color: '#F59E0B' },
];

const BibleTreeStatus: React.FC<BibleTreeStatusProps> = ({ userProgress, onSelectBook }) => {
    const [selectedBookDetail, setSelectedBookDetail] = useState<BookChapterInfo | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const completedChaptersSet = useMemo(() => new Set(userProgress?.completedChapters || []), [userProgress]);

    const treeNodes = useMemo(() => {
        return BIBLE_TREE_MAP.map(node => {
            const bookInfo = AVAILABLE_BOOKS.find(b => b.name === node.name);
            if (!bookInfo) return null;

            let completedCount = 0;
            for (let i = 1; i <= bookInfo.chapterCount; i++) {
                if (completedChaptersSet.has(`${node.name}:${i}`)) {
                    completedCount++;
                }
            }

            const progress = bookInfo.chapterCount > 0 ? (completedCount / bookInfo.chapterCount) * 100 : 0;
            return { ...node, progress, bookInfo, completedCount };
        }).filter(Boolean);
    }, [completedChaptersSet]);

    if (!userProgress) return null;

    return (
        <div className="w-full bg-[#fdf8f1] rounded-[2.5rem] p-4 sm:p-6 shadow-2xl border border-orange-100 overflow-hidden relative">
            <div className="text-center mb-6 relative z-10">
                <h3 className="text-2xl font-black text-[#4a342e] mb-1">열매 맺는 성경 나무</h3>
                <p className="text-xs text-[#826a5c] font-bold opacity-80 uppercase tracking-widest">수정과 같은 66권의 열매를 맺어보세요</p>
            </div>

            {/* 나무 컨테이너: 세로로 긴 이미지 배경과 스크롤 적용 */}
            <div className="relative h-[120vh] sm:h-[1000px] overflow-y-auto no-scrollbar rounded-3xl bg-white shadow-inner border border-stone-100 group">

                {/* 실제 나무 배경 이미지 */}
                <div
                    className="absolute inset-0 w-full h-[150%] sm:h-full bg-cover bg-top"
                    style={{
                        backgroundImage: "url('/img/bible_tree_bg.png')",
                        filter: 'sepia(10%) contrast(90%)'
                    }}
                />

                {/* 오버레이 (빛 효과) */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/5 pointer-events-none" />

                {/* 열매(포인트)들이 배치되는 인터랙티브 레이어 */}
                <div className="absolute inset-0 w-full h-[150%] sm:h-full">
                    {treeNodes.map((node: any) => {
                        const isCompleted = node.progress === 100;
                        const isPartial = node.progress > 0 && node.progress < 100;

                        return (
                            <button
                                key={node.name}
                                onClick={() => {
                                    setSelectedBookDetail(node.bookInfo);
                                    if (onSelectBook) onSelectBook(node.bookInfo);
                                }}
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 group/fruit outline-none"
                                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                            >
                                {/* 열매 디자인: 진행률에 따라 빛나는 세기 조절 */}
                                <div className="relative">
                                    {/* 외곽 광채 (진행률 비례) */}
                                    <div
                                        className={`absolute inset-[-10px] rounded-full blur-md transition-all duration-1000 ${isCompleted ? 'animate-pulse' : ''}`}
                                        style={{
                                            background: node.color,
                                            opacity: node.progress / 200,
                                            transform: `scale(${0.8 + (node.progress / 100) * 0.4})`
                                        }}
                                    />

                                    {/* 실제 열매 알맹이 */}
                                    <div
                                        className={`
                      w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 transition-all duration-300 flex items-center justify-center shadow-lg
                      ${isCompleted ? 'scale-110' : 'scale-90'}
                    `}
                                        style={{
                                            backgroundColor: node.progress > 0 ? node.color : 'rgba(255,255,255,0.4)',
                                            borderColor: node.progress > 0 ? 'white' : 'rgba(150,150,150,0.2)',
                                            boxShadow: node.progress > 0 ? `0 0 15px ${node.color}88` : 'none'
                                        }}
                                    >
                                        {/* 약어 첫 글자 (매우 작게) */}
                                        <span
                                            className="text-[8px] sm:text-[10px] font-black pointer-events-none"
                                            style={{ color: node.progress > 60 ? 'white' : '#666' }}
                                        >
                                            {node.name[0]}
                                        </span>
                                    </div>

                                    {/* 툴팁: 성경 이름과 진행률 (%) - 항상 작게 노출하거나 호버시 노출 */}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-md opacity-0 group-hover/fruit:opacity-100 transition-opacity pointer-events-none z-20">
                                        <p className="text-[9px] text-white font-bold whitespace-nowrap">{node.name} {node.progress.toFixed(0)}%</p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* 도움말 안내 */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-orange-100/50 pointer-events-none z-10">
                    <p className="text-[10px] text-stone-500 font-bold flex items-center gap-2">
                        <span className="animate-bounce">👆</span> 나무의 열매를 터치하여 성경 장별 현황을 확인하세요
                    </p>
                </div>
            </div>

            {/* 하단 상세 정보 (장별 열매 그리드) */}
            {selectedBookDetail && (
                <div className="mt-6 p-5 sm:p-8 bg-white rounded-[2rem] border-2 border-orange-50 shadow-2xl animate-in fade-in slide-in-from-bottom duration-500 relative z-30">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-4">
                            <div
                                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg transform -rotate-3"
                                style={{ backgroundColor: BIBLE_TREE_MAP.find(n => n.name === selectedBookDetail.name)?.color }}
                            >
                                {selectedBookDetail.name[0]}
                            </div>
                            <div>
                                <h4 className="text-xl font-black text-stone-800 leading-none mb-1">{selectedBookDetail.name}</h4>
                                <p className="text-[11px] text-stone-400 font-bold uppercase tracking-widest">Chapter Journey</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedBookDetail(null)}
                            className="w-10 h-10 bg-stone-50 hover:bg-stone-100 rounded-full flex items-center justify-center transition-colors group"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-stone-400 group-hover:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2.5 justify-center max-h-[250px] overflow-y-auto p-2 no-scrollbar">
                        {Array.from({ length: selectedBookDetail.chapterCount }, (_, i) => i + 1).map(chapter => {
                            const isDone = completedChaptersSet.has(`${selectedBookDetail.name}:${chapter}`);
                            const color = BIBLE_TREE_MAP.find(n => n.name === selectedBookDetail.name)?.color || '#10B981';

                            return (
                                <div
                                    key={chapter}
                                    className={`
                    w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-black transition-all cursor-default
                    ${isDone
                                            ? 'shadow-lg text-white transform hover:scale-105'
                                            : 'bg-stone-50 text-stone-300 border border-stone-100'}
                  `}
                                    style={isDone ? {
                                        background: `radial-gradient(circle at top left, ${color}, ${color}dd)`,
                                    } : {}}
                                >
                                    {chapter}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-8 pt-6 border-t border-stone-50 flex justify-center gap-8">
                        <div className="flex items-center gap-2.5">
                            <div className="w-4 h-4 rounded-lg bg-stone-100 border border-stone-200"></div>
                            <span className="text-[10px] text-stone-400 font-black uppercase tracking-wider">Remaining</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-4 h-4 rounded-lg shadow-md" style={{ background: BIBLE_TREE_MAP.find(n => n.name === selectedBookDetail.name)?.color }}></div>
                            <span className="text-[10px] text-stone-400 font-black uppercase tracking-wider">Completed</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BibleTreeStatus;
