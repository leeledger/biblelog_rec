import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as db from './db.js';

const app = express();
const saltRounds = 10;

// Helper: Generate a unique invite code
const generateInviteCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
};

app.use(cors());
app.use(bodyParser.json());

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
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const existingUserResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existingUserResult.rows.length > 0) {
            return res.status(409).json({ message: 'Username already exists' });
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
        res.status(500).json({ message: 'Error registering user' });
    }
});

// Endpoint for user login
app.post('/api/login', async (req, res) => {
    const { username, password: providedPassword } = req.body;
    if (!username || !providedPassword) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const userResult = await db.query('SELECT id, username, password, must_change_password FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const user = userResult.rows[0];
        if (user.password === null) {
            if (providedPassword === '1234' && user.must_change_password) {
                return res.status(200).json({
                    id: user.id,
                    username: user.username,
                    must_change_password: true,
                    message: 'Login successful. Please change your temporary password.'
                });
            } else {
                return res.status(401).json({ message: 'Invalid username or password' });
            }
        }

        const passwordMatch = await bcrypt.compare(providedPassword, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        res.status(200).json({
            id: user.id,
            username: user.username,
            must_change_password: user.must_change_password,
            message: 'Login successful'
        });
    } catch (error) {
        console.error(`[POST /api/login] Error:`, error);
        res.status(500).json({ message: 'Error logging in' });
    }
});

// Endpoint to change user password
app.post('/api/users/change-password', async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
        return res.status(400).json({ message: 'User ID and new password are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        const updateResult = await db.query(
            'UPDATE users SET password = $1, must_change_password = $2 WHERE id = $3 RETURNING id, username, must_change_password',
            [hashedPassword, false, userId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json({
            message: 'Password changed successfully.',
            user: updateResult.rows[0]
        });
    } catch (error) {
        console.error(`[POST /api/users/change-password] Error:`, error);
        res.status(500).json({ message: 'Error changing password.' });
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
        res.status(500).json({ message: 'Error fetching progress' });
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
            // Use a single ON CONFLICT clause that works with the actual unique constraint
            // The constraint is on (user_id, book_name, chapter_number) without group_id condition
            const chapterInsertQuery = `
        INSERT INTO completed_chapters (user_id, group_id, book_name, chapter_number, completed_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT ON CONSTRAINT completed_chapters_user_id_book_name_chapter_number_key DO NOTHING;
      `;
            for (const chapterStr of completedChapters) {
                const [book, chapterNumStr] = chapterStr.split(':');
                const chapterNum = parseInt(chapterNumStr, 10);
                if (book && !isNaN(chapterNum)) {
                    await client.query(chapterInsertQuery, [userId, groupId || null, book, chapterNum]);
                }
            }
        }

        if (history && history.length > 0) {
            const historyInsertQuery = `
        INSERT INTO reading_history (user_id, group_id, book_name, chapter_number, verse_number, read_at)
        VALUES ($1, $2, $3, $4, $5, $6);
      `;
            for (const entry of history) {
                await client.query(historyInsertQuery, [userId, groupId || null, entry.book, entry.startChapter, entry.startVerse, new Date(entry.date)]);
            }
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Progress saved successfully.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[POST /api/progress/:username] Error:`, error);
        res.status(500).json({ message: 'Error saving progress' });
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
            ORDER BY "completed_count" DESC, "completedChaptersCount" DESC, u.username;
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
            ORDER BY "completed_count" DESC, "completedChaptersCount" DESC, u.username;
        `;
        }

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('[GET /api/users/all] Error:', error);
        res.status(500).json({ message: 'Error fetching users summary' });
    }
});

app.get('/api/hall-of-fame', async (req, res) => {
    try {
        const result = await db.query(`
      SELECT h.user_id, u.username, h.round, h.completed_at 
      FROM hall_of_fame h 
      JOIN users u ON h.user_id = u.id 
      ORDER BY h.completed_at DESC
    `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching hall of fame data:', err);
        res.status(500).json({ message: 'Error fetching hall of fame' });
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
        res.status(500).json({ message: 'Error creating group' });
    }
});

// Join a group using invite code
app.post('/api/groups/join', async (req, res) => {
    const { inviteCode, userId } = req.body;
    if (!inviteCode || !userId) return res.status(400).json({ message: 'Invite code and userId are required' });

    try {
        const groupResult = await db.query('SELECT id, name FROM groups WHERE invite_code = $1', [inviteCode.toUpperCase()]);
        if (groupResult.rows.length === 0) {
            return res.status(404).json({ message: 'Invalid invite code' });
        }
        const group = groupResult.rows[0];

        // Check if already a member
        const memberCheck = await db.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [group.id, userId]);
        if (memberCheck.rows.length > 0) {
            return res.status(409).json({ message: 'Already a member of this group' });
        }

        await db.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [group.id, userId]);
        res.status(200).json({ message: `Successfully joined ${group.name}`, group });
    } catch (error) {
        console.error('[POST /api/groups/join] Error:', error);
        res.status(500).json({ message: 'Error joining group' });
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
        res.status(500).json({ message: 'Error fetching user groups' });
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
        res.status(500).json({ message: 'Error fetching group members' });
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
        res.json({ message: 'Successfully left the group and all your records for this group have been deleted.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[POST /api/groups/:groupId/leave] Error:', error);
        res.status(500).json({ message: 'Error leaving group' });
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
            return res.status(404).json({ message: 'Group not found' });
        }
        if (groupRes.rows[0].owner_id != userId) {
            return res.status(403).json({ message: 'Only the group owner can delete the group' });
        }

        // Delete group (CASCADE handles members, records, etc.)
        await db.query('DELETE FROM groups WHERE id = $1', [groupId]);
        res.json({ message: 'Group deleted successfully' });
    } catch (error) {
        console.error('[DELETE /api/groups/:groupId] Error:', error);
        res.status(500).json({ message: 'Error deleting group' });
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
            return res.status(404).json({ message: 'Group not found' });
        }
        if (groupRes.rows[0].owner_id != currentOwnerId) {
            return res.status(403).json({ message: 'Only the current owner can transfer ownership' });
        }

        // Check if new owner is a member
        const memberRes = await db.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, newOwnerId]);
        if (memberRes.rows.length === 0) {
            return res.status(400).json({ message: 'New owner must be a member of the group' });
        }

        // Update ownership
        await db.query('UPDATE groups SET owner_id = $1 WHERE id = $2', [newOwnerId, groupId]);
        res.json({ message: 'Ownership transferred successfully' });
    } catch (error) {
        console.error('[POST /api/groups/:groupId/transfer-ownership] Error:', error);
        res.status(500).json({ message: 'Error transferring ownership' });
    }
});

// Debug logging endpoint for iOS Safari speech recognition
app.post('/api/debug-log', async (req, res) => {
    const { event, data, userAgent, timestamp } = req.body;
    console.log(`[iOS DEBUG] ${timestamp} | Event: ${event} | UserAgent: ${userAgent?.substring(0, 50)} | Data:`, JSON.stringify(data));
    res.json({ received: true });
});

export default app;
