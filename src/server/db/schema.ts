import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// ── Better Auth ──────────────────────────────────────────────────────────
// Shape required by Better Auth's Drizzle adapter. JS field names are
// camelCase to match its model; database columns are snake_case.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // 'admin' | 'user'. The first account to sign up becomes admin.
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ── App ──────────────────────────────────────────────────────────────────

// Instance-wide settings. A single row with id = 1.
export const appSetting = pgTable('app_setting', {
  id: integer('id').primaryKey(),
  registrationEnabled: boolean('registration_enabled').notNull().default(true),
})

// Shared catalog: one row per Twitch channel, regardless of how many users
// follow it, so each channel is polled once.
export const streamer = pgTable('streamer', {
  id: serial('id').primaryKey(),
  twitchUserId: text('twitch_user_id').notNull().unique(),
  login: text('login').notNull(),
  displayName: text('display_name').notNull(),
  profileImageUrl: text('profile_image_url'),
  broadcasterType: text('broadcaster_type').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// A streamer in a user's library. `enabled` controls whether its VODs show
// up in that user's feed; disabling keeps the row so the user can re-enable
// it later without re-importing.
export const subscription = pgTable(
  'subscription',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    streamerId: integer('streamer_id')
      .notNull()
      .references(() => streamer.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    // User-defined grouping such as "RP" or "Variety".
    category: text('category'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('subscription_user_streamer_unq').on(t.userId, t.streamerId),
    // The unique index above leads with user_id; joins by streamer need this.
    index('subscription_streamer_id_idx').on(t.streamerId),
  ],
)

export const userSetting = pgTable('user_setting', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  defaultCategory: text('default_category'),
  unwatchedDefault: boolean('unwatched_default').notNull().default(false),
  theme: text('theme'), // null = default theme
})

// Shared catalog of archived broadcasts.
export const vod = pgTable(
  'vod',
  {
    id: serial('id').primaryKey(),
    twitchVideoId: text('twitch_video_id').notNull().unique(),
    streamerId: integer('streamer_id')
      .notNull()
      .references(() => streamer.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Contains %{width}x%{height} placeholders, filled in when rendering.
    thumbnailUrl: text('thumbnail_url'),
    // Id of the live stream that produced this VOD. Used to flag the VOD that
    // is still being recorded and to locate the raw files on Twitch's CDN.
    streamId: text('stream_id'),
    createdAtTwitch: timestamp('created_at_twitch'),
    publishedAt: timestamp('published_at'),
    durationSeconds: integer('duration_seconds'),
    // False once Twitch no longer lists the VOD (deleted or expired).
    isAvailable: boolean('is_available').notNull().default(true),
  },
  (t) => [
    index('vod_streamer_id_idx').on(t.streamerId),
    index('vod_published_at_idx').on(t.publishedAt),
  ],
)

export const watchProgress = pgTable(
  'watch_progress',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    vodId: integer('vod_id')
      .notNull()
      .references(() => vod.id, { onDelete: 'cascade' }),
    positionSeconds: integer('position_seconds').notNull().default(0),
    // Set automatically once playback passes 90%.
    completed: boolean('completed').notNull().default(false),
    // User-facing flag; set by `completed` or toggled manually.
    watched: boolean('watched').notNull().default(false),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('watch_progress_user_vod_unq').on(t.userId, t.vodId)],
)
