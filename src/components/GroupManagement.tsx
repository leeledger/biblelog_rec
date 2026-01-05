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

const GroupManagement: React.FC<GroupManagementProps> = ({ isOpen, onClose, currentUser, userGroups, onGroupAction }) => {
    const [activeTab, setActiveTab] = useState<'JOIN' | 'CREATE' | 'LIST'>('LIST');
    const [inviteCode, setInviteCode] = useState('');
    const [groupName, setGroupName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // 위임 관련 상태
    const [transferTargetGroupId, setTransferTargetGroupId] = useState<number | null>(null);
    const [groupMembers, setGroupMembers] = useState<{ id: number; username: string }[]>([]);

    if (!isOpen) return null;

    const currentUserId = currentUser.id;
    if (currentUserId === undefined) return null;

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteCode) return;
        setIsSubmitting(true);
        setMessage(null);
        try {
            const res = await groupService.joinGroup(inviteCode, currentUserId);
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
        if (!groupName) return;
        setIsSubmitting(true);
        setMessage(null);
        try {
            await groupService.createGroup(groupName, currentUserId);
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

    const handleLeave = async (groupId: number, groupName: string) => {
        if (!window.confirm(`"${groupName}" 그룹에서 정말 탈퇴하시겠습니까?\n탈퇴 시 해당 그룹에서의 모든 통독 기록이 영구 삭제됩니다.`)) return;

        setIsSubmitting(true);
        setMessage(null);
        try {
            await groupService.leaveGroup(groupId, currentUserId);
            setMessage({ type: 'success', text: '그룹에서 탈퇴되었습니다. 기록이 삭제되었습니다.' });
            await onGroupAction();
            setTimeout(onClose, 1500);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (groupId: number, groupName: string) => {
        if (!window.confirm(`"${groupName}" 그룹을 삭제하시겠습니까?\n모든 멤버와 기록이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`)) return;

        setIsSubmitting(true);
        setMessage(null);
        try {
            await groupService.deleteGroup(groupId, currentUserId);
            setMessage({ type: 'success', text: '그룹이 완전히 삭제되었습니다.' });
            await onGroupAction();
            setTimeout(onClose, 1500);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const startTransfer = async (groupId: number) => {
        setIsSubmitting(true);
        try {
            const members = await groupService.getGroupMembers(groupId);
            // 본인 제외
            setGroupMembers(members.filter(m => m.id !== currentUserId));
            setTransferTargetGroupId(groupId);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTransfer = async (newOwnerId: number, newOwnerName: string) => {
        if (!transferTargetGroupId) return;
        if (!window.confirm(`"${newOwnerName}" 님에게 방장 권한을 넘기시겠습니까?`)) return;

        setIsSubmitting(true);
        try {
            await groupService.transferOwnership(transferTargetGroupId, currentUserId, newOwnerId);
            setMessage({ type: 'success', text: '방장 권한이 위임되었습니다.' });
            setTransferTargetGroupId(null);
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
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-black text-gray-800 tracking-tight">통독 공동체 관리</h2>
                        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-3xl leading-none">&times;</button>
                    </div>

                    <div className="flex bg-gray-50 p-1 rounded-2xl mb-6">
                        <button
                            onClick={() => { setActiveTab('LIST'); setTransferTargetGroupId(null); }}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'LIST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}
                        >
                            내 그룹
                        </button>
                        <button
                            onClick={() => { setActiveTab('JOIN'); setTransferTargetGroupId(null); }}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'JOIN' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}
                        >
                            참여
                        </button>
                        <button
                            onClick={() => { setActiveTab('CREATE'); setTransferTargetGroupId(null); }}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'CREATE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}
                        >
                            생성
                        </button>
                    </div>

                    {message && (
                        <div className={`mb-6 p-4 rounded-2xl text-xs font-bold animate-in slide-in-from-top-2 duration-300 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            {message.type === 'success' ? '✅ ' : '❌ '}{message.text}
                        </div>
                    )}

                    {activeTab === 'LIST' && (
                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                            {transferTargetGroupId ? (
                                <div className="animate-in fade-in duration-300">
                                    <div className="flex items-center gap-2 mb-4">
                                        <button onClick={() => setTransferTargetGroupId(null)} className="text-indigo-600 text-sm font-bold">← 뒤로</button>
                                        <span className="text-sm font-black text-gray-700">방장 위임 대상 선택</span>
                                    </div>
                                    {groupMembers.length === 0 ? (
                                        <div className="text-center py-8">
                                            <p className="text-xs text-gray-400">위임할 수 있는 다른 멤버가 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {groupMembers.map(member => (
                                                <button
                                                    key={member.id}
                                                    onClick={() => handleTransfer(member.id, member.username)}
                                                    className="w-full p-4 bg-gray-50 hover:bg-indigo-50 rounded-2xl text-left transition-colors flex justify-between items-center group border border-transparent hover:border-indigo-100"
                                                >
                                                    <span className="font-bold text-gray-800">{member.username}</span>
                                                    <span className="text-[10px] font-black text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">위임하기</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {userGroups.length === 0 ? (
                                        <div className="text-center py-12">
                                            <p className="text-sm text-gray-400 font-medium">가입된 그룹이 없습니다.</p>
                                            <button
                                                onClick={() => setActiveTab('JOIN')}
                                                className="mt-4 text-xs font-bold text-indigo-600 border-b border-indigo-200"
                                            >참여 코드가 있으신가요?</button>
                                        </div>
                                    ) : (
                                        userGroups.map(group => (
                                            <div key={group.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h4 className="font-black text-gray-800 text-sm">{group.name}</h4>
                                                        <p className="text-[10px] text-gray-400 mt-0.5">코드: {group.invite_code}</p>
                                                    </div>
                                                    {group.owner_id === currentUserId && (
                                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[9px] font-black uppercase">Admin</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-1.5 mt-2">
                                                    {group.owner_id === currentUserId ? (
                                                        <>
                                                            <button
                                                                onClick={() => startTransfer(group.id)}
                                                                className="flex-1 py-2 bg-white text-gray-600 rounded-xl text-[10px] font-black border border-gray-200 hover:bg-gray-100"
                                                            >위임</button>
                                                            <button
                                                                onClick={() => handleDelete(group.id, group.name)}
                                                                className="flex-1 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black border border-rose-100 hover:bg-rose-100"
                                                            >삭제</button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleLeave(group.id, group.name)}
                                                            className="w-full py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black border border-rose-100 hover:bg-rose-100"
                                                        >그룹 탈퇴</button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'JOIN' && (
                        <form onSubmit={handleJoin} className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">초대 코드 8자리</label>
                                <input
                                    type="text"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                    placeholder="예: A1B2C3D4"
                                    className="w-full px-4 py-4 rounded-2xl border border-gray-100 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none uppercase tracking-[.25em] text-center text-xl font-black font-mono transition-all"
                                    maxLength={8}
                                />
                            </div>
                            <button
                                disabled={isSubmitting || inviteCode.length < 4}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                            >
                                {isSubmitting ? '처리 중...' : '공동체 합류하기'}
                            </button>
                        </form>
                    )}

                    {activeTab === 'CREATE' && (
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">그룹 이름</label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    placeholder="예: 청년부 성경 완독모임"
                                    className="w-full px-5 py-4 rounded-2xl border border-gray-100 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none font-bold text-gray-700"
                                />
                            </div>
                            <button
                                disabled={isSubmitting || !groupName}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                            >
                                {isSubmitting ? '생성 중...' : '새로운 여정 시작'}
                            </button>
                        </form>
                    )}

                    <p className="mt-8 text-[10px] text-gray-400 text-center leading-relaxed font-medium">
                        함께 읽으면 더 멀리 갈 수 있습니다.<br />초대 코드를 나누어 동역자들을 모아보세요.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GroupManagement;
