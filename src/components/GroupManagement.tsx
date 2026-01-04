import React, { useState } from 'react';
import { User, Group } from '../types';
import { groupService } from '../services/groupService';

interface GroupManagementProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User;
    userGroups: Group[];
    onGroupAction: () => Promise<void>;
}

const GroupManagement: React.FC<GroupManagementProps> = ({ isOpen, onClose, currentUser, onGroupAction }) => {
    const [activeTab, setActiveTab] = useState<'JOIN' | 'CREATE'>('JOIN');
    const [inviteCode, setInviteCode] = useState('');
    const [groupName, setGroupName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    if (!isOpen) return null;

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteCode || !currentUser.id) return;
        setIsSubmitting(true);
        setMessage(null);
        try {
            const res = await groupService.joinGroup(inviteCode, currentUser.id);
            setMessage({ type: 'success', text: res.message });
            setInviteCode('');
            await onGroupAction();
            setTimeout(onClose, 1500);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupName || !currentUser.id) return;
        setIsSubmitting(true);
        setMessage(null);
        try {
            await groupService.createGroup(groupName, currentUser.id);
            setMessage({ type: 'success', text: `"${groupName}" 그룹이 생성되었습니다!` });
            setGroupName('');
            await onGroupAction();
            setTimeout(onClose, 1500);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-800">통독 공동체 관리</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>

                    <div className="flex border-b border-gray-100 mb-6">
                        <button
                            onClick={() => setActiveTab('JOIN')}
                            className={`flex-1 py-3 font-semibold transition-colors ${activeTab === 'JOIN' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
                        >
                            그룹 참여
                        </button>
                        <button
                            onClick={() => setActiveTab('CREATE')}
                            className={`flex-1 py-3 font-semibold transition-colors ${activeTab === 'CREATE' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
                        >
                            새 그룹 만들기
                        </button>
                    </div>

                    {message && (
                        <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {message.text}
                        </div>
                    )}

                    {activeTab === 'JOIN' ? (
                        <form onSubmit={handleJoin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">초대 코드 8자리</label>
                                <input
                                    type="text"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                    placeholder="예: A1B2C3D4"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none uppercase tracking-widest text-center text-lg font-mono"
                                    maxLength={8}
                                />
                            </div>
                            <button
                                disabled={isSubmitting || inviteCode.length < 4}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? '참여 중...' : '공동체 합류하기'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">그룹 이름</label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    placeholder="예: 청년부 성경 완독모임"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                                />
                            </div>
                            <button
                                disabled={isSubmitting || !groupName}
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? '생성 중...' : '새로운 여정 시작'}
                            </button>
                        </form>
                    )}

                    <p className="mt-6 text-xs text-gray-400 text-center leading-relaxed">
                        함께 읽으면 더 멀리 갈 수 있습니다.<br />초대 코드를 나누어 동역자들을 모아보세요.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GroupManagement;
