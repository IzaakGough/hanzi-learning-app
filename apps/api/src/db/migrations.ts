export interface MigrationDefinition {
  id: string;
  description: string;
  sql: string;
}

export const migrations: MigrationDefinition[] = [
  {
    id: "001_initial_schema",
    description: "Create core tables for characters, words, levels, props, mappings, and imports",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        import_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_ref TEXT,
        status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
        summary_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS levels (
        id TEXT PRIMARY KEY,
        course TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        title TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course, sequence_number)
      );

      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        hanzi TEXT NOT NULL UNIQUE,
        pinyin_display TEXT,
        pinyin_initial TEXT,
        pinyin_final TEXT,
        tone TEXT,
        meaning_primary TEXT,
        meanings_other_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('blocked', 'ready', 'learned', 'archived')),
        blocked_reason TEXT,
        learned_at TEXT,
        archived_at TEXT,
        source TEXT NOT NULL CHECK (source IN ('pleco_import', 'curriculum_import', 'manual', 'derived')),
        source_ref TEXT,
        level_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(level_id) REFERENCES levels(id)
      );

      CREATE TABLE IF NOT EXISTS words (
        id TEXT PRIMARY KEY,
        simplified TEXT NOT NULL UNIQUE,
        pinyin_display TEXT,
        meaning_primary TEXT,
        meanings_other_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('blocked', 'ready', 'learned', 'archived')),
        blocked_reason TEXT,
        learned_at TEXT,
        archived_at TEXT,
        source TEXT NOT NULL CHECK (source IN ('pleco_import', 'curriculum_import', 'manual', 'derived')),
        source_ref TEXT,
        level_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(level_id) REFERENCES levels(id)
      );

      CREATE TABLE IF NOT EXISTS word_characters (
        word_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(word_id, sort_order),
        UNIQUE(word_id, character_id, sort_order),
        FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE,
        FOREIGN KEY(character_id) REFERENCES characters(id)
      );

      CREATE TABLE IF NOT EXISTS level_characters (
        level_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(level_id, sort_order),
        UNIQUE(level_id, character_id),
        FOREIGN KEY(level_id) REFERENCES levels(id) ON DELETE CASCADE,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS level_words (
        level_id TEXT NOT NULL,
        word_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(level_id, sort_order),
        UNIQUE(level_id, word_id),
        FOREIGN KEY(level_id) REFERENCES levels(id) ON DELETE CASCADE,
        FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS props (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK (type IN ('component', 'known_character')),
        shape_ref TEXT,
        meaning_or_image TEXT NOT NULL,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS character_decompositions (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('candidate', 'approved', 'rejected')),
        source TEXT NOT NULL CHECK (source IN ('pleco_import', 'curriculum_import', 'manual', 'derived')),
        source_ref TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS character_decomposition_parts (
        id TEXT PRIMARY KEY,
        decomposition_id TEXT NOT NULL,
        prop_id TEXT,
        character_id TEXT,
        literal_text TEXT,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (
          prop_id IS NOT NULL
          OR character_id IS NOT NULL
          OR literal_text IS NOT NULL
        ),
        FOREIGN KEY(decomposition_id) REFERENCES character_decompositions(id) ON DELETE CASCADE,
        FOREIGN KEY(prop_id) REFERENCES props(id),
        FOREIGN KEY(character_id) REFERENCES characters(id)
      );

      CREATE TABLE IF NOT EXISTS pinyin_mappings (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('initial', 'final', 'tone')),
        symbol TEXT NOT NULL,
        mapped_value TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(kind, symbol)
      );

      CREATE INDEX IF NOT EXISTS idx_characters_level_id ON characters(level_id);
      CREATE INDEX IF NOT EXISTS idx_characters_status ON characters(status);
      CREATE INDEX IF NOT EXISTS idx_words_level_id ON words(level_id);
      CREATE INDEX IF NOT EXISTS idx_words_status ON words(status);
      CREATE INDEX IF NOT EXISTS idx_word_characters_character_id ON word_characters(character_id);
      CREATE INDEX IF NOT EXISTS idx_decompositions_character_id ON character_decompositions(character_id);
      CREATE INDEX IF NOT EXISTS idx_decomposition_parts_decomposition_id ON character_decomposition_parts(decomposition_id);
      CREATE INDEX IF NOT EXISTS idx_pinyin_mappings_kind ON pinyin_mappings(kind);
    `
  },
  {
    id: "002_prop_search_indexes",
    description: "Add prop search indexes for admin UI",
    sql: `
      CREATE INDEX IF NOT EXISTS idx_props_name ON props(name);
      CREATE INDEX IF NOT EXISTS idx_props_meaning_or_image ON props(meaning_or_image);
    `
  },
  {
    id: "003_lexical_provenance_fields",
    description: "Add lexical provenance fields for character and word enrichment",
    sql: `
      ALTER TABLE characters ADD COLUMN pinyin_source TEXT CHECK (pinyin_source IN ('pleco_import', 'curriculum_import', 'manual', 'derived'));
      ALTER TABLE characters ADD COLUMN pinyin_source_ref TEXT;
      ALTER TABLE characters ADD COLUMN meaning_source TEXT CHECK (meaning_source IN ('pleco_import', 'curriculum_import', 'manual', 'derived'));
      ALTER TABLE characters ADD COLUMN meaning_source_ref TEXT;

      ALTER TABLE words ADD COLUMN pinyin_source TEXT CHECK (pinyin_source IN ('pleco_import', 'curriculum_import', 'manual', 'derived'));
      ALTER TABLE words ADD COLUMN pinyin_source_ref TEXT;
      ALTER TABLE words ADD COLUMN meaning_source TEXT CHECK (meaning_source IN ('pleco_import', 'curriculum_import', 'manual', 'derived'));
      ALTER TABLE words ADD COLUMN meaning_source_ref TEXT;
    `
  },
  {
    id: "004_review_state_and_events",
    description: "Add FSRS review state tables and review event log",
    sql: `
      CREATE TABLE IF NOT EXISTS character_review_state (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL UNIQUE,
        scheduler_type TEXT NOT NULL CHECK (scheduler_type IN ('fsrs')),
        due_at TEXT NOT NULL,
        stability REAL,
        difficulty REAL,
        last_reviewed_at TEXT,
        review_count INTEGER NOT NULL DEFAULT 0,
        lapse_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS word_review_state (
        id TEXT PRIMARY KEY,
        word_id TEXT NOT NULL UNIQUE,
        scheduler_type TEXT NOT NULL CHECK (scheduler_type IN ('fsrs')),
        due_at TEXT NOT NULL,
        stability REAL,
        difficulty REAL,
        last_reviewed_at TEXT,
        review_count INTEGER NOT NULL DEFAULT 0,
        lapse_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS review_events (
        id TEXT PRIMARY KEY,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('character', 'word')),
        item_id TEXT NOT NULL,
        scheduler_type TEXT NOT NULL CHECK (scheduler_type IN ('fsrs')),
        grade TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good', 'easy')),
        reviewed_at TEXT NOT NULL,
        due_at_before TEXT,
        due_at_after TEXT NOT NULL,
        stability_before REAL,
        stability_after REAL,
        difficulty_before REAL,
        difficulty_after REAL,
        elapsed_days REAL NOT NULL,
        review_count_after INTEGER NOT NULL,
        lapse_count_after INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_character_review_state_due_at ON character_review_state(due_at);
      CREATE INDEX IF NOT EXISTS idx_word_review_state_due_at ON word_review_state(due_at);
      CREATE INDEX IF NOT EXISTS idx_review_events_item ON review_events(item_kind, item_id, reviewed_at DESC);
    `
  },
  {
    id: "005_sentence_schema_and_analysis",
    description: "Add sentence storage, word links, and stored sentence analysis spans",
    sql: `
      CREATE TABLE IF NOT EXISTS sentences (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL UNIQUE,
        translation TEXT,
        pinyin_full TEXT,
        approval_status TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        audio_status TEXT NOT NULL CHECK (audio_status IN ('none', 'pending', 'ready', 'failed')),
        audio_path TEXT,
        generation_source TEXT CHECK (generation_source IN ('pleco_import', 'curriculum_import', 'manual', 'derived')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS word_sentences (
        sentence_id TEXT NOT NULL,
        word_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(sentence_id, sort_order),
        UNIQUE(sentence_id, word_id),
        FOREIGN KEY(sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
        FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sentence_analysis_spans (
        id TEXT PRIMARY KEY,
        sentence_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        text TEXT NOT NULL,
        span_type TEXT NOT NULL CHECK (span_type IN ('known_word', 'unknown_word', 'fallback_character', 'punctuation')),
        linked_word_id TEXT,
        linked_character_id TEXT,
        gloss_text TEXT,
        pinyin_text TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sentence_id, sort_order),
        CHECK (
          (linked_word_id IS NULL OR linked_character_id IS NULL)
          AND (
            (span_type IN ('known_word', 'unknown_word') AND linked_word_id IS NOT NULL AND linked_character_id IS NULL)
            OR (span_type = 'fallback_character' AND linked_word_id IS NULL AND linked_character_id IS NOT NULL)
            OR (span_type = 'punctuation' AND linked_word_id IS NULL AND linked_character_id IS NULL)
          )
        ),
        FOREIGN KEY(sentence_id) REFERENCES sentences(id) ON DELETE CASCADE,
        FOREIGN KEY(linked_word_id) REFERENCES words(id) ON DELETE CASCADE,
        FOREIGN KEY(linked_character_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_word_sentences_word_id ON word_sentences(word_id);
      CREATE INDEX IF NOT EXISTS idx_sentence_analysis_spans_sentence_id ON sentence_analysis_spans(sentence_id);
      CREATE INDEX IF NOT EXISTS idx_sentence_analysis_spans_word_id ON sentence_analysis_spans(linked_word_id);
      CREATE INDEX IF NOT EXISTS idx_sentence_analysis_spans_character_id ON sentence_analysis_spans(linked_character_id);
    `
  }
];
