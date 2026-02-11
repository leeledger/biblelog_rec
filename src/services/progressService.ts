import { UserProgress } from '../types';
import { TOTAL_CHAPTERS_IN_BIBLE, AVAILABLE_BOOKS } from '../constants';

const API_URL = '/api/progress';
const getCompletedChaptersKey = (username: string) => `completedBibleChapters_${username}`;

export const progressService = {
  getTotalChaptersInScope: (): number => {
    return AVAILABLE_BOOKS.reduce((sum, book) => sum + book.chapterCount, 0);
  },
  async loadUserProgress(username: string, groupId?: number | null): Promise<UserProgress> {
    console.log(`[progressService.ts] loadUserProgress CALLED for user: ${username}, group: ${groupId}`);
    try {
      const url = groupId ? `${API_URL}/${username}?groupId=${groupId}` : `${API_URL}/${username}`;
      const response = await fetch(url);
      if (!response.ok || response.headers.get('content-length') === '0') {
        return { lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, history: [], completedChapters: [], groupId };
      }
      const progress = await response.json();
      return { ...progress, completedChapters: progress.completedChapters || [], groupId };
    } catch (error) {
      console.error(`[progressService.ts] loadUserProgress error:`, error);
      return { lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, history: [], completedChapters: [], groupId };
    }
  },

  async saveUserProgress(username: string, progress: UserProgress): Promise<void> {
    try {
      await fetch(`${API_URL}/${username}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(progress), // UserProgress now contains groupId
      });
    } catch (error) {
      console.error('Failed to save user progress:', error);
    }
  },

  getCompletedChapters: async (username: string, groupId?: number | null): Promise<string[]> => {
    if (!username) return [];
    try {
      const userProgress = await progressService.loadUserProgress(username, groupId);
      return userProgress.completedChapters || [];
    } catch (error) {
      console.error('Error fetching completed chapters:', error);
      return [];
    }
  },

  calculateCompletionRate: async (username: string, groupId?: number | null): Promise<number> => {
    try {
      const userProgress = await progressService.loadUserProgress(username, groupId);
      const completedChapters = userProgress.completedChapters || [];
      const completedChaptersCount = completedChapters.length;
      if (TOTAL_CHAPTERS_IN_BIBLE === 0) return 0;
      return completedChaptersCount / TOTAL_CHAPTERS_IN_BIBLE;
    } catch (error) {
      console.error(`Error calculating completion rate:`, error);
      return 0;
    }
  },

  async resetBibleProgress(username: string): Promise<boolean> {
    try {
      const response = await fetch('/api/bible-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: username }), // 실제 API 스펙에 맞춰 userId 또는 username 전달
      });
      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to reset bible progress:', error);
      return false;
    }
  },
};
