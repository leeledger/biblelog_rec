import React, { useState } from 'react';
import { User } from '../types';
import * as authService from '../services/authService';

interface MyPageProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User;
    onLogout: () => void;
    onPasswordChange: () => void;
}

const MyPage: React.FC<MyPageProps> = ({ isOpen, onClose, currentUser, onLogout, onPasswordChange }) => {
    const [isWithdrawalConfirmOpen, setIsWithdrawalConfirmOpen] = useState(false);
    const [isWithdrawalLoading, setIsWithdrawalLoading] = useState(false);

    if (!isOpen) return null;

    const handleWithdrawal = async () => {
        if (!currentUser.id) return;

        setIsWithdrawalLoading(true);
        try {
            const result = await authService.withdrawalUser(currentUser.id);
            if (result.success) {
                alert(result.message);
                onLogout();
            } else {
                alert(result.message);
            }
        } catch (e) {
            alert('회원 탈퇴 중 오류가 발생했습니다.');
        } finally {
            setIsWithdrawalLoading(false);
            setIsWithdrawalConfirmOpen(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div
                className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-fade-in-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <span className="text-2xl">✕</span>
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl shadow-inner backdrop-blur-md">
                            👤
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight">마이페이지</h2>
                            <p className="text-indigo-100 opacity-80 font-medium">{currentUser.username} 성도님</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 space-y-4 bg-gray-50/50">
                    <div className="grid grid-cols-1 gap-3">
                        {/* Password Change Button */}
                        <button
                            onClick={() => {
                                onPasswordChange();
                                onClose();
                            }}
                            className="w-full p-5 bg-white border border-gray-100 rounded-2xl flex items-center justify-between group hover:border-indigo-200 hover:shadow-md transition-all active:scale-[0.98]"
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-2xl group-hover:rotate-12 transition-transform">🔐</span>
                                <span className="font-bold text-gray-700">비밀번호 변경</span>
                            </div>
                            <span className="text-gray-300 group-hover:text-indigo-500 transition-colors">❯</span>
                        </button>

                        {/* Logout Button */}
                        <button
                            onClick={onLogout}
                            className="w-full p-5 bg-white border border-gray-100 rounded-2xl flex items-center justify-between group hover:border-orange-200 hover:shadow-md transition-all active:scale-[0.98]"
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-2xl group-hover:translate-x-1 transition-transform">🚪</span>
                                <span className="font-bold text-gray-700">로그아웃</span>
                            </div>
                            <span className="text-gray-300 group-hover:text-orange-500 transition-colors">❯</span>
                        </button>

                        {/* Withdrawal Button */}
                        <div className="pt-4 mt-4 border-t border-gray-100">
                            <button
                                onClick={() => setIsWithdrawalConfirmOpen(true)}
                                className="w-full p-4 text-sm font-bold text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>⚠️</span>
                                <span>회원 탈퇴하기</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer info */}
                <div className="p-6 text-center bg-gray-50 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Bible Companion v2.0</p>
                </div>
            </div>

            {/* Withdrawal Confirmation Modal */}
            {isWithdrawalConfirmOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl text-center space-y-6 animate-fade-in-up">
                        <div className="text-5xl">😭</div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-gray-900">정말 떠나시나요?</h3>
                            <p className="text-sm text-gray-500 leading-relaxed px-4">
                                탈퇴하시면 그동안 정성스럽게 기록된 <br />
                                <span className="text-indigo-600 font-bold">모든 통독 진행 데이터가 삭제</span>되며 <br />
                                복구가 불가능합니다.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setIsWithdrawalConfirmOpen(false)}
                                className="p-4 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                                disabled={isWithdrawalLoading}
                            >
                                더 읽어볼게요
                            </button>
                            <button
                                onClick={handleWithdrawal}
                                className="p-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                                disabled={isWithdrawalLoading}
                            >
                                {isWithdrawalLoading ? '처리 중...' : '네, 탈퇴할게요'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyPage;
