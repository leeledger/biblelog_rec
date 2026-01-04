import pg from 'pg';
const { Pool } = pg;

const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

if (!connectionString) {
  console.error('CRITICAL: DATABASE_URL is not defined in Vercel environment variables!');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false,
  max: 10, // 서버리스 환경에 적합한 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const query = (text, params) => pool.query(text, params);

export const initializeDatabase = async () => {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NULL,
      must_change_password BOOLEAN DEFAULT TRUE,
      completed_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createReadingProgressTable = `
    CREATE TABLE IF NOT EXISTS reading_progress (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_read_book VARCHAR(255),
      last_read_chapter INTEGER,
      last_read_verse INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createCompletedChaptersTable = `
    CREATE TABLE IF NOT EXISTS completed_chapters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      book_name VARCHAR(255) NOT NULL,
      chapter_number INTEGER NOT NULL,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, book_name, chapter_number)
    );
  `;

  const createReadingHistoryTable = `
    CREATE TABLE IF NOT EXISTS reading_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      book_name VARCHAR(255) NOT NULL,
      chapter_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL, 
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      session_id VARCHAR(255) 
    );
  `;

  const createHallOfFameTable = `
    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, round)
    );
  `;

  try {
    await pool.query(createUsersTable);
    await pool.query(createReadingProgressTable);
    await pool.query(createCompletedChaptersTable);
    await pool.query(createReadingHistoryTable);
    await pool.query(createHallOfFameTable);
    console.log('Database tables checked/created successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

export const handleBibleCompletion = async (userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT COALESCE(MAX(round), 0) as last_round FROM hall_of_fame WHERE user_id = $1',
      [userId]
    );
    const nextRound = rows[0].last_round + 1;

    await client.query(
      'INSERT INTO hall_of_fame (user_id, round) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, nextRound]
    );

    await client.query(
      'UPDATE users SET completed_count = COALESCE(completed_count,0) + 1 WHERE id = $1',
      [userId]
    );

    await client.query(
      'DELETE FROM completed_chapters WHERE user_id = $1',
      [userId]
    );

    await client.query(
      'UPDATE reading_progress SET last_read_book = NULL, last_read_chapter = NULL, last_read_verse = NULL WHERE user_id = $1',
      [userId]
    );

    await client.query('COMMIT');
    return { success: true, round: nextRound };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export { pool };
