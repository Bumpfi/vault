import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// ── Better Auth tables ───────────────────────────────────────────────
// Field (JS) names are camelCase to match Better Auth's model fields;
// DB column names are snake_case.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
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
})

export const account = pgTable('account', {
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
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ── App tables ───────────────────────────────────────────────────────

export const streamer = pgTable('streamer', {
  id: serial('id').primaryKey(),
  twitchUserId: text('twitch_user_id').notNull().unique(),
  login: text('login').notNull(),
  displayName: text('display_name').notNull(),
  profileImageUrl: text('profile_image_url'),
  broadcasterType: text('broadcaster_type').notNull().default(''),
  // Manual retention-days override (Phase 6); null = derive from tier.
  retentionOverride: integer('retention_override'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type Streamer = typeof streamer.$inferSelect

// Per-user subscription to a streamer. Replaces the old global
// streamer.subscribed flag — each user has their own feed.
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
    // User-assigned grouping, e.g. "RP", "Variety". Null = uncategorized.
    category: text('category'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique('subscription_user_streamer_unq').on(t.userId, t.streamerId)],
)

export type Subscription = typeof subscription.$inferSelect

// Per-user dashboard preferences.
export const userSetting = pgTable('user_setting', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  defaultCategory: text('default_category'),
  unwatchedDefault: boolean('unwatched_default').notNull().default(false),
  theme: text('theme'), // 'dark' | 'light' | null (= dark)
})

export type UserSetting = typeof userSetting.$inferSelect

export const vod = pgTable('vod', {
  id: serial('id').primaryKey(),
  twitchVideoId: text('twitch_video_id').notNull().unique(),
  streamerId: integer('streamer_id')
    .notNull()
    .references(() => streamer.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  url: text('url').notNull(),
  // Stored with %{width}x%{height} placeholders; substitute when rendering.
  thumbnailUrl: text('thumbnail_url'),
  streamId: text('stream_id'),
  createdAtTwitch: timestamp('created_at_twitch'),
  publishedAt: timestamp('published_at'),
  durationSeconds: integer('duration_seconds'),
  type: text('type').notNull().default('archive'),
  estimatedExpiryAt: timestamp('estimated_expiry_at'), // Phase 6
  firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  isAvailable: boolean('is_available').notNull().default(true),
})

export type Vod = typeof vod.$inferSelect

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
    durationSeconds: integer('duration_seconds'),
    completed: boolean('completed').notNull().default(false),
    watched: boolean('watched').notNull().default(false),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('watch_progress_user_vod_unq').on(t.userId, t.vodId)],
)

export type WatchProgress = typeof watchProgress.$inferSelect
