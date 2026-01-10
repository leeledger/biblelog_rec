import React, { useState, useMemo, useRef, useEffect } from 'react';
import { UserProgress, BookChapterInfo } from '../types';
import { AVAILABLE_BOOKS } from '../constants';

interface BibleTreeStatusProps {
    userProgress: UserProgress | null;
    onSelectBook?: (book: BookChapterInfo) => void;
}

interface FlowerNode {
    name: string;
    x: number;
    y: number;
    color: string;
    category: string;
}

// 66권의 위치와 색상을 정의하는 맵
const BIBLE_TREE_MAP: FlowerNode[] = [
    // 구약 - 모세오경 (좌측 하단)
    { name: '창세기', x: 220, y: 720, color: '#FCD34D', category: 'Pentateuch' },
    { name: '출애굽기', x: 180, y: 680, color: '#FCD34D', category: 'Pentateuch' },
    { name: '레위기', x: 240, y: 660, color: '#FCD34D', category: 'Pentateuch' },
    { name: '민수기', x: 140, y: 640, color: '#FCD34D', category: 'Pentateuch' },
    { name: '신명기', x: 200, y: 620, color: '#FCD34D', category: 'Pentateuch' },

    // 구약 - 역사서 (좌측 중앙)
    { name: '여호수아', x: 100, y: 580, color: '#F87171', category: 'History_OT' },
    { name: '사사기', x: 160, y: 560, color: '#F87171', category: 'History_OT' },
    { name: '룻기', x: 80, y: 530, color: '#F87171', category: 'History_OT' },
    { name: '사무엘상', x: 140, y: 510, color: '#F87171', category: 'History_OT' },
    { name: '사무엘하', x: 200, y: 530, color: '#F87171', category: 'History_OT' },
    { name: '열왕기상', x: 60, y: 480, color: '#F87171', category: 'History_OT' },
    { name: '열왕기하', x: 110, y: 460, color: '#F87171', category: 'History_OT' },
    { name: '역대상', x: 170, y: 460, color: '#F87171', category: 'History_OT' },
    { name: '역대하', x: 230, y: 480, color: '#F87171', category: 'History_OT' },
    { name: '에스라', x: 50, y: 420, color: '#F87171', category: 'History_OT' },
    { name: '느헤미야', x: 90, y: 390, color: '#F87171', category: 'History_OT' },
    { name: '에스더', x: 140, y: 410, color: '#F87171', category: 'History_OT' },

    // 구약 - 시가서 (중앙 하단)
    { name: '욥기', x: 280, y: 580, color: '#60A5FA', category: 'Poetry' },
    { name: '시편', x: 320, y: 550, color: '#60A5FA', category: 'Poetry' },
    { name: '잠언', x: 360, y: 580, color: '#60A5FA', category: 'Poetry' },
    { name: '전도서', x: 310, y: 610, color: '#60A5FA', category: 'Poetry' },
    { name: '아가', x: 350, y: 630, color: '#60A5FA', category: 'Poetry' },

    // 구약 - 대예언서 (좌측 상단)
    { name: '이사야', x: 180, y: 360, color: '#A78BFA', category: 'Prophets_OT' },
    { name: '예레미야', x: 120, y: 340, color: '#A78BFA', category: 'Prophets_OT' },
    { name: '예레미야애가', x: 220, y: 320, color: '#A78BFA', category: 'Prophets_OT' },
    { name: '에스겔', x: 260, y: 350, color: '#A78BFA', category: 'Prophets_OT' },
    { name: '다니엘', x: 300, y: 310, color: '#A78BFA', category: 'Prophets_OT' },

    // 구약 - 소예언서 (최상단 좌측)
    { name: '호세아', x: 80, y: 300, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '요엘', x: 140, y: 280, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '아모스', x: 200, y: 260, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '오바댜', x: 100, y: 240, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '요나', x: 160, y: 220, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '미가', x: 220, y: 200, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '나훔', x: 120, y: 180, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '하박국', x: 180, y: 160, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '스바냐', x: 240, y: 150, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '학개', x: 140, y: 120, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '스가랴', x: 200, y: 100, color: '#C084FC', category: 'Minor_Prophets' },
    { name: '말라기', x: 260, y: 80, color: '#C084FC', category: 'Minor_Prophets' },

    // 신약 - 복음서 및 사도행전 (우측 하단)
    { name: '마태복음', x: 420, y: 720, color: '#34D399', category: 'Gospels' },
    { name: '마가복음', x: 480, y: 690, color: '#34D399', category: 'Gospels' },
    { name: '누가복음', x: 440, y: 660, color: '#34D399', category: 'Gospels' },
    { name: '요한복음', x: 520, y: 640, color: '#34D399', category: 'Gospels' },
    { name: '사도행전', x: 500, y: 600, color: '#10B981', category: 'Acts' },

    // 신약 - 바울서신 (우측 중앙)
    { name: '로마서', x: 560, y: 580, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '고린도전서', x: 460, y: 550, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '고린도후서', x: 540, y: 530, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '갈라디아서', x: 580, y: 500, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '에베소서', x: 480, y: 480, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '빌립보서', x: 540, y: 460, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '골로새서', x: 600, y: 440, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '데살로니가전서', x: 520, y: 420, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '데살로니가후서', x: 580, y: 400, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '디모데전서', x: 460, y: 400, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '디모데후서', x: 500, y: 370, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '디도서', x: 550, y: 340, color: '#F472B6', category: 'Epistles_Paul' },
    { name: '빌레몬서', x: 590, y: 310, color: '#F472B6', category: 'Epistles_Paul' },

    // 신약 - 일반서신 (우측 상단)
    { name: '히브리서', x: 440, y: 320, color: '#FB7185', category: 'Epistles_General' },
    { name: '야고보서', x: 500, y: 290, color: '#FB7185', category: 'Epistles_General' },
    { name: '베드로전서', x: 560, y: 270, color: '#FB7185', category: 'Epistles_General' },
    { name: '베드로후서', x: 420, y: 260, color: '#FB7185', category: 'Epistles_General' },
    { name: '요한일서', x: 480, y: 240, color: '#FB7185', category: 'Epistles_General' },
    { name: '요한이서', x: 540, y: 220, color: '#FB7185', category: 'Epistles_General' },
    { name: '요한삼서', x: 600, y: 200, color: '#FB7185', category: 'Epistles_General' },
    { name: '유다서', x: 520, y: 180, color: '#FB7185', category: 'Epistles_General' },

    // 신약 - 요한계시록 (최상단 우측)
    { name: '요한계시록', x: 460, y: 120, color: '#FB923C', category: 'Revelation' },
];

const BibleTreeStatus: React.FC<BibleTreeStatusProps> = ({ userProgress, onSelectBook }) => {
    const [hoveredBook, setHoveredBook] = useState<string | null>(null);
    const [selectedBookDetail, setSelectedBookDetail] = useState<BookChapterInfo | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 성취도 계산
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

    // 성경 가지들 (간단한 고정 선들)
    const branches = [
        { x1: 300, y1: 800, x2: 300, y2: 400 }, // 몸통
        { x1: 300, y1: 700, x2: 150, y2: 600 }, // 좌측 하단 가지
        { x1: 300, y1: 650, x2: 450, y2: 600 }, // 우측 하단 가지
        { x1: 300, y1: 500, x2: 100, y2: 400 }, // 좌측 중앙 가지
        { x1: 300, y1: 450, x2: 500, y2: 400 }, // 우측 중앙 가지
        { x1: 300, y1: 300, x2: 150, y2: 150 }, // 좌측 상단 가지
        { x1: 300, y1: 250, x2: 450, y2: 150 }, // 우측 상단 가지
    ];

    if (!userProgress) return null;

    return (
        <div className="w-full bg-orange-50/30 rounded-3xl p-4 sm:p-8 shadow-inner border border-orange-100/50">
            <div className="text-center mb-8">
                <h3 className="text-2xl font-black text-amber-900 mb-2">생명의 말씀 나무</h3>
                <p className="text-sm text-amber-700/70 font-medium">읽어주신 말씀이 모여 한 그루의 나무를 키워냅니다.</p>
            </div>

            <div className="relative overflow-x-auto no-scrollbar py-4" ref={scrollRef}>
                <div className="min-w-[600px] mx-auto relative group">
                    <svg viewBox="0 0 600 800" className="w-full h-auto drop-shadow-2xl">
                        {/* 배경 흐림 효과 */}
                        <defs>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* 나무 가지 (Branches) */}
                        <g stroke="#78350f" strokeWidth="12" strokeLinecap="round" opacity="0.3">
                            <path d="M300,800 C300,600 300,400 300,300" fill="none" strokeWidth="20" />
                            <path d="M300,700 Q200,700 150,600" fill="none" />
                            <path d="M300,650 Q400,650 450,600" fill="none" />
                            <path d="M300,500 Q200,500 100,400" fill="none" />
                            <path d="M300,450 Q400,450 500,400" fill="none" />
                            <path d="M300,300 Q200,300 150,150" fill="none" />
                            <path d="M300,250 Q400,250 450,150" fill="none" />
                        </g>

                        {/* 꽃송이 (Flowers) */}
                        {treeNodes.map((node: any) => {
                            const isHovered = hoveredBook === node.name;
                            const isCompleted = node.progress === 100;

                            return (
                                <g
                                    key={node.name}
                                    cursor="pointer"
                                    onMouseEnter={() => setHoveredBook(node.name)}
                                    onMouseLeave={() => setHoveredBook(null)}
                                    onClick={() => {
                                        setSelectedBookDetail(node.bookInfo);
                                        if (onSelectBook) onSelectBook(node.bookInfo);
                                    }}
                                    className="transition-all duration-300"
                                >
                                    {/* 꽃잎 배경 (진행도에 따라 색이 차오름) */}
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={isHovered ? 18 : 14}
                                        fill="white"
                                        stroke={node.color}
                                        strokeWidth="1"
                                        opacity="0.8"
                                    />

                                    {/* 진행도 채우기 */}
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={isHovered ? 18 : 14}
                                        fill={node.color}
                                        opacity={0.15 + (node.progress / 100) * 0.85}
                                        transform={`scale(${0.3 + (node.progress / 100) * 0.7})`}
                                        style={{ transformOrigin: `${node.x}px ${node.y}px`, transition: 'all 0.5s ease-out' }}
                                        filter={isCompleted ? 'url(#glow)' : ''}
                                    />

                                    {/* 100% 완료 시 특별 테두리 */}
                                    {isCompleted && (
                                        <circle
                                            cx={node.x}
                                            cy={node.y}
                                            r={isHovered ? 20 : 16}
                                            fill="none"
                                            stroke={node.color}
                                            strokeWidth="2"
                                            strokeDasharray="4 2"
                                            className="animate-[spin_10s_linear_infinite]"
                                            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                                        />
                                    )}

                                    {/* 책 이름 약어 */}
                                    <text
                                        x={node.x}
                                        y={node.y + 4}
                                        textAnchor="middle"
                                        fontSize={isHovered ? "9px" : "8px"}
                                        fontFamily="serif"
                                        fontWeight="900"
                                        fill={node.progress > 50 ? "white" : "#451a03"}
                                        className="pointer-events-none"
                                    >
                                        {node.name.substring(0, 2)}
                                    </text>

                                    {/* 호버 시 툴팁 형태의 정보 정보 */}
                                    {isHovered && (
                                        <g className="animate-in fade-in zoom-in duration-200 pointer-events-none">
                                            <rect
                                                x={node.x - 40}
                                                y={node.y - 55}
                                                width="80"
                                                height="35"
                                                rx="8"
                                                fill="white"
                                                filter="drop-shadow(0 4px 6px rgb(0 0 0 / 0.1))"
                                            />
                                            <path d={`M${node.x - 5},${node.y - 20} L${node.x},${node.y - 10} L${node.x + 5},${node.y - 20} Z`} fill="white" />
                                            <text x={node.x} y={node.y - 40} textAnchor="middle" fontSize="10px" fontWeight="bold" fill="#1e293b">{node.name}</text>
                                            <text x={node.x} y={node.y - 28} textAnchor="middle" fontSize="9px" fontWeight="black" fill={node.color}>{node.progress.toFixed(1)}%</text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>

            {/* 하단 상세 정보 (선택 시) */}
            {selectedBookDetail && (
                <div className="mt-8 p-6 bg-white rounded-3xl border border-orange-100 shadow-xl animate-in fade-in slide-in-from-bottom duration-500">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h4 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm" style={{ backgroundColor: BIBLE_TREE_MAP.find(n => n.name === selectedBookDetail.name)?.color }}>
                                    {selectedBookDetail.name[0]}
                                </span>
                                {selectedBookDetail.name} 장별 여정
                            </h4>
                        </div>
                        <button
                            onClick={() => setSelectedBookDetail(null)}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center max-h-[300px] overflow-y-auto p-2 no-scrollbar">
                        {Array.from({ length: selectedBookDetail.chapterCount }, (_, i) => i + 1).map(chapter => {
                            const isDone = completedChaptersSet.has(`${selectedBookDetail.name}:${chapter}`);
                            const color = BIBLE_TREE_MAP.find(n => n.name === selectedBookDetail.name)?.color || '#10B981';

                            return (
                                <div
                                    key={chapter}
                                    className={`
                    w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all
                    ${isDone
                                            ? 'bg-gradient-to-br shadow-md text-white border-transparent'
                                            : 'bg-gray-50 text-gray-300 border border-gray-100'}
                  `}
                                    style={isDone ? {
                                        backgroundImage: `linear-gradient(to bottom right, ${color}, ${color}dd)`,
                                        boxShadow: `0 4px 10px -2px ${color}66`
                                    } : {}}
                                >
                                    {chapter}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-50 flex justify-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gray-100 border border-gray-200"></div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">To Read</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-indigo-400"></div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">Completed</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BibleTreeStatus;
