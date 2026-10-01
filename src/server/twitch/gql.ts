// Twitch's internal GraphQL API — the one twitch.tv itself uses. It is
// undocumented and unsupported: it is the only source for VOD chat replay,
// game chapters and playback tokens (used for downloads), but it can change
// without notice. Everything that depends on it lives in this file.
//
// Requests use Twitch's public web client id and "persisted queries": the
// query text is stored on Twitch's side and referenced by its SHA-256 hash.
const GQL_URL = 'https://gql.twitch.tv/gql'
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const COMMENTS_QUERY_HASH =
  'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a'
const CHAPTERS_QUERY_HASH =
  '8d2793384aac3773beab5e59bd5d6f585aedb923d292800119e03d40cd0f9b41'

async function gql<T>(operation: {
  operationName: string
  variables: Record<string, unknown>
  query?: string
  extensions?: unknown
}): Promise<T | undefined> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Client-Id': WEB_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify([operation]),
  })
  if (!res.ok) throw new Error(`Twitch GQL ${operation.operationName} ${res.status}`)
  const json = (await res.json()) as Array<{ data?: T }>
  return json[0]?.data
}

function persistedQuery<T>(
  operationName: string,
  sha256Hash: string,
  variables: Record<string, unknown>,
) {
  return gql<T>({
    operationName,
    variables,
    extensions: { persistedQuery: { version: 1, sha256Hash } },
  })
}

// ── Chat replay ──────────────────────────────────────────────────────────

export interface ChatFragment {
  text: string
  emoteId?: string
}

export interface ChatBadge {
  setId: string
  version: string
}

export interface ChatComment {
  id: string
  offset: number // seconds since the start of the VOD
  name: string
  color: string | null
  badges: Array<ChatBadge>
  fragments: Array<ChatFragment>
}

export interface ChatPage {
  comments: Array<ChatComment>
  cursor: string | null
  hasMore: boolean
}

interface CommentsResponse {
  video?: {
    comments?: {
      edges: Array<{
        cursor?: string
        node: {
          id: string
          contentOffsetSeconds: number
          commenter?: { displayName?: string } | null
          message?: {
            userColor?: string | null
            fragments?: Array<{ text: string; emote?: { emoteID?: string } | null }>
            userBadges?: Array<{ setID?: string; version?: string }> | null
          } | null
        }
      }>
      pageInfo?: { hasNextPage?: boolean }
    }
  } | null
}

/**
 * One page of chat (~50–100 messages). Start at an offset in seconds, then
 * follow `cursor` for the next page.
 */
export async function fetchChatPage(
  videoId: string,
  from: { offsetSeconds: number } | { cursor: string },
): Promise<ChatPage> {
  const data = await persistedQuery<CommentsResponse>(
    'VideoCommentsByOffsetOrCursor',
    COMMENTS_QUERY_HASH,
    'cursor' in from
      ? { videoID: videoId, cursor: from.cursor }
      : { videoID: videoId, contentOffsetSeconds: Math.floor(from.offsetSeconds) },
  )
  const block = data?.video?.comments
  if (!block) return { comments: [], cursor: null, hasMore: false }

  const comments = block.edges.map(({ node }) => ({
    id: node.id,
    offset: node.contentOffsetSeconds,
    name: node.commenter?.displayName ?? 'unknown',
    color: node.message?.userColor ?? null,
    // Twitch includes an empty placeholder badge on many messages.
    badges: (node.message?.userBadges ?? []).flatMap((b) =>
      b.setID ? [{ setId: b.setID, version: b.version || '1' }] : [],
    ),
    fragments: (node.message?.fragments ?? []).map((f) => ({
      text: f.text,
      emoteId: f.emote?.emoteID ?? undefined,
    })),
  }))
  const hasMore = !!block.pageInfo?.hasNextPage
  return {
    comments,
    hasMore,
    cursor: hasMore ? (block.edges.at(-1)?.cursor ?? null) : null,
  }
}

// ── Game chapters ────────────────────────────────────────────────────────

export interface VodChapter {
  positionSeconds: number
  game: string
}

interface ChaptersResponse {
  video?: {
    moments?: {
      edges: Array<{
        node: {
          positionMilliseconds?: number
          description?: string
          details?: { game?: { displayName?: string } | null } | null
        }
      }>
    }
  } | null
}

/** The per-VOD game timeline twitch.tv shows under the player. */
export async function fetchChapters(videoId: string): Promise<Array<VodChapter>> {
  const data = await persistedQuery<ChaptersResponse>(
    'VideoPlayer_ChapterSelectButtonVideo',
    CHAPTERS_QUERY_HASH,
    { includePrivate: false, videoID: videoId },
  )
  return (data?.video?.moments?.edges ?? []).map(({ node }) => ({
    positionSeconds: Math.round((node.positionMilliseconds ?? 0) / 1000),
    game: node.details?.game?.displayName ?? node.description ?? 'Unknown',
  }))
}

// ── Playback access ──────────────────────────────────────────────────────

const PLAYBACK_TOKEN_QUERY = `query PlaybackAccessToken($vodID: ID!) {
  videoPlaybackAccessToken(id: $vodID, params: { platform: "web", playerBackend: "mediaplayer", playerType: "embed" }) {
    value
    signature
  }
}`

/**
 * The signed token twitch.tv's own player uses to request a VOD's playlist.
 * Null when Twitch no longer has the VOD.
 */
export async function fetchPlaybackToken(
  videoId: string,
): Promise<{ value: string; signature: string } | null> {
  const data = await gql<{
    videoPlaybackAccessToken?: { value: string; signature: string } | null
  }>({
    operationName: 'PlaybackAccessToken',
    query: PLAYBACK_TOKEN_QUERY,
    variables: { vodID: videoId },
  })
  return data?.videoPlaybackAccessToken ?? null
}
