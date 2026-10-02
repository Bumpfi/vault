// Twitch's internal GraphQL API — the one twitch.tv itself uses. It is
// undocumented and unsupported: it is the only source for VOD chat replay,
// categories and playback tokens (used for downloads), but it can change
// without notice. Everything that depends on it lives in this file.
//
// Requests use Twitch's public web client id. Some use "persisted queries",
// where the query text is stored on Twitch's side and referenced by its
// SHA-256 hash; others send the query text directly.
const GQL_URL = 'https://gql.twitch.tv/gql'
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const COMMENTS_QUERY_HASH =
  'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a'

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

// ── Categories ───────────────────────────────────────────────────────────

/** A category (game) of a VOD, and where in the VOD it starts. */
export interface VodCategory {
  name: string
  boxArtUrl: string | null
  positionSeconds: number
}

const CATEGORIES_QUERY = `query VodCategories($id: ID!) {
  video(id: $id) {
    game { displayName boxArtURL(width: 40, height: 53) }
    moments(momentRequestType: VIDEO_CHAPTER_MARKERS, types: [GAME_CHANGE]) {
      edges { node {
        positionMilliseconds
        details { ... on GameChangeMomentDetails { game { displayName boxArtURL(width: 40, height: 53) } } }
      } }
    }
  }
}`

interface Game {
  displayName: string
  boxArtURL: string | null
}

interface CategoriesResponse {
  video?: {
    game?: Game | null
    moments?: {
      edges: Array<{
        node: { positionMilliseconds?: number; details?: { game?: Game | null } | null }
      }>
    } | null
  } | null
}

/**
 * The categories a VOD was streamed in, in order. Twitch only records
 * chapters when the category changes, so a stream that stayed in one
 * category has none — then the VOD's own category is the only entry.
 */
export async function fetchCategories(videoId: string): Promise<Array<VodCategory>> {
  const data = await gql<CategoriesResponse>({
    operationName: 'VodCategories',
    query: CATEGORIES_QUERY,
    variables: { id: videoId },
  })
  const chapters = (data?.video?.moments?.edges ?? []).flatMap(({ node }) => {
    const game = node.details?.game
    if (!game) return []
    return [
      {
        name: game.displayName,
        boxArtUrl: game.boxArtURL,
        positionSeconds: Math.round((node.positionMilliseconds ?? 0) / 1000),
      },
    ]
  })
  if (chapters.length > 0) return chapters
  const game = data?.video?.game
  return game
    ? [{ name: game.displayName, boxArtUrl: game.boxArtURL, positionSeconds: 0 }]
    : []
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
