import { User, UserProgress } from '../types';
import { progressService } from './progressService';
import { TOTAL_CHAPTERS_IN_BIBLE } from '../constants';

const USER_SESSION_KEY = 'bible_user';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';



export const loginUser = async (username: string, password_provided: string): Promise<User | null> => { // Added password_provided, changed to async Promise
  // TODO: Call backend API to authenticate user with username and password.
  // For now, we'll keep the existing sessionStorage logic for frontend state.
  console.log(`authService.loginUser called with username: ${username}, password: ${password_provided}`); // Log for now
  // ensureUserExists(username); // This will be handled by the backend login/registration process

  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password: password_provided }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: '로그인 실패 (상태: ' + response.status + ')' }));
      console.error('Login failed:', errorData.message);
      return null;
    }

    const responseData: User & { message: string } = await response.json(); // Backend sends id, username, must_change_password, message
    const loggedInUser: User = {
      id: responseData.id,
      username: responseData.username,
      must_change_password: responseData.must_change_password,
    };

    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(loggedInUser));
    console.log('Login successful, user data:', loggedInUser);
    return loggedInUser;

  } catch (error) {
    console.error('Error during login API call:', error);
    // alert('An unexpected error occurred during login. Please try again.');
    return null;
  }
};

export const logoutUser = (): void => {
  localStorage.removeItem(USER_SESSION_KEY);
};

export const registerUser = async (username: string, password_provided: string): Promise<{ success: boolean; message: string; user?: User }> => {
  console.log(`authService.registerUser called with username: ${username}`);
  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password: password_provided }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Registration failed:', responseData.message);
      return { success: false, message: responseData.message || `회원가입 실패 (상태: ${response.status})` };
    }

    // Registration successful, backend returns user info and a message
    // The user object from register might not include must_change_password directly, or it might be true by default
    // For now, we just confirm success and message.
    console.log('Registration successful:', responseData.message);
    return { success: true, message: responseData.message, user: responseData.user }; // Assuming backend sends user object in responseData.user

  } catch (error) {
    console.error('Error during registration API call:', error);
    const errorMessage = error instanceof Error ? error.message : '회원가입 중 예기치 않은 오류가 발생했습니다.';
    return { success: false, message: errorMessage };
  }
};

export const changePassword = async (userId: number, newPassword_provided: string): Promise<{ success: boolean; message: string; user?: User }> => {
  console.log(`authService.changePassword called for userId: ${userId}`);
  try {
    const response = await fetch(`${API_BASE_URL}/users/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, newPassword: newPassword_provided }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Password change failed:', responseData.message);
      return { success: false, message: responseData.message || '비밀번호 변경 실패 (상태: ' + response.status + ')' };
    }

    console.log('Password change successful:', responseData.message);
    // The backend might return the updated user object, including must_change_password: false
    const updatedUser: User = {
      id: responseData.user.id,
      username: responseData.user.username,
      must_change_password: responseData.user.must_change_password,
    };
    // Update sessionStorage if the user object is returned and matches current user
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === updatedUser.id) {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(updatedUser));
    }

    return { success: true, message: responseData.message, user: updatedUser };

  } catch (error: any) {
    console.error('Error during password change:', error);
    return { success: false, message: '비밀번호 변경 중 오류 발생: ' + (error.message || '알 수 없는 오류') };
  }
};

export const withdrawalUser = async (userId: number): Promise<{ success: boolean; message: string }> => {
  console.log(`authService.withdrawalUser called for userId: ${userId}`);
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: 'DELETE',
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Withdrawal failed:', responseData.message);
      return { success: false, message: responseData.message || '회원 탈퇴 실패 (상태: ' + response.status + ')' };
    }

    console.log('Withdrawal successful:', responseData.message);
    logoutUser(); // 세션 정보 삭제
    return { success: true, message: responseData.message };

  } catch (error: any) {
    console.error('Error during withdrawal:', error);
    return { success: false, message: '회원 탈퇴 중 오류 발생: ' + (error.message || '알 수 없는 오류') };
  }
};

export const getCurrentUser = (): User | null => {
  const userJson = localStorage.getItem(USER_SESSION_KEY);
  if (userJson) {
    try {
      return JSON.parse(userJson) as User;
    } catch (e) {
      console.error("Failed to parse user from local storage", e);
      return null;
    }
  }
  return null;
};

export interface UserWithProgress {
  username: string;
  progress: UserProgress;
  completionRate: number; // Added for leaderboard
  completed_count: number; // 완독 횟수
}

export const getAllUsersWithProgress = async (groupId?: number | null): Promise<UserWithProgress[]> => {
  try {
    const url = groupId ? `/api/users/all?groupId=${groupId}` : '/api/users/all';
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to fetch all users progress, status:', response.status);
      return [];
    }
    // API returns an array of user summaries, not a Record<string, UserProgress>
    // Each summary includes: username, lastReadBook, lastReadChapter, lastReadVerse, lastProgressUpdateDate, completedChaptersCount, completed_count
    const usersSummaryFromApi: Array<{
      username: string;
      lastReadBook: string;
      lastReadChapter: number;
      lastReadVerse: number;
      lastProgressUpdateDate: string | null;
      completedChaptersCount: number;
      completed_count: number;
    }> = await response.json();

    const formattedUsers: UserWithProgress[] = usersSummaryFromApi.map((summary) => {
      // Calculate completionRate based on the entire Bible using completedChaptersCount from API
      const completionRate = TOTAL_CHAPTERS_IN_BIBLE > 0
        ? (summary.completedChaptersCount / TOTAL_CHAPTERS_IN_BIBLE) * 100
        : 0;

      return {
        username: summary.username, // Use username directly from API summary
        progress: {
          lastReadBook: summary.lastReadBook || '',
          lastReadChapter: summary.lastReadChapter || 0,
          lastReadVerse: summary.lastReadVerse || 0,
          history: [], // Full history is not provided by this summary API endpoint
          completedChapters: [], // API provides count, not the full array for this summary
          lastProgressUpdateDate: summary.lastProgressUpdateDate === null ? undefined : summary.lastProgressUpdateDate,
        },
        completionRate, // This is now a percentage (0-100)
        completed_count: summary.completed_count || 0, // 완독 횟수 추가
      };
    });
    return formattedUsers;
  } catch (error) {
    console.error('Error fetching or processing all users progress:', error);
    return []; // 오류 발생 시 빈 배열 반환
  }
};
