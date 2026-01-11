import React, { useState } from 'react';
import * as authService from '../services/authService';
import { User } from '../types';

interface PasswordChangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User;
    onSuccess: (updatedUser: User) => void;
}

const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({ isOpen, onClose, currentUser, onSuccess }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmNewPassword) {
            setError('새 비밀번호가 일치하지 않습니다.');
            return;
        }
        if (newPassword.length < 4) {
            setError('비밀번호는 최소 4자 이상이어야 합니다.');
            return;
        }
        if (newPassword === '1234') {
            setError('새 비밀번호는 기본 비밀번호와 다르게 설정해야 합니다.');
            return;
        }

        setLoading(true);
        try {
            const result = await authService.changePassword(currentUser.id!, newPassword);
            if (result.success && result.user) {
                onSuccess(result.user);
                onClose();
                setNewPassword('');
                setConfirmNewPassword('');
            } else {
                setError(result.message || '비밀번호 변경에 실패했습니다.');
            }
        } catch (err) {
            setError('비밀번호 변경 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
            <div
                className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl animate-fade-in-up"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-8 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <span className="text-2xl">✕</span>
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl shadow-inner backdrop-blur-md">
                            🔐
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight">비밀번호 변경</h2>
                            <p className="text-orange-100 opacity-80 text-xs font-medium">안전한 서비스 이용을 위해 변경해 주세요</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-5 bg-gray-50/50">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 ml-1">새 비밀번호</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="최소 4자 이상"
                                className="w-full p-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all shadow-sm"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 ml-1">비밀번호 확인</label>
                            <input
                                type="password"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                placeholder="비밀번호 다시 입력"
                                className="w-full p-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-500 text-xs font-bold rounded-xl text-center border border-red-100 animate-shake">
                            ⚠️ {error}
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 active:scale-[0.98] disabled:bg-gray-300 disabled:shadow-none"
                        >
                            {loading ? '처리 중...' : '비밀번호 변경 완료'}
                        </button>
                    </div>
                </form>

                <div className="p-4 bg-gray-50 text-center">
                    <button onClick={onClose} className="text-xs text-gray-400 font-bold hover:text-gray-600 transition-colors uppercase tracking-widest">
                        나중에 변경하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordChangeModal;
