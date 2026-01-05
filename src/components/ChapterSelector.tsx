import React, { useState, useEffect, useMemo } from 'react';
import { AVAILABLE_BOOKS } from '../constants';
import { BookChapterInfo } from '../types';

interface ChapterSelectorProps {
  onStartReading: (book: string, startChapter: number, endChapter: number, startVerse?: number) => void;
  defaultBook?: string;
  defaultStartChapter?: number;
  defaultEndChapter?: number;
  defaultStartVerse?: number;
  completedChapters?: string[];
  isLoading?: boolean;
}


const ChapterSelector: React.FC<ChapterSelectorProps> = ({
  onStartReading,
  defaultBook = "창세기",
  defaultStartChapter = 1,
  defaultEndChapter = 1,
  defaultStartVerse = 1,
  completedChapters = [],
  isLoading = false,
}) => {
  // iOS 감지
  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), []);

  // 마이크 권한 상태: 'unknown' | 'granted' | 'denied' | 'requesting'
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied' | 'requesting'>('unknown');

  const [selectedBookName, setSelectedBookName] = useState<string>(defaultBook);
  const [selectedBookInfo, setSelectedBookInfo] = useState<BookChapterInfo | undefined>(
    AVAILABLE_BOOKS.find(b => b.name === defaultBook)
  );
  const [startChapter, setStartChapter] = useState<number>(Number(defaultStartChapter) || 1);
  const [endChapter, setEndChapter] = useState<number>(Number(defaultEndChapter) || 1);
  const [error, setError] = useState<string>('');
  const [dataAvailableForBook, setDataAvailableForBook] = useState<boolean>(false);
  const [alreadyReadMessage, setAlreadyReadMessage] = useState<string>('');

  const handleBookChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBookName = e.target.value;
    setSelectedBookName(newBookName);
    // When a new book is selected, we must reset the chapter selections to 1
    // to avoid carrying over invalid chapter numbers from a previous book.
    setStartChapter(1);
    setEndChapter(1);
  };

  const handleStartChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setStartChapter(value);
      if (value > endChapter) {
        setEndChapter(value);
      }
    }
  };

  const handleEndChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setEndChapter(value);
      if (value < startChapter) {
        setStartChapter(value);
      }
    }
  };

  // Effect to initialize component state from props
  useEffect(() => {
    setSelectedBookName(defaultBook);
    setStartChapter(Number(defaultStartChapter) || 1);
    setEndChapter(Number(defaultEndChapter) || 1);
  }, [defaultBook, defaultStartChapter, defaultEndChapter, defaultStartVerse]);

  // Effect to synchronize selectedBookInfo and data availability whenever selectedBookName changes
  useEffect(() => {
    const bookInfo = AVAILABLE_BOOKS.find(b => b.name === selectedBookName);
    setSelectedBookInfo(bookInfo);
    setDataAvailableForBook(!!bookInfo);
    if (!bookInfo) {
      setError(`"${selectedBookName}" 책을 찾을 수 없습니다. 목록에서 올바른 책을 선택해주세요.`);
    }
  }, [selectedBookName]);

  // Effect for validation of chapters and checking read status
  useEffect(() => {
    if (!selectedBookInfo) {
      return;
    }

    if (startChapter > selectedBookInfo.chapterCount || endChapter > selectedBookInfo.chapterCount) {
      setError(`선택한 책의 최대 장은 ${selectedBookInfo.chapterCount}장입니다.`);
      if (startChapter > selectedBookInfo.chapterCount) setStartChapter(selectedBookInfo.chapterCount);
      if (endChapter > selectedBookInfo.chapterCount) setEndChapter(selectedBookInfo.chapterCount);
      return;
    }

    if (startChapter > endChapter) {
      // Auto-correct the state to prevent invalid ranges, which cause NaN errors.
      // This is more robust than just setting an error and disabling the button.
      setEndChapter(startChapter);
      return;
    }

    setError('');

    // 선택된 범위 내의 모든 장 확인
    const readChapters = [];
    for (let ch = startChapter; ch <= endChapter; ch++) {
      const chKey = `${selectedBookName}:${ch}`;
      if (completedChapters.includes(chKey)) {
        readChapters.push(ch);
      }
    }

    if (readChapters.length === (endChapter - startChapter + 1)) {
      // 모든 장을 읽은 경우
      setAlreadyReadMessage(`선택한 범위(${startChapter}장 ~ ${endChapter}장)는 이미 모두 읽으셨습니다.`);
    } else if (readChapters.length > 0) {
      // 일부 장을 읽은 경우
      const readChaptersText = readChapters.length === 1
        ? `${readChapters[0]}장`
        : readChapters.join(', ').replace(/,([^,]*)$/, ', $1') + '장';
      setAlreadyReadMessage(`선택한 범위 중 ${readChaptersText}을(를) 이미 읽으셨습니다.`);
    } else {
      // 읽은 장이 없는 경우
      setAlreadyReadMessage('');
    }
  }, [selectedBookName, startChapter, endChapter, selectedBookInfo, completedChapters]);

  // iOS에서 페이지 진입 시 자동으로 마이크 권한 요청
  useEffect(() => {
    if (!isIOS) return;

    const checkAndRequestPermission = async () => {
      // 먼저 권한 상태 확인
      if (navigator.permissions) {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (result.state === 'granted') {
            setMicPermission('granted');
            return;
          } else if (result.state === 'denied') {
            setMicPermission('denied');
            alert('❌ 마이크 권한이 거부된 상태입니다.\n\n설정 → Safari → 마이크에서 이 웹사이트를 허용해주세요.');
            return;
          }
        } catch (e) { }
      }

      // 권한 요청 필요 - 시스템 팝업으로 안내 후 요청
      alert('🎤 마이크 권한이 필요합니다.\n\n다음 화면에서 "허용"을 눌러주세요.');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        setMicPermission('granted');
      } catch (err) {
        console.error('Microphone permission denied:', err);
        setMicPermission('denied');
        alert('❌ 마이크 권한이 거부되었습니다.\n\n설정 → Safari → 마이크에서 이 웹사이트를 허용해주세요.');
      }
    };

    checkAndRequestPermission();
  }, [isIOS]);

  const handleStart = () => {
    setError('');
    onStartReading(selectedBookName, startChapter, endChapter, defaultStartVerse);
  };

  const renderChapterWarning = () => {
    if (alreadyReadMessage) {
      return (
        <p className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded-md text-center">
          {alreadyReadMessage}
        </p>
      );
    }
    return null;
  };

  const chapterOptions = (maxChapter: number) => {
    if (maxChapter === 0) return [<option key="0-na" value="0" disabled>N/A</option>];
    return Array.from({ length: maxChapter }, (_, i) => i + 1).map(ch => (
      <option key={ch} value={ch}>{ch}장</option>
    ));
  };

  return (
    <div className="p-6 bg-white shadow-md rounded-lg space-y-4">
      <h3 className="text-xl font-semibold text-gray-800 text-center">읽을 범위 선택</h3>

      <div>
        <label htmlFor="book-select" className="block text-sm font-medium text-gray-700">성경:</label>
        <select
          id="book-select"
          value={selectedBookName}
          onChange={handleBookChange}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          {AVAILABLE_BOOKS.map(book => (
            <option key={book.name} value={book.name}>{book.name}</option>
          ))}
        </select>
      </div>

      {renderChapterWarning()}

      {/* Chapter selectors are always rendered but may be disabled */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="start-chapter" className="block text-sm font-medium text-gray-700">시작 장:</label>
          <select
            id="start-chapter"
            value={startChapter}
            onChange={handleStartChapterChange}
            disabled={!dataAvailableForBook}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100"
          >
            {chapterOptions(selectedBookInfo?.chapterCount ?? 0)}
          </select>
        </div>
        <div>
          <label htmlFor="end-chapter" className="block text-sm font-medium text-gray-700">종료 장:</label>
          <select
            id="end-chapter"
            value={endChapter}
            onChange={handleEndChapterChange}
            disabled={!dataAvailableForBook}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100"
          >
            {chapterOptions(selectedBookInfo?.chapterCount ?? 0)}
          </select>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 text-center">{error}</p>}

      {/* iOS 마이크 권한 상태 표시 (거부된 경우에만) */}
      {isIOS && micPermission === 'denied' && (
        <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-center">
          <p className="text-sm text-red-700 font-medium">❌ 마이크 권한이 거부되었습니다</p>
          <p className="text-xs text-red-600 mt-1">설정 → Safari → 마이크에서 이 웹사이트를 허용해주세요.</p>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={isLoading || !selectedBookInfo || !dataAvailableForBook || startChapter <= 0 || endChapter <= 0 || startChapter > endChapter || (isIOS && micPermission !== 'granted')}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition duration-150 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isLoading ? '성경 데이터 로딩 중...' : '선택 범위 읽기 시작'}
      </button>

      {/* 라이센스 안내 문구를 하단으로 이동 */}
      <div className="mt-8 text-sm text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-100 text-center break-keep">
        <div className="font-bold mb-1">bibleLog.kr</div>
        <span className="font-medium">개역한글</span> 성경 번역본 사용 안내
        <span className="block mt-1 text-[11px] text-amber-700 opacity-80 leading-relaxed">
          본 서비스는 저작권 문제로 개역한글 번역본을 사용합니다. <br className="hidden md:block" />
          개역개정은 별도 라이센스 비용이 발생하여 사용하지 않습니다.
        </span>
      </div>
    </div>
  );
};

export default ChapterSelector;