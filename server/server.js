const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Endpoint for user registration
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ message: 'Password must be at least 4 characters long' });
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
      message: '사용자 등록이 완료되었습니다.'
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
          message: 'Login successful. Please change your password.'
        });
      } else {
        return res.status(401).json({ message: 'Invalid username or password.' });
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

// Endpoint to change password
app.post('/api/users/change-password', async (req, res) => {
  const { userId, newPassword } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await db.query('UPDATE users SET password = $1, must_change_password = $2 WHERE id = $3', [hashedPassword, false, userId]);
    res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error changing password.' });
  }
});

// Get user progress
app.get('/api/progress/:username', async (req, res) => {
  const { username } = req.params;
  const groupId = req.query.groupId && req.query.groupId !== 'null' ? parseInt(req.query.groupId, 10) : null;
  try {
    const userResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) return res.json({ lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, history: [], completedChapters: [], groupId });
    const userId = userResult.rows[0].id;
    const progressResult = await db.query(
      'SELECT last_read_book, last_read_chapter, last_read_verse, updated_at FROM reading_progress WHERE user_id = $1 AND (group_id = $2 OR (group_id IS NULL AND $2 IS NULL))',
      [userId, groupId]
    );
    let userProgressData = progressResult.rows.length > 0 ? {
      lastReadBook: progressResult.rows[0].last_read_book,
      lastReadChapter: progressResult.rows[0].last_read_chapter,
      lastReadVerse: progressResult.rows[0].last_read_verse,
      lastProgressUpdateDate: progressResult.rows[0].updated_at
    } : { lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, lastProgressUpdateDate: null };
    const completedChaptersResult = await db.query(
      'SELECT book_name, chapter_number FROM completed_chapters WHERE user_id = $1 AND (group_id = $2 OR (group_id IS NULL AND $2 IS NULL))',
      [userId, groupId]
    );
    res.json({ ...userProgressData, completedChapters: completedChaptersResult.rows.map(c => `${c.book_name}:${c.chapter_number}`), groupId });
  } catch (error) {
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
    let userId = userResult.rows.length > 0 ? userResult.rows[0].id : (await client.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [username])).rows[0].id;
    await client.query(`
      INSERT INTO reading_progress (user_id, last_read_book, last_read_chapter, last_read_verse, updated_at, group_id)
      VALUES ($1, $2, $3, $4, NOW(), $5) ON CONFLICT (user_id, group_id) DO UPDATE SET last_read_book = EXCLUDED.last_read_book, last_read_chapter = EXCLUDED.last_read_chapter, last_read_verse = EXCLUDED.last_read_verse, updated_at = NOW()`,
      [userId, lastReadBook, lastReadChapter, lastReadVerse, groupId]
    );
    if (completedChapters && completedChapters.length > 0) {
      for (const chapterStr of completedChapters) {
        const [book, chapterNum] = chapterStr.split(':');
        await client.query('INSERT INTO completed_chapters (user_id, book_name, chapter_number, completed_at, group_id) VALUES ($1, $2, $3, NOW(), $4) ON CONFLICT (user_id, book_name, chapter_number, group_id) DO NOTHING', [userId, book, parseInt(chapterNum, 10), groupId]);
      }
    }
    if (history && history.length > 0) {
      for (const entry of history) {
        await client.query('INSERT INTO reading_history (user_id, book_name, chapter_number, verse_number, read_at, group_id) VALUES ($1, $2, $3, $4, $5, $6)', [userId, entry.book, entry.startChapter, entry.startVerse, new Date(entry.date), groupId]);
      }
    }
    await client.query('COMMIT');
    res.status(200).json({ message: 'Progress saved successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Error saving progress' });
  } finally {
    client.release();
  }
});

// Leaderboard - 리더보드도 정확히 그룹별로만 필터링하도록 유지
app.get('/api/users/all', async (req, res) => {
  const groupId = req.query.groupId && req.query.groupId !== 'null' ? parseInt(req.query.groupId, 10) : null;
  try {
    const query = `
      SELECT u.username, COALESCE(rp.last_read_book, '') AS "lastReadBook", COALESCE(rp.last_read_chapter, 0) AS "lastReadChapter", COALESCE(rp.last_read_verse, 0) AS "lastReadVerse", rp.updated_at AS "lastProgressUpdateDate",
        (SELECT COUNT(*) FROM completed_chapters cc WHERE cc.user_id = u.id AND (cc.group_id = $1 OR (cc.group_id IS NULL AND $1 IS NULL))) AS "completedChaptersCount",
        (SELECT COUNT(*) FROM hall_of_fame hf WHERE hf.user_id = u.id AND (hf.group_id = $1 OR (hf.group_id IS NULL AND $1 IS NULL))) AS "completed_count"
      FROM users u LEFT JOIN reading_progress rp ON u.id = rp.user_id AND (rp.group_id = $1 OR (rp.group_id IS NULL AND $1 IS NULL))
      WHERE ($1 IS NULL OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id AND gm.group_id = $1))
      ORDER BY u.username;
    `;
    const { rows } = await db.query(query, [groupId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Hall of Fame - 유저님이 말씀하신 "현재 활성화된 방" 기준으로만 완벽하게 격리
app.get('/api/hall-of-fame', async (req, res) => {
  const { groupId: groupIdParam } = req.query;
  // NaN, 'null', 'undefined', 빈 문자열 모두 개인 통독(null)으로 처리
  let groupId = null;
  if (groupIdParam && groupIdParam !== 'null' && groupIdParam !== 'undefined' && groupIdParam !== 'NaN') {
    const parsed = parseInt(groupIdParam, 10);
    groupId = isNaN(parsed) ? null : parsed;
  }

  console.log(`[HOF FINAL] Filtering for Room: ${groupId === null ? 'Personal' : 'Group ' + groupId}`);

  try {
    let query = 'SELECT h.user_id, u.username, h.round, h.completed_at, h.group_id FROM hall_of_fame h JOIN users u ON h.user_id = u.id';
    let params = [];

    // NULL 여부에 따라 SQL 구문을 완전히 분리하여 절대 섞이지 않게 함
    if (groupId === null) {
      query += ' WHERE h.group_id IS NULL';
    } else {
      query += ' WHERE h.group_id = $1';
      params.push(groupId);
    }

    query += ' ORDER BY h.completed_at DESC';
    const result = await db.query(query, params);
    console.log(`[HOF FINAL] Found ${result.rows.length} entries for ${groupId === null ? 'Personal' : 'Group ' + groupId}`);
    res.json(result.rows);
  } catch (err) {
    console.error('[HOF FINAL] Error:', err);
    res.status(500).json({ message: '데이터 로드 실패' });
  }
});

// Bible Completion Reset
app.post('/api/bible-reset', async (req, res) => {
  const { userId, groupId: rawGroupId } = req.body;
  const groupId = (rawGroupId && rawGroupId !== 'null') ? parseInt(rawGroupId, 10) : null;
  try {
    const result = await db.handleBibleCompletion(userId, groupId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Reset failed' });
  }
});

const startServer = async () => {
  try {
    await db.initializeDatabase();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    process.exit(1);
  }
};

startServer();
