import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as db from './db.js';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// R2 Storage configuration
const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // R2 경로 스타일 강제 (Signature 이슈 해결 시도)
});

const app = express();
const saltRounds = 10;

// Helper: Generate a unique invite code
const generateInviteCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
};

app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));
// 오디오/비디오 바이너리를 좀 더 유연하게 수신하기 위해 타입 확장
app.use(bodyParser.raw({ type: ['audio/*', 'video/*', 'application/octet-stream'], limit: '20mb' }));

// Initialize DB on first request (simple way for serverless)
let isDbInitialized = false;
app.use(async (req, res, next) => {
    if (!isDbInitialized) {
        await db.initializeDatabase();
        isDbInitialized = true;
    }
    next();
});

// Endpoint for user registration
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    try {
        const existingUserResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existingUserResult.rows.length > 0) {
            return res.status(409).json({ message: '이미 존재하는 아이디입니다.' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUserResult = await db.query(
            'INSERT INTO users (username, password, must_change_password) VALUES ($1, $2, $3) RETURNING id, username, must_change_password',
            [username, hashedPassword, false]
        );
        const newUser = newUserResult.rows[0];
        res.status(201).json({
            id: newUser.id,
            username: newUser.username,
            message: '사용자 등록이 완료되었습니다. 로그인해주세요.'
        });
    } catch (error) {
        console.error(`[POST /api/register] Error:`, error);
        res.status(500).json({ message: '사용자 등록 중 오류가 발생했습니다.' });
    }
});

// Endpoint for user login
app.post('/api/login', async (req, res) => {
    const { username, password: providedPassword } = req.body;
    if (!username || !providedPassword) {
        return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });
    }

    try {
        const userResult = await db.query('SELECT id, username, password, must_change_password FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }

        const user = userResult.rows[0];
        if (user.password === null) {
            if (providedPassword === '1234' && user.must_change_password) {
                return res.status(200).json({
                    id: user.id,
                    username: user.username,
                    must_change_password: true,
                    message: '로그인 성공. 임시 비밀번호를 변경해주세요.'
                });
            } else {
                return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
            }
        }

        const passwordMatch = await bcrypt.compare(providedPassword, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }

        res.status(200).json({
            id: user.id,
            username: user.username,
            must_change_password: user.must_change_password,
            message: '로그인 성공'
        });
    } catch (error) {
        console.error(`[POST /api/login] Error:`, error);
        res.status(500).json({ message: '로그인 처리 중 오류가 발생했습니다.' });
    }
});

// Endpoint to update microphone permission status
app.post('/api/users/:userId/mic-permission', async (req, res) => {
    const { userId } = req.params;
    const { granted } = req.body;

    try {
        await db.query(
            'UPDATE users SET mic_permission_granted = $1 WHERE id = $2',
            [granted, userId]
        );
        res.status(200).json({ success: true, message: '마이크 권한 상태가 업데이트되었습니다.' });
    } catch (error) {
        console.error(`[POST /api/users/${userId}/mic-permission] Error:`, error);
        res.status(500).json({ message: '권한 업데이트 중 오류가 발생했습니다.' });
    }
});

// Endpoint to change user password
app.post('/api/users/change-password', async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
        return res.status(400).json({ message: '사용자 ID와 새 비밀번호가 필요합니다.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        const updateResult = await db.query(
            'UPDATE users SET password = $1, must_change_password = $2 WHERE id = $3 RETURNING id, username, must_change_password',
            [hashedPassword, false, userId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        res.status(200).json({
            message: '비밀번호가 성공적으로 변경되었습니다.',
            user: updateResult.rows[0]
        });
    } catch (error) {
        console.error(`[POST /api/users/change-password] Error:`, error);
        res.status(500).json({ message: '비밀번호 변경 중 오류가 발생했습니다.' });
    }
});

// Endpoint for user withdrawal (delete account)
app.delete('/api/users/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ message: '사용자 ID가 필요합니다.' });
    }

    try {
        await db.query('DELETE FROM users WHERE id = $1', [userId]);
        res.status(200).json({ message: '회원 탈퇴가 완료되었습니다. 그동안 이용해주셔서 감사합니다.' });
    } catch (error) {
        console.error(`[DELETE /api/users/${userId}] Error:`, error);
        res.status(500).json({ message: '회원 탈퇴 처리 중 오류가 발생했습니다.' });
    }
});

// Get user progress (Optionally for a specific group)
app.get('/api/progress/:username', async (req, res) => {
    const { username } = req.params;
    const { groupId } = req.query; // groupId can be undefined, null, or a number

    try {
        const userResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.json({ lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, history: [], completedChapters: [], lastProgressUpdateDate: null });
        }
        const userId = userResult.rows[0].id;

        const progressResult = await db.query(
            groupId
                ? 'SELECT last_read_book, last_read_chapter, last_read_verse, updated_at FROM reading_progress WHERE user_id = $1 AND group_id = $2'
                : 'SELECT last_read_book, last_read_chapter, last_read_verse, updated_at FROM reading_progress WHERE user_id = $1 AND group_id IS NULL',
            groupId ? [userId, groupId] : [userId]
        );

        let userProgressData = { lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, lastProgressUpdateDate: null };
        if (progressResult.rows.length > 0) {
            const p = progressResult.rows[0];
            userProgressData = {
                lastReadBook: p.last_read_book,
                lastReadChapter: p.last_read_chapter,
                lastReadVerse: p.last_read_verse,
                lastProgressUpdateDate: p.updated_at
            };
        }

        const completedChaptersResult = await db.query(
            groupId
                ? 'SELECT book_name, chapter_number FROM completed_chapters WHERE user_id = $1 AND group_id = $2'
                : 'SELECT book_name, chapter_number FROM completed_chapters WHERE user_id = $1 AND group_id IS NULL',
            groupId ? [userId, groupId] : [userId]
        );
        const completedChapters = completedChaptersResult.rows.map(c => `${c.book_name}:${c.chapter_number}`);

        res.json({
            ...userProgressData,
            completedChapters: completedChapters,
            history: []
        });
    } catch (error) {
        console.error(`[GET /api/progress/:username] Error:`, error);
        res.status(500).json({ message: '진도 정보를 불러오는 중 오류가 발생했습니다.' });
    }
});

// Save user progress
app.post('/api/progress/:username', async (req, res) => {
    const { username } = req.params;
    const { lastReadBook, lastReadChapter, lastReadVerse, history, completedChapters, groupId } = req.body;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        let userResult = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        let userId;

        if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
        } else {
            const newUserResult = await client.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [username]);
            userId = newUserResult.rows[0].id;
        }

        const progressQuery = groupId ? `
      INSERT INTO reading_progress (user_id, group_id, last_read_book, last_read_chapter, last_read_verse, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, group_id) WHERE group_id IS NOT NULL
      DO UPDATE SET
        last_read_book = EXCLUDED.last_read_book,
        last_read_chapter = EXCLUDED.last_read_chapter,
        last_read_verse = EXCLUDED.last_read_verse,
        updated_at = NOW();
    ` : `
      INSERT INTO reading_progress (user_id, group_id, last_read_book, last_read_chapter, last_read_verse, updated_at)
      VALUES ($1, NULL, $2, $3, $4, NOW())
      ON CONFLICT (user_id) WHERE group_id IS NULL
      DO UPDATE SET
        last_read_book = EXCLUDED.last_read_book,
        last_read_chapter = EXCLUDED.last_read_chapter,
        last_read_verse = EXCLUDED.last_read_verse,
        updated_at = NOW();
    `;

        if (groupId) {
            await client.query(progressQuery, [userId, groupId, lastReadBook, lastReadChapter, lastReadVerse]);
        } else {
            await client.query(progressQuery, [userId, lastReadBook, lastReadChapter, lastReadVerse]);
        }

        if (completedChapters && completedChapters.length > 0) {
            // 배치 INSERT로 성능 개선 - 모든 장을 한 번의 쿼리로 처리
            const validChapters = completedChapters
                .map(chapterStr => {
                    const [book, chapterNumStr] = chapterStr.split(':');
                    const chapterNum = parseInt(chapterNumStr, 10);
                    return (book && !isNaN(chapterNum)) ? { book, chapterNum } : null;
                })
                .filter(c => c !== null);

            if (validChapters.length > 0) {
                const values = validChapters.map((_, i) =>
                    `($1, $2, $${i * 2 + 3}, $${i * 2 + 4}, NOW())`
                ).join(', ');

                const params = [userId, groupId || null];
                validChapters.forEach(c => {
                    params.push(c.book, c.chapterNum);
                });

                // Postgre IS NOT NULL index usage requires WHERE clause in ON CONFLICT
                let conflictClause = '';
                if (groupId) {
                    conflictClause = 'ON CONFLICT (user_id, group_id, book_name, chapter_number) WHERE group_id IS NOT NULL DO NOTHING';
                } else {
                    conflictClause = 'ON CONFLICT (user_id, book_name, chapter_number) WHERE group_id IS NULL DO NOTHING';
                }

                const batchInsertQuery = `
                    INSERT INTO completed_chapters (user_id, group_id, book_name, chapter_number, completed_at)
                    VALUES ${values}
                    ${conflictClause};
                `;
                await client.query(batchInsertQuery, params);
            }
        }

        if (history && history.length > 0) {
            // history도 배치 INSERT로 처리
            const historyValues = history.map((_, i) =>
                `($1, $2, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5}, $${i * 4 + 6})`
            ).join(', ');

            const historyParams = [userId, groupId || null];
            history.forEach(entry => {
                historyParams.push(entry.book, entry.startChapter, entry.startVerse, new Date(entry.date));
            });

            const batchHistoryQuery = `
                INSERT INTO reading_history (user_id, group_id, book_name, chapter_number, verse_number, read_at)
                VALUES ${historyValues};
            `;
            await client.query(batchHistoryQuery, historyParams);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: '진도가 성공적으로 저장되었습니다.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[POST /api/progress/:username] Error:`, error);
        res.status(500).json({ message: '진도 저장 중 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

// Leaderboard (Optionally filtered by group)
app.get('/api/users/all', async (req, res) => {
    const { groupId } = req.query;
    try {
        let query;
        let params = [];

        if (groupId) {
            query = `
            WITH chapter_counts AS (
                SELECT user_id, COUNT(*) as count 
                FROM completed_chapters 
                WHERE group_id = $1 
                GROUP BY user_id
            ),
            hof_counts AS (
                SELECT user_id, COUNT(*) as count 
                FROM hall_of_fame 
                WHERE group_id = $1 
                GROUP BY user_id
            )
            SELECT 
              u.username,
              COALESCE(rp.last_read_book, '') AS "lastReadBook",
              COALESCE(rp.last_read_chapter, 0) AS "lastReadChapter",
              COALESCE(rp.last_read_verse, 0) AS "lastReadVerse",
              rp.updated_at AS "lastProgressUpdateDate",
              COALESCE(cc.count, 0) AS "completedChaptersCount",
              COALESCE(hf.count, 0) AS "completed_count"
            FROM users u
            JOIN group_members gm ON u.id = gm.user_id
            LEFT JOIN reading_progress rp ON u.id = rp.user_id AND rp.group_id = $1
            LEFT JOIN chapter_counts cc ON u.id = cc.user_id
            LEFT JOIN hof_counts hf ON u.id = hf.user_id
            WHERE gm.group_id = $1
              AND (COALESCE(cc.count, 0) > 0 OR COALESCE(hf.count, 0) > 0)
            ORDER BY "completedChaptersCount" DESC, "completed_count" DESC, u.username;
        `;
            params = [groupId];
        } else {
            query = `
            WITH chapter_counts AS (
                SELECT user_id, COUNT(*) as count 
                FROM completed_chapters 
                WHERE group_id IS NULL 
                GROUP BY user_id
            ),
            hof_counts AS (
                SELECT user_id, COUNT(*) as count 
                FROM hall_of_fame 
                WHERE group_id IS NULL 
                GROUP BY user_id
            )
            SELECT 
              u.username,
              COALESCE(rp.last_read_book, '') AS "lastReadBook",
              COALESCE(rp.last_read_chapter, 0) AS "lastReadChapter",
              COALESCE(rp.last_read_verse, 0) AS "lastReadVerse",
              rp.updated_at AS "lastProgressUpdateDate",
              COALESCE(cc.count, 0) AS "completedChaptersCount",
              COALESCE(hf.count, 0) AS "completed_count"
            FROM users u
            LEFT JOIN reading_progress rp ON u.id = rp.user_id AND rp.group_id IS NULL
            LEFT JOIN chapter_counts cc ON u.id = cc.user_id
            LEFT JOIN hof_counts hf ON u.id = hf.user_id
            WHERE (COALESCE(cc.count, 0) > 0 OR COALESCE(hf.count, 0) > 0)
            ORDER BY "completedChaptersCount" DESC, "completed_count" DESC, u.username;
        `;
        }

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('[GET /api/users/all] Error:', error);
        res.status(500).json({ message: '전체 사용자 요약을 불러오는 중 오류가 발생했습니다.' });
    }
});

app.get('/api/hall-of-fame', async (req, res) => {
    const { groupId: groupIdParam } = req.query;

    // NaN, 'null', 'undefined', 빈 문자열 모두 개인 통독(null)으로 처리
    let groupId = null;
    if (groupIdParam && groupIdParam !== 'null' && groupIdParam !== 'undefined' && groupIdParam !== 'NaN') {
        const parsed = parseInt(groupIdParam, 10);
        groupId = isNaN(parsed) ? null : parsed;
    }

    console.log(`[HOF] Filtering for: ${groupId === null ? 'Personal' : 'Group ' + groupId}`);

    try {
        let query = 'SELECT h.user_id, u.username, h.round, h.completed_at, h.group_id FROM hall_of_fame h JOIN users u ON h.user_id = u.id';
        let params = [];

        if (groupId === null) {
            query += ' WHERE h.group_id IS NULL';
        } else {
            query += ' WHERE h.group_id = $1';
            params.push(groupId);
        }

        query += ' ORDER BY h.completed_at DESC';

        const result = await db.query(query, params);
        console.log(`[HOF] Found ${result.rows.length} entries`);
        res.json(result.rows);
    } catch (err) {
        console.error('[HOF] Error:', err);
        res.status(500).json({ message: '명예의 전당 정보를 불러오는 중 오류가 발생했습니다.' });
    }
});

app.post('/api/bible-reset', async (req, res) => {
    const { userId, groupId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    try {
        const result = await db.handleBibleCompletion(userId, groupId || null);
        res.json(result);
    } catch (err) {
        console.error('Error resetting bible progress:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Group Management APIs ---

// Create a new group
app.post('/api/groups', async (req, res) => {
    const { name, ownerId } = req.body;
    if (!name || !ownerId) return res.status(400).json({ message: 'Name and ownerId are required' });

    try {
        const inviteCode = generateInviteCode();
        const groupResult = await db.query(
            'INSERT INTO groups (name, invite_code, owner_id) VALUES ($1, $2, $3) RETURNING *',
            [name, inviteCode, ownerId]
        );
        const group = groupResult.rows[0];

        // Automatically join the creator
        await db.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
            [group.id, ownerId]
        );

        res.status(201).json(group);
    } catch (error) {
        console.error('[POST /api/groups] Error:', error);
        res.status(500).json({ message: '그룹 생성 중 오류가 발생했습니다.' });
    }
});

// Join a group using invite code
app.post('/api/groups/join', async (req, res) => {
    const { inviteCode, userId } = req.body;
    if (!inviteCode || !userId) return res.status(400).json({ message: 'Invite code and userId are required' });

    try {
        const groupResult = await db.query('SELECT id, name FROM groups WHERE invite_code = $1', [inviteCode.toUpperCase()]);
        if (groupResult.rows.length === 0) {
            return res.status(404).json({ message: '유효하지 않은 초대 코드입니다.' });
        }
        const group = groupResult.rows[0];

        // Check if already a member
        const memberCheck = await db.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [group.id, userId]);
        if (memberCheck.rows.length > 0) {
            return res.status(409).json({ message: '이미 이 그룹의 멤버입니다.' });
        }

        await db.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [group.id, userId]);
        res.status(200).json({ message: `${group.name} 그룹에 성공적으로 가입되었습니다.`, group });
    } catch (error) {
        console.error('[POST /api/groups/join] Error:', error);
        res.status(500).json({ message: '그룹 가입 중 오류가 발생했습니다.' });
    }
});

// List groups for a user
app.get('/api/users/:userId/groups', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await db.query(
            `SELECT g.*, u.username as owner_name FROM groups g 
             JOIN group_members gm ON g.id = gm.group_id 
             LEFT JOIN users u ON g.owner_id = u.id
             WHERE gm.user_id = $1 
             ORDER BY g.created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('[GET /api/users/:userId/groups] Error:', error);
        res.status(500).json({ message: '사용자 그룹 정보를 불러오는 중 오류가 발생했습니다.' });
    }
});

// List members of a group
app.get('/api/groups/:groupId/members', async (req, res) => {
    const { groupId } = req.params;
    try {
        const result = await db.query(
            `SELECT u.id, u.username FROM users u
             JOIN group_members gm ON u.id = gm.user_id
             WHERE gm.group_id = $1
             ORDER BY u.username`,
            [groupId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('[GET /api/groups/:groupId/members] Error:', error);
        res.status(500).json({ message: '그룹 멤버 정보를 불러오는 중 오류가 발생했습니다.' });
    }
});

// Leave a group (removes all records for that user in that group)
app.post('/api/groups/:groupId/leave', async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Remove reading progress
        await client.query('DELETE FROM reading_progress WHERE user_id = $1 AND group_id = $2', [userId, groupId]);
        // 2. Remove completed chapters
        await client.query('DELETE FROM completed_chapters WHERE user_id = $1 AND group_id = $2', [userId, groupId]);
        // 3. Remove reading history
        await client.query('DELETE FROM reading_history WHERE user_id = $1 AND group_id = $2', [userId, groupId]);
        // 4. Remove hall of fame records
        await client.query('DELETE FROM hall_of_fame WHERE user_id = $1 AND group_id = $2', [userId, groupId]);
        // 5. Remove from group members
        await client.query('DELETE FROM group_members WHERE user_id = $1 AND group_id = $2', [userId, groupId]);

        await client.query('COMMIT');
        res.json({ message: '그룹탈퇴가 완료되었으며, 해당 그룹의 모든 활동 기록이 삭제되었습니다.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[POST /api/groups/:groupId/leave] Error:', error);
        res.status(500).json({ message: '그룹 탈퇴 중 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

// Delete a group (owner only)
app.delete('/api/groups/:groupId', async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.query; // Authenticating with userId from query for simplicity in this dev environment
    try {
        // Check ownership
        const groupRes = await db.query('SELECT owner_id FROM groups WHERE id = $1', [groupId]);
        if (groupRes.rows.length === 0) {
            return res.status(404).json({ message: '그룹을 찾을 수 없습니다.' });
        }
        if (groupRes.rows[0].owner_id != userId) {
            return res.status(403).json({ message: '그룹장만 그룹을 삭제할 수 있습니다.' });
        }

        // Delete group (CASCADE handles members, records, etc.)
        await db.query('DELETE FROM groups WHERE id = $1', [groupId]);
        res.json({ message: '그룹이 삭제되었습니다.' });
    } catch (error) {
        console.error('[DELETE /api/groups/:groupId] Error:', error);
        res.status(500).json({ message: '그룹 삭제 중 오류가 발생했습니다.' });
    }
});

// Transfer group ownership
app.post('/api/groups/:groupId/transfer-ownership', async (req, res) => {
    const { groupId } = req.params;
    const { currentOwnerId, newOwnerId } = req.body;
    try {
        // Check current ownership
        const groupRes = await db.query('SELECT owner_id FROM groups WHERE id = $1', [groupId]);
        if (groupRes.rows.length === 0) {
            return res.status(404).json({ message: '그룹을 찾을 수 없습니다.' });
        }
        if (groupRes.rows[0].owner_id != currentOwnerId) {
            return res.status(403).json({ message: '현재 그룹장만 권한을 위임할 수 있습니다.' });
        }

        // Check if new owner is a member
        const memberRes = await db.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, newOwnerId]);
        if (memberRes.rows.length === 0) {
            return res.status(400).json({ message: '새 그룹장은 반드시 그룹의 멤버여야 합니다.' });
        }

        // Update ownership
        await db.query('UPDATE groups SET owner_id = $1 WHERE id = $2', [newOwnerId, groupId]);
        res.json({ message: '그룹장 권한이 위임되었습니다.' });
    } catch (error) {
        console.error('[POST /api/groups/:groupId/transfer-ownership] Error:', error);
        res.status(500).json({ message: '그룹장 권한 위임 중 오류가 발생했습니다.' });
    }
});



// --- Audio Recording APIs ---

// 1. Get presigned URL for upload
app.post('/api/audio/presign', async (req, res) => {
    try {
        let { userId, bookName, chapter, verse, contentType } = req.body;

        if (contentType && contentType.includes(';')) {
            contentType = contentType.split(';')[0].trim();
        }

        const timestamp = Date.now();
        let ext = 'webm';
        if (contentType) {
            if (contentType.includes('mp4')) ext = 'mp4';
            else if (contentType.includes('aac')) ext = 'aac';
            else if (contentType.includes('ogg')) ext = 'ogg';
            else if (contentType.includes('mpeg')) ext = 'mp3';
        }

        const fileKey = `recordings/${userId}/rec_${timestamp}.${ext}`;
        const bucketName = process.env.R2_BUCKET_NAME;

        console.log(`[AUDIO/PRESIGN] Request user:${userId}, bucket:${bucketName}, key:${fileKey}, type:${contentType}`);

        if (!bucketName) {
            console.error('[AUDIO/PRESIGN] Critical error: R2_BUCKET_NAME is not defined!');
            return res.status(500).json({ message: 'Storage configuration missing (Bucket)' });
        }

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
            ContentType: 'application/octet-stream', // 명시적으로 타입을 지정하여 서명에 포함
        });

        const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
        console.log(`[AUDIO/PRESIGN] Success: Presigned URL generated.`);

        res.json({ uploadUrl, fileKey });
    } catch (error) {
        console.error('[POST /api/audio/presign] Error:', error);
        res.status(500).json({ message: '업로드 URL 생성 중 오류가 발생했습니다.' });
    }
});

// 2. Record metadata in DB
app.post('/api/audio/record', async (req, res) => {
    try {
        const { userId, groupId, fileKey, bookName, chapter, verse, durationSeconds, fileSizeBytes } = req.body;

        await db.query(
            `INSERT INTO audio_recordings (user_id, group_id, file_key, book_name, chapter_number, verse_number, duration_seconds, file_size_bytes) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, groupId, fileKey, bookName, chapter, verse, durationSeconds, fileSizeBytes]
        );

        console.log(`[AUDIO/RECORD] Success: Metadata saved to DB.`);
        res.json({ success: true });
    } catch (error) {
        console.error('[POST /api/audio/record] Error:', error);
        res.status(500).json({ message: '녹음 기록 저장 중 오류가 발생했습니다.' });
    }
});

// 3. Proxy Upload: Receive file from client and upload to R2 (CORS Bypass)
app.post('/api/audio/upload-proxy', async (req, res) => {
    try {
        const { userid, bookname, chapter, verse, contenttype } = req.headers;
        const body = req.body;

        // 상세 로깅 (서버 로그용)
        console.log(`[AUDIO/PROXY] Request info - user:${userid}, type:${contenttype}, size:${body?.length}`);

        if (!body || body.length === 0 || !Buffer.isBuffer(body)) {
            const errorMsg = !body ? 'No body' : (body.length === 0 ? 'Empty body' : 'Not a Buffer');
            console.error(`[AUDIO/PROXY] Data error: ${errorMsg}`);
            return res.status(400).json({ message: `파일 데이터 이상: ${errorMsg}` });
        }

        const timestamp = Date.now();
        let ext = 'webm';
        const contentTypeStr = String(contenttype || '');
        if (contentTypeStr.includes('mp4')) ext = 'mp4';
        else if (contentTypeStr.includes('aac')) ext = 'aac';
        else if (contentTypeStr.includes('ogg')) ext = 'ogg';
        else if (contentTypeStr.includes('mpeg')) ext = 'mp3';

        const fileKey = `recordings/${userid || 'unknown'}/rec_${timestamp}.${ext}`;
        const bucketName = process.env.R2_BUCKET_NAME;

        if (!bucketName) {
            console.error('[AUDIO/PROXY] Error: R2_BUCKET_NAME is missing');
            return res.status(500).json({ message: '서버 설정 오류 (Bucket name missing)' });
        }

        const safeContentType = contentTypeStr.split(';')[0].trim() || 'application/octet-stream';

        console.log(`[AUDIO/PROXY] Attempting R2 upload: ${fileKey} (${body.length} bytes), Type: ${safeContentType}`);

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
            ContentType: safeContentType,
            Body: body,
        });

        const r2Response = await r2Client.send(command);
        console.log(`[AUDIO/PROXY] Success: Uploaded to R2. ETag: ${r2Response.ETag}`);

        res.json({ success: true, fileKey });
    } catch (error) {
        console.error('[POST /api/audio/upload-proxy] Full Error:', error);
        // 에러 메시지를 좀 더 상세히 내려주어 폰에서 확인 가능하게 함
        res.status(500).json({
            message: '서버 대리 업로드 오류',
            details: error.message,
            code: error.code || error.name
        });
    }
});

// 4. Admin: Toggle recording_enabled
app.put('/api/users/:userId/recording-enabled', async (req, res) => {
    try {
        const { userId } = req.params;
        const { enabled } = req.body;

        await db.query(
            'UPDATE users SET recording_enabled = $1 WHERE id = $2',
            [enabled, userId]
        );

        res.json({ success: true, recording_enabled: enabled });
    } catch (error) {
        console.error('[PUT /api/users/:userId/recording-enabled] Error:', error);
        res.status(500).json({ message: '유저 설정 업데이트 중 오류가 발생했습니다.' });
    }
});

export default app;
