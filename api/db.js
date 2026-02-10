import pg from 'pg';
const { Pool } = pg;

const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

if (!connectionString) {
  console.error('CRITICAL: DATABASE_URL is not defined in Vercel environment variables!');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false,
  max: 2, // 서버리스 환경용 최소 연결
  idleTimeoutMillis: 20000, // 20초 유휴 타임아웃
  connectionTimeoutMillis: 30000, // 30초 연결 타임아웃 (늘림)
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

    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      invite_code VARCHAR(20) UNIQUE NOT NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    );
  `;

  const createReadingProgressTable = `
    CREATE TABLE IF NOT EXISTS reading_progress (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      last_read_book VARCHAR(255),
      last_read_chapter INTEGER,
      last_read_verse INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, group_id)
    );
    -- Handle existing data (group_id will be NULL/default for mig)
    -- If PRIMARY KEY update fails in some DBs, we might need a separate migration script, 
    -- but for IF NOT EXISTS creation it's better defined this way.
  `;

  const createCompletedChaptersTable = `
    CREATE TABLE IF NOT EXISTS completed_chapters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      book_name VARCHAR(255) NOT NULL,
      chapter_number INTEGER NOT NULL,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, group_id, book_name, chapter_number)
    );
  `;

  const createReadingHistoryTable = `
    CREATE TABLE IF NOT EXISTS reading_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
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
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, group_id, round)
    );
  `;

  try {
    await pool.query(createUsersTable);
    // groups table must be created before others that reference it
    const createGroupsTable = `
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        invite_code VARCHAR(20) UNIQUE NOT NULL,
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const createGroupMembersTable = `
      CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id)
      );
    `;
    await pool.query(createGroupsTable);
    await pool.query(createGroupMembersTable);

    // Migration: Add group_id to existing tables if not exists
    const migrateTables = [
      'reading_progress', 'completed_chapters', 'reading_history', 'hall_of_fame'
    ];
    for (const table of migrateTables) {
      try {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE;`);
      } catch (err) {
        console.warn(`Migration notice for ${table}:`, err.message);
      }
    }

    await pool.query(createReadingProgressTable);
    await pool.query(createCompletedChaptersTable);
    await pool.query(createReadingHistoryTable);
    await pool.query(createHallOfFameTable);

    // Migration: Add recording_enabled to users table
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT FALSE;`);
    } catch (err) {
      console.warn('Migration notice for recording_enabled:', err.message);
    }

    // Create audio_recordings table
    const createAudioRecordingsTable = `
      CREATE TABLE IF NOT EXISTS audio_recordings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        file_key VARCHAR(512) NOT NULL,
        book_name VARCHAR(255) NOT NULL,
        chapter_number INTEGER NOT NULL,
        verse_number INTEGER DEFAULT 0,
        duration_seconds NUMERIC(6,1),
        file_size_bytes INTEGER,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createAudioRecordingsTable);

    // Add indexes for performance optimization and resolve ON CONFLICT constraints
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_completed_chapters_user_group ON completed_chapters(user_id, group_id);
      CREATE INDEX IF NOT EXISTS idx_hall_of_fame_user_group ON hall_of_fame(user_id, group_id);
      CREATE INDEX IF NOT EXISTS idx_reading_progress_user_group ON reading_progress(user_id, group_id);
      
      -- Add partial unique indexes for reading_progress
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_progress_unique_group ON reading_progress(user_id, group_id) WHERE group_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_progress_unique_personal ON reading_progress(user_id) WHERE group_id IS NULL;

      -- Add partial unique indexes for completed_chapters (to resolve group separation issue)
      -- First, drop the old constraint if it exists (it didn't include group_id)
      -- This needs to be done carefully as DROP CONSTRAINT inside a DO block or separate query is better, 
      -- but putting it here in the multi-statement string works if the driver supports it.
      -- However, to be safe and avoid error if constraint doesn't exist (handled by IF EXISTS), we add it here.
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'completed_chapters_user_id_book_name_chapter_number_key') THEN 
          ALTER TABLE completed_chapters DROP CONSTRAINT completed_chapters_user_id_book_name_chapter_number_key; 
        END IF; 
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_completed_chapters_unique_group ON completed_chapters(user_id, group_id, book_name, chapter_number) WHERE group_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_completed_chapters_unique_personal ON completed_chapters(user_id, book_name, chapter_number) WHERE group_id IS NULL;

      -- Add partial unique indexes for hall_of_fame
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_of_fame_unique_group ON hall_of_fame(user_id, group_id, round) WHERE group_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_of_fame_unique_personal ON hall_of_fame(user_id, round) WHERE group_id IS NULL;
    `;
    await pool.query(createIndexes);

    // Sync sequences for SERIAL columns (Fix for "ID index" issues after manual inserts)
    const tablesWithSerial = ['users', 'groups', 'completed_chapters', 'reading_history', 'hall_of_fame'];
    for (const table of tablesWithSerial) {
      try {
        await pool.query(`
          SELECT setval(
            pg_get_serial_sequence($1, 'id'),
            COALESCE((SELECT MAX(id) FROM ${table}), 1),
            EXISTS (SELECT 1 FROM ${table})
          );
        `, [table]);
      } catch (err) {
        console.warn(`Could not sync sequence for ${table}:`, err.message);
      }
    }

    console.log('Database tables checked/created and sequences synced successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

export const handleBibleCompletion = async (userId, groupId = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      groupId
        ? 'SELECT COALESCE(MAX(round), 0) as last_round FROM hall_of_fame WHERE user_id = $1 AND group_id = $2'
        : 'SELECT COALESCE(MAX(round), 0) as last_round FROM hall_of_fame WHERE user_id = $1 AND group_id IS NULL',
      groupId ? [userId, groupId] : [userId]
    );
    const nextRound = rows[0].last_round + 1;

    const hallOfFameQuery = groupId ? `
      INSERT INTO hall_of_fame (user_id, group_id, round) VALUES ($1, $2, $3) 
      ON CONFLICT (user_id, group_id, round) WHERE group_id IS NOT NULL DO NOTHING
    ` : `
      INSERT INTO hall_of_fame (user_id, group_id, round) VALUES ($1, NULL, $2) 
      ON CONFLICT (user_id, round) WHERE group_id IS NULL DO NOTHING
    `;

    if (groupId) {
      await client.query(hallOfFameQuery, [userId, groupId, nextRound]);
    } else {
      await client.query(hallOfFameQuery, [userId, nextRound]);
    }

    // If it's the personal quest (groupId is null), we also update the users total completed_count for legacy compatibility
    if (!groupId) {
      await client.query(
        'UPDATE users SET completed_count = COALESCE(completed_count,0) + 1 WHERE id = $1',
        [userId]
      );
    }

    await client.query(
      groupId
        ? 'DELETE FROM completed_chapters WHERE user_id = $1 AND group_id = $2'
        : 'DELETE FROM completed_chapters WHERE user_id = $1 AND group_id IS NULL',
      groupId ? [userId, groupId] : [userId]
    );

    await client.query(
      groupId
        ? 'UPDATE reading_progress SET last_read_book = NULL, last_read_chapter = NULL, last_read_verse = NULL WHERE user_id = $1 AND group_id = $2'
        : 'UPDATE reading_progress SET last_read_book = NULL, last_read_chapter = NULL, last_read_verse = NULL WHERE user_id = $1 AND group_id IS NULL',
      groupId ? [userId, groupId] : [userId]
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
