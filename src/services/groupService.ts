import { Group } from '../types';

const API_BASE = '/api';

export const groupService = {
    async createGroup(name: string, ownerId: number): Promise<Group> {
        const response = await fetch(`${API_BASE}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, ownerId }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '그룹 생성에 실패했습니다.');
        }
        return response.json();
    },

    async joinGroup(inviteCode: string, userId: number): Promise<{ message: string; group: Group }> {
        const response = await fetch(`${API_BASE}/groups/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inviteCode, userId }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '그룹 가입에 실패했습니다.');
        }
        return response.json();
    },

    async getUserGroups(userId: number): Promise<Group[]> {
        const response = await fetch(`${API_BASE}/users/${userId}/groups`);
        if (!response.ok) {
            throw new Error('그룹 목록을 가져오는데 실패했습니다.');
        }
        return response.json();
    }
};
