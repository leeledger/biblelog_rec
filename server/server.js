const express = require('express');
// const fs = require('fs'); // No longer needed for database.json
// const path = require('path'); // No longer needed for database.json
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db'); // Import the new db module
const bcrypt = require('bcrypt');
const saltRounds = 10; // For bcrypt hashing

const app = express();
const PORT = process.env.PORT || 3001;
// const DB_PATH = path.join(__dirname, 'database.json'); // No longer needed

app.use(cors());
app.use(bodyParser.json());

// Helper functions for database.json are no longer needed
// const readDatabase = () => { ... };
// const writeDatabase = (data) => { ... };


// Endpoint for user registration
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  if (password.length < 4) { // Basic password length validation
    return res.status(400).json({ message: 'Password must be at least 4 characters long' });
  }

  try {
    // Check if user already exists
    const existingUserResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUserResult.rows.length > 0) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user with hashed password. 'must_change_password' defaults to TRUE by DB schema.
    const newUserResult = await db.query(
      'INSERT INTO users (username, password, must_change_password) VALUES ($1, $2, $3) RETURNING id, username, must_change_password',
      [username, hashedPassword, false]
    );
    const newUser = newUserResult.rows[0];
    console.log(`[POST /api/register] Created new user ${username} with ID: ${newUser.id}`);

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      message: '사용자 등록이 완료되었습니다. 로그인해주세요.'
    });
  } catch (error) {
    console.error(`[POST /api/register] Error registering user ${username}:`, error);
    if (error.code === '23505') { // Unique violation for username (just in case the previous check missed due to race condition)
      return res.status(409).json({ message: 'Username already exists.' });
    }
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
    console.log('[POST /api/login] User data from DB:', JSON.stringify(user, null, 2)); // Log the user object

    // Case 1: Existing user, password field is NULL (migrated user, needs to set initial password)
    // Default temporary password is '1234'
    if (user.password === null) {
      if (providedPassword === '1234' && user.must_change_password) {
        console.log(`[POST /api/login] User ${username} (ID: ${user.id}) logged in with temporary password. Must change.`);
        return res.status(200).json({
          id: user.id,
          username: user.username,
          must_change_password: true, // Explicitly true
          message: 'Login successful. Please change your temporary password.'
        });
      } else {
        // If password is null and provided password is not the temporary one, or if they shouldn't be changing it (e.g. must_change_password is false)
        return res.status(401).json({ message: 'Invalid username or password, or temporary password setup issue.' });
      }
    }

    // Case 2: User has a hashed password set (i.e., user.password is not null)
    // This block is executed only if user.password was NOT null.
    let passwordMatch = false;
    try {
      // Now, if user.password is not null, it MUST be a string (the hash)
      if (typeof user.password !== 'string') {
        console.error('[POST /api/login] User password from DB is not a string:', user.password);
        // Potentially treat as a login failure or handle as a specific error case
        return res.status(500).json({ message: 'User data integrity issue.' });
      }
      passwordMatch = await bcrypt.compare(providedPassword, user.password);
    } catch (bcryptError) {
      console.error('[POST /api/login] Error during bcrypt.compare:', bcryptError);
      return res.status(500).json({ message: 'Error during password verification.' });
    }

    // This check is now correctly placed after confirming user.password is a string (hash)
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    console.log(`[POST /api/login] User ${username} (ID: ${user.id}) logged in successfully.`);
    res.status(200).json({
      id: user.id,
      username: user.username,
      must_change_password: user.must_change_password,
      message: 'Login successful'
    });

  } catch (error) {
    console.error(`[POST /api/login] Error logging in user ${username}:`, error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Endpoint to change user password
app.post('/api/users/change-password', async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword) {
    return res.status(400).json({ message: 'User ID and new password are required.' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 4) { // Basic validation
    return res.status(400).json({ message: 'Password must be a string and at least 4 characters long.' });
  }

  try {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update the user's password and set must_change_password to false
    const updateResult = await db.query(
      'UPDATE users SET password = $1, must_change_password = $2 WHERE id = $3 RETURNING id, username, must_change_password',
      [hashedPassword, false, userId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const updatedUser = updateResult.rows[0];
    console.log(`[POST /api/users/change-password] Password changed successfully for user ID: ${userId}`);
    res.status(200).json({
      message: 'Password changed successfully.',
      user: updatedUser
    });

  } catch (error) {
    console.error(`[POST /api/users/change-password] Error changing password for user ID ${userId}:`, error);
    res.status(500).json({ message: 'Error changing password.' });
  }
});


// Get user progress
app.get('/api/progress/:username', async (req, res) => {
  const { username } = req.params;
  try {
    // 1. Get user_id from username
    const userResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    let userId;

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
    } else {
      // If user not found by GET /api/progress, it means they haven't saved any progress yet.
      // User creation is handled by POST /api/users/ensure on login or by POST /api/progress when saving.
      console.log(`[GET /api/progress] User ${username} not found or no progress recorded. Returning default progress.`);
      return res.json({ lastReadBook: '', lastReadChapter: 0, lastReadVerse: 0, history: [], completedChapters: [], lastProgressUpdateDate: null });
    }

    // 2. Get reading_progress (filtered by group)
    const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;
    let progressQuery = 'SELECT last_read_book, last_read_chapter, last_read_verse, updated_at FROM reading_progress WHERE user_id = $1';
    let progressParams = [userId];

    if (groupId) {
      progressQuery += ' AND group_id = $2';
      progressParams.push(groupId);
    } else {
      progressQuery += ' AND group_id IS NULL';
    }

    const progressResult = await db.query(progressQuery, progressParams);

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

    // 3. Get completed_chapters (filtered by group)
    let chaptersQuery = 'SELECT book_name, chapter_number FROM completed_chapters WHERE user_id = $1';
    let chaptersParams = [userId];

    if (groupId) {
      chaptersQuery += ' AND group_id = $2';
      chaptersParams.push(groupId);
    } else {
      chaptersQuery += ' AND group_id IS NULL';
    }

    const completedChaptersResult = await db.query(chaptersQuery, chaptersParams);
    const completedChapters = completedChaptersResult.rows.map(c => `${c.book_name}:${c.chapter_number}`);

    // 4. History: For now, returning empty. This needs specific logic based on how reading_history table is used.
    const finalProgress = {
      ...userProgressData,
      completedChapters: completedChapters,
      history: [] // Placeholder for history, to be implemented based on reading_history table
    };

    console.log(`[GET DB] Progress for ${username} (ID: ${userId}):`, finalProgress);
    res.json(finalProgress);

  } catch (error) {
    console.error(`[GET DB] Error fetching progress for ${username}:`, error);
    res.status(500).json({ message: 'Error fetching progress from database' });
  }
});

// Save user progress
app.post('/api/progress/:username', async (req, res) => {
  const { username } = req.params;
  const {
    lastReadBook,
    lastReadChapter,
    lastReadVerse,
    history, // This is expected to be versesReadInSession from the client
    completedChapters, // Array of strings like "Genesis:1"
    groupId // 추가
  } = req.body;

  const client = await db.pool.connect(); // Get a client from the pool for transaction

  try {
    await client.query('BEGIN'); // Start transaction

    // 1. Find or create user
    let userResult = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    let userId;

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
    } else {
      const newUserResult = await client.query(
        'INSERT INTO users (username) VALUES ($1) RETURNING id',
        [username]
      );
      userId = newUserResult.rows[0].id;
      console.log(`[POST DB] Created new user ${username} with ID: ${userId}`);
    }

    // 2. Save/Update reading_progress
    // group_id가 있는 경우만 해당 그룹의 진도를 업데이트 (중복 방지 로직은 향후 고도화 가능)
    // 현재는 간단히 user_id와 group_id 조건으로 처리
    let checkProgress = await client.query(
      'SELECT id FROM reading_progress WHERE user_id = $1 AND (group_id = $2 OR (group_id IS NULL AND $2 IS NULL))',
      [userId, groupId]
    );

    if (checkProgress.rows.length > 0) {
      await client.query(
        'UPDATE reading_progress SET last_read_book = $1, last_read_chapter = $2, last_read_verse = $3, updated_at = NOW() WHERE user_id = $4 AND (group_id = $5 OR (group_id IS NULL AND $5 IS NULL))',
        [lastReadBook, lastReadChapter, lastReadVerse, userId, groupId]
      );
    } else {
      await client.query(
        'INSERT INTO reading_progress (user_id, last_read_book, last_read_chapter, last_read_verse, updated_at, group_id) VALUES ($1, $2, $3, $4, NOW(), $5)',
        [userId, lastReadBook, lastReadChapter, lastReadVerse, groupId]
      );
    }

    // 3. Save completed_chapters
    if (completedChapters && completedChapters.length > 0) {
      const chapterInsertQuery = `
        INSERT INTO completed_chapters (user_id, book_name, chapter_number, completed_at, group_id)
        VALUES ($1, $2, $3, NOW(), $4)
        ON CONFLICT (user_id, book_name, chapter_number) DO NOTHING; -- Note: keep original conflict target for simplicity, or update if per-group completion is needed
      `;
      for (const chapterStr of completedChapters) {
        const [book, chapterNumStr] = chapterStr.split(':');
        const chapterNum = parseInt(chapterNumStr, 10);
        if (book && !isNaN(chapterNum)) {
          await client.query(chapterInsertQuery, [userId, book, chapterNum, groupId]);
        }
      }
    }

    // 4. Save reading_history (versesReadInSession)
    // history entry: {date, book, startChapter, startVerse, endChapter, endVerse, versesRead, duration_minutes}
    if (history && history.length > 0) {
      const historyInsertQuery = `
        INSERT INTO reading_history (user_id, book_name, chapter_number, verse_number, read_at, duration_minutes, group_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `;
      for (const entry of history) {
        await client.query(historyInsertQuery, [
          userId,
          entry.book,
          entry.startChapter,
          entry.startVerse,
          new Date(entry.date),
          entry.duration_minutes || 0,
          groupId
        ]);
      }
    }

    await client.query('COMMIT'); // Commit transaction
    console.log(`[POST DB] Saved progress for ${username} (ID: ${userId})`);
    res.status(200).json({ message: 'Progress saved successfully.' });

  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    console.error(`[POST DB] Error saving progress for ${username}:`, error);
    res.status(500).json({ message: 'Error saving progress to database' });
  } finally {
    client.release(); // Release client back to the pool
  }
});

// Get completed chapters for a user
app.get('/api/progress/:username/completedChapters', async (req, res) => {
  const { username } = req.params;
  try {
    const userResult = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      console.log(`[GET DB] User ${username} not found for completed chapters. Returning empty array.`);
      return res.json([]);
    }
    const userId = userResult.rows[0].id;

    const completedChaptersResult = await db.query(
      'SELECT book_name, chapter_number FROM completed_chapters WHERE user_id = $1 ORDER BY book_name, chapter_number',
      [userId]
    );

    const completedChapters = completedChaptersResult.rows.map(c => `${c.book_name}:${c.chapter_number}`);
    console.log(`[GET DB] Completed chapters for ${username} (ID: ${userId}):`, completedChapters);
    res.json(completedChapters);

  } catch (error) {
    console.error(`[GET DB] Error fetching completed chapters for ${username}:`, error);
    res.status(500).json({ message: 'Error fetching completed chapters' });
  }
});

// Get all users' progress summary for leaderboard
app.get('/api/users/all', async (req, res) => {
  const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;
  try {
    let query = '';
    let params = [];

    if (groupId) {
      // 특정 그룹 멤버의 해당 그룹 진도 조회
      query = `
        SELECT
          u.username,
          COALESCE(rp.last_read_book, '') AS "lastReadBook",
          COALESCE(rp.last_read_chapter, 0) AS "lastReadChapter",
          COALESCE(rp.last_read_verse, 0) AS "lastReadVerse",
          rp.updated_at AS "lastProgressUpdateDate",
          (SELECT COUNT(*) FROM completed_chapters cc WHERE cc.user_id = u.id AND (cc.group_id = $1)) AS "completedChaptersCount",
          (SELECT COUNT(*) FROM hall_of_fame hf WHERE hf.user_id = u.id AND (hf.group_id = $1)) AS "completed_count"
        FROM
          group_members gm
        JOIN
          users u ON gm.user_id = u.id
        LEFT JOIN
          reading_progress rp ON u.id = rp.user_id AND (rp.group_id = $1)
        WHERE
          gm.group_id = $1
        ORDER BY
          "completedChaptersCount" DESC, u.username;
      `;
      params = [groupId];
    } else {
      // 개인 통독 진도 조회 (group_id가 NULL인 데이터)
      query = `
        SELECT
          u.username,
          COALESCE(rp.last_read_book, '') AS "lastReadBook",
          COALESCE(rp.last_read_chapter, 0) AS "lastReadChapter",
          COALESCE(rp.last_read_verse, 0) AS "lastReadVerse",
          rp.updated_at AS "lastProgressUpdateDate",
          (SELECT COUNT(*) FROM completed_chapters cc WHERE cc.user_id = u.id AND cc.group_id IS NULL) AS "completedChaptersCount",
          (SELECT COUNT(*) FROM hall_of_fame hf WHERE hf.user_id = u.id AND hf.group_id IS NULL) AS "completed_count"
        FROM
          users u
        LEFT JOIN
          reading_progress rp ON u.id = rp.user_id AND rp.group_id IS NULL
        ORDER BY
          "completedChaptersCount" DESC, u.username;
      `;
      params = [];
    }

    const { rows } = await db.query(query, params);
    console.log(`[GET DB] All users summary for leaderboard (Group: ${groupId}):`, rows.length, 'users');
    res.json(rows);
  } catch (error) {
    console.error('[GET DB] Error fetching all users summary:', error);
    res.status(500).json({ message: 'Error fetching users summary for leaderboard' });
  }
});

// Hall of Fame 엔드포인트 - 완독자 목록 조회
app.get('/api/hall-of-fame', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        h.user_id, 
        u.username, 
        h.round, 
        h.completed_at 
      FROM 
        hall_of_fame h 
      JOIN 
        users u ON h.user_id = u.id 
      ORDER BY 
        h.completed_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching hall of fame data:', err);
    res.status(500).json({ message: '명예의 전당 정보를 불러오는 중 오류가 발생했습니다.' });
  }
});

const startServer = async () => {
  try {
    await db.initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
};

startServer().catch(err => {
  console.error('Failed to start the server:', err);
  process.exit(1);
});
