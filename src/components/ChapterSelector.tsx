import React, { useState, useEffect } from 'react';
import { AVAILABLE_BOOKS } from '../constants';
import { BookChapterInfo } from '../types'; 

interface ChapterSelectorProps {
  onStartReading: (book: string, startChapter: number, endChapter: number, startVerse?: number) => void;
  defaultBook?: string;
  defaultStartChapter?: number;
  defaultEndChapter?: number;
  defaultStartVerse?: number;
  completedChapters?: string[];
}

const ChapterSelector: React.FC<ChapterSelectorProps> = ({ 
    onStartReading, 
    defaultBook = "창세기",
    defaultStartChapter = 1,
    defaultEndChapter = 1,
    defaultStartVerse = 1,
    completedChapters = [],
}) => {
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
  }, [defaultBook, defaultStartChapter, defaultEndChapter]);

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
      
      <button
        onClick={handleStart}
        disabled={!selectedBookInfo || !dataAvailableForBook || startChapter <= 0 || endChapter <=0 || startChapter > endChapter}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition duration-150 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        선택 범위 읽기 시작
      </button>
      
      {/* 라이센스 안내 문구를 하단으로 이동 */}
      <div className="mt-8 text-sm text-amber-800 bg-amber-50 p-2 rounded-md border border-amber-200 text-center">
        <span className="font-medium">개역한글</span> 성경 번역본 사용 안내
        <span className="block mt-1 text-xs text-amber-700">본 서비스는 저작권 문제로 개역한글 번역본을 사용합니다. 개역개정은 별도 라이센스 비용이 필요합니다.</span>
      </div>
    </div>
  );
};

export default ChapterSelector;