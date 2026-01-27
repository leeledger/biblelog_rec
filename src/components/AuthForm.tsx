import React, { useState } from 'react';

interface AuthFormProps {
  onAuth: (username: string, password_provided: string) => Promise<boolean>; // For login, returns true if success, false if fail
  onRegister: (username: string, password_provided: string) => Promise<{ success: boolean; message: string }>;
  title?: string;
}

const AuthForm: React.FC<AuthFormProps> = ({ onAuth, onRegister, title }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('사용자 이름을 입력해주세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    // 회원가입 모드일 때 비밀번호 확인 과정 추가
    if (isRegisterMode) {
      if (password.length < 4) {
        setError('비밀번호는 최소 4자 이상이어야 합니다.');
        return;
      }

      if (password !== confirmPassword) {
        setError('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
        return;
      }
    }

    setError('');
    setSuccessMessage('');

    if (isRegisterMode) {
      try {
        const result = await onRegister(username.trim(), password);
        if (result.success) {
          setSuccessMessage(result.message);
          setUsername('');
          setPassword('');
          setIsRegisterMode(false); // Switch to login mode after successful registration
        } else {
          setError(result.message || '등록에 실패했습니다.');
        }
      } catch (regError) {
        console.error('Registration error in AuthForm:', regError);
        setError('등록 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } else {
      try {
        const loginResult = await onAuth(username.trim(), password);
        // If loginResult is falsy, show password error
        if (!loginResult) {
          setError('비밀번호를 확인하세요.');
        }
      } catch (e) {
        setError('비밀번호를 확인하세요.');
      }
    }
  };

  return (
    <div className="p-8 bg-amber-50 shadow-xl rounded-lg max-w-md mx-auto border-2 border-amber-700 font-serif">
      {/* 모드 전환 탭 */}
      <div className="flex mb-6 border-b border-amber-300">
        <button
          onClick={() => {
            if (isRegisterMode) {
              setIsRegisterMode(false);
              setError('');
              setSuccessMessage('');
              setUsername('');
              setPassword('');
              setConfirmPassword('');
            }
          }}
          className={`flex-1 py-3 text-lg font-medium ${!isRegisterMode ? 'text-amber-900 border-b-2 border-amber-600' : 'text-amber-500'}`}
        >
          로그인
        </button>
        <button
          onClick={() => {
            if (!isRegisterMode) {
              setIsRegisterMode(true);
              setError('');
              setSuccessMessage('');
              setUsername('');
              setPassword('');
              setConfirmPassword('');
            }
          }}
          className={`flex-1 py-3 text-lg font-medium ${isRegisterMode ? 'text-amber-900 border-b-2 border-amber-600' : 'text-amber-500'}`}
        >
          회원가입
        </button>
      </div>

      {/* 설명 텍스트 */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-amber-800 mb-2 text-center">
          {isRegisterMode ? '새로운 계정 만들기' : '말씀 여정의 시작'}
        </h3>
        <p className="text-amber-700 text-sm text-center">
          {isRegisterMode
            ? '원하는 아이디와 비밀번호로 새 계정을 등록하세요'
            : '기존 계정으로 로그인하고 말씀 여정을 이어가세요'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="username" className="block text-md font-medium text-amber-700 mb-1">
            {isRegisterMode ? '새 사용자명:' : '사용자명:'}
          </label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 block w-full px-4 py-2 border border-amber-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 placeholder-amber-400"
            placeholder={isRegisterMode ? '새로운 아이디를 입력하세요' : '기존 아이디를 입력하세요'}
            autoComplete="username"
          />
          {error && !successMessage && <p id="auth-error" className="mt-2 text-sm text-red-700 font-sans">{error}</p>}
          {successMessage && <p id="auth-success" className="mt-2 text-sm text-green-700 font-sans">{successMessage}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-md font-medium text-amber-700 mb-1">
            {isRegisterMode ? '새 비밀번호:' : '비밀번호:'}
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegisterMode ? '사용할 비밀번호를 입력하세요' : '비밀번호를 입력하세요'}
            className="mt-1 block w-full px-4 py-3 bg-amber-100 border border-amber-400 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-lg text-amber-900 placeholder-amber-600"
          />
          {isRegisterMode && (
            <p className="mt-1 text-xs text-amber-600">
              안전한 비밀번호를 사용하세요. <span className="font-medium">최소 4자 이상</span> 권장합니다.
            </p>
          )}
        </div>

        {/* 회원가입 모드일 때만 비밀번호 확인 필드 추가 */}
        {isRegisterMode && (
          <div>
            <label htmlFor="confirm-password" className="block text-md font-medium text-amber-700 mb-1">
              비밀번호 확인:
            </label>
            <input
              type="password"
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="동일한 비밀번호를 다시 입력하세요"
              className="mt-1 block w-full px-4 py-3 bg-amber-100 border border-amber-400 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-lg text-amber-900 placeholder-amber-600"
            />
            <p className="mt-1 text-xs text-amber-600">
              비밀번호를 다시 한번 입력하여 확인합니다.
            </p>
          </div>
        )}

        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-lg shadow-lg hover:shadow-xl transition duration-150 ease-in-out text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${isRegisterMode ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'}`}
        >
          {isRegisterMode ? '새 계정 등록하기' : '말씀으로 들어가기'}
        </button>
      </form>

      <div className="mt-10 text-center text-xs text-gray-400 font-sans select-none break-keep">
        <div className="mb-3 text-sm text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-100">
          <div className="font-black text-amber-900 mb-1 opacity-60">bibleLog.kr</div>
          본 서비스는 저작권 문제로 <span className="font-medium text-amber-900">개역한글</span> 성경 번역본을 사용합니다.
          <span className="block mt-1 text-[10px] text-amber-600 leading-tight">
            (개역개정 번역본은 별도의 라이센스 비용이 발생하여 사용하지 않습니다)
          </span>
        </div>
        <div className="italic text-[10px] text-gray-300">음성 인식 정확도를 위해 조용한 환경을 권장합니다.</div>
      </div>

    </div>
  );
};

export default AuthForm;
