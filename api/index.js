import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import * as db from './db.js';

const app = express();
const saltRounds = 10;

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

// Get user progress
app.get('/api/progress/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const userResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.json({ lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, history: [], completedChapters: [], lastProgressUpdateDate: null });
        }
        const userId = userResult.rows[0].id;

        const progressResult = await db.query(
            'SELECT last_read_book, last_read_chapter, last_read_verse, updated_at FROM reading_progress WHERE user_id = $1',
            [userId]
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
            'SELECT book_name, chapter_number FROM completed_chapters WHERE user_id = $1',
            [userId]
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
    const { lastReadBook, lastReadChapter, lastReadVerse, history, completedChapters } = req.body;

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

        const progressQuery = `
      INSERT INTO reading_progress (user_id, last_read_book, last_read_chapter, last_read_verse, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        last_read_book = EXCLUDED.last_read_book,
        last_read_chapter = EXCLUDED.last_read_chapter,
        last_read_verse = EXCLUDED.last_read_verse,
        updated_at = NOW();
    `;
        await client.query(progressQuery, [userId, lastReadBook, lastReadChapter, lastReadVerse]);

        if (completedChapters && completedChapters.length > 0) {
            const chapterInsertQuery = `
        INSERT INTO completed_chapters (user_id, book_name, chapter_number, completed_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, book_name, chapter_number) DO NOTHING;
      `;
            for (const chapterStr of completedChapters) {
                const [book, chapterNumStr] = chapterStr.split(':');
                const chapterNum = parseInt(chapterNumStr, 10);
                if (book && !isNaN(chapterNum)) {
                    await client.query(chapterInsertQuery, [userId, book, chapterNum]);
                }
            }
        }

        if (history && history.length > 0) {
            const historyInsertQuery = `
        INSERT INTO reading_history (user_id, book_name, chapter_number, verse_number, read_at)
        VALUES ($1, $2, $3, $4, $5);
      `;
            for (const entry of history) {
                await client.query(historyInsertQuery, [userId, entry.book, entry.startChapter, entry.startVerse, new Date(entry.date)]);
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

// Leaderboard
app.get('/api/users/all', async (req, res) => {
    try {
        const query = `
      SELECT
        u.username,
        COALESCE(rp.last_read_book, '') AS "lastReadBook",
        COALESCE(rp.last_read_chapter, 0) AS "lastReadChapter",
        COALESCE(rp.last_read_verse, 0) AS "lastReadVerse",
        rp.updated_at AS "lastProgressUpdateDate",
        (SELECT COUNT(*) FROM completed_chapters cc WHERE cc.user_id = u.id) AS "completedChaptersCount",
        (SELECT COUNT(*) FROM hall_of_fame hf WHERE hf.user_id = u.id) AS "completed_count"
      FROM
        users u
      LEFT JOIN
        reading_progress rp ON u.id = rp.user_id
      ORDER BY
        u.username;
    `;
        const { rows } = await db.query(query);
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
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    try {
        const result = await db.handleBibleCompletion(userId);
        res.json(result);
    } catch (err) {
        console.error('Error resetting bible progress:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default app;
