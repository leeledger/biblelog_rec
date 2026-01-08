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

  // Derived state for book info
  const selectedBookInfo = useMemo(() =>
    AVAILABLE_BOOKS.find(b => b.name === selectedBookName),
    [selectedBookName]
  );

  const dataAvailableForBook = !!selectedBookInfo;

  const [startChapter, setStartChapter] = useState<number>(Number(defaultStartChapter) || 1);
  const [endChapter, setEndChapter] = useState<number>(Number(defaultEndChapter) || 1);
  const [error, setError] = useState<string>('');
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
    // Only update if props are different from current state to avoid loops.
    // Important: We update book and chapters together to prevent the validation effect
    // from seeing an intermediate state (e.g., old book + new chapter).
    const needsUpdate = defaultBook !== selectedBookName ||
      (Number(defaultStartChapter) || 1) !== startChapter ||
      (Number(defaultEndChapter) || 1) !== endChapter;

    if (needsUpdate) {
      setSelectedBookName(defaultBook);
      setStartChapter(Number(defaultStartChapter) || 1);
      setEndChapter(Number(defaultEndChapter) || 1);
      // Reset error when props change to let validation effect run on fresh state
      setError('');
    }
  }, [defaultBook, defaultStartChapter, defaultEndChapter]);

  // Effect for validation of chapters and checking read status
  useEffect(() => {
    if (!selectedBookInfo) {
      if (selectedBookName) {
        setError(`"${selectedBookName}" 책을 찾을 수 없습니다. 목록에서 올바른 책을 선택해주세요.`);
      }
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

  // iOS에서 페이지 진입 시 자동으로 마이크 권한을 요청하던 로직을 제거했습니다.
  // 이제 App.tsx의 handleSelectChaptersAndStartReading에서 읽기 시작 버튼 클릭 시 
  // 선제적으로 권한을 확인하고 로딩 화면을 보여주는 방식으로 개선되었습니다.
  useEffect(() => {
    if (!isIOS) return;

    // 단순 권한 상태만 체크 (팝업 띄우지 않음)
    const checkPermissionStatus = async () => {
      if (navigator.permissions) {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicPermission(result.state as any);
          result.onchange = () => setMicPermission(result.state as any);
        } catch (e) { }
      }
    };
    checkPermissionStatus();
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
        <label htmlFor="book-select" className="block text-sm font-medium text-gray-700">
          성경: {isLoading && <span className="text-xs text-indigo-600 font-normal ml-2 animate-pulse">(로딩 중...)</span>}
        </label>
        <select
          id="book-select"
          value={selectedBookName}
          onChange={handleBookChange}
          disabled={isLoading}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-wait"
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
            disabled={!dataAvailableForBook || isLoading}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
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
            disabled={!dataAvailableForBook || isLoading}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
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
        disabled={isLoading || !selectedBookInfo || !dataAvailableForBook || startChapter <= 0 || endChapter <= 0 || startChapter > endChapter || (isIOS && micPermission === 'denied')}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition duration-150 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isLoading ? '성경 데이터 로딩 중...' : '선택 범위 읽기 시작'}
      </button>

    </div>
  );
};

export default ChapterSelector;