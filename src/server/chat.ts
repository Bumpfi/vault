import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'
import {
  getAppToken,
  getChannelBadges,
  getGlobalBadges,
} from '#/lib/twitch'
import type { BadgeMap } from '#/lib/twitch'

// Unofficial Twitch GraphQL — same anonymous endpoint TwitchDownloader uses to
// read VOD chat. Undocumented / ToS gray area; can break if Twitch changes it.
const GQL = 'https://gql.twitch.tv/gql'
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const HASH = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a'
const CHAPTERS_HASH =
  '8d2793384aac3773beab5e59bd5d6f585aedb923d292800119e03d40cd0f9b41'

export interface ChatFragment {
  text: string
  emoteId?: string
}

export interface ChatBadgeRef {
  setID: string
  version: string
}

export interface ChatComment {
  id: string
  offset: number
  name: string
  color: string | null
  fragments: Array<ChatFragment>
  badges: Array<ChatBadgeRef>
}

interface GqlFragment {
  text: string
  emote?: { emoteID?: string } | null
}
interface GqlEdge {
  cursor?: string
  node: {
    id: string
    contentOffsetSeconds: number
    commenter?: { displayName?: string } | null
    message?: {
      userColor?: string | null
      fragments?: Array<GqlFragment>
      userBadges?: Array<{ setID?: string; version?: string }> | null
    } | null
  }
}

export interface VodChapter {
  positionSeconds: number
  game: string
}

// Game chapters (the per-VOD game timeline shown on twitch.tv). Same
// unofficial GraphQL endpoint as chat.
export const getVodChapters = createServerFn({ method: 'GET' })
  .validator((videoId: string) => videoId)
  .handler(async ({ data: videoId }) => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')

    const res = await fetch(GQL, {
      method: 'POST',
      headers: {
        'Client-Id': GQL_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          operationName: 'VideoPlayer_ChapterSelectButtonVideo',
          variables: { includePrivate: false, videoID: videoId },
          extensions: {
            persistedQuery: { version: 1, sha256Hash: CHAPTERS_HASH },
          },
        },
      ]),
    })
    if (!res.ok) return [] as Array<VodChapter>

    const json = (await res.json()) as Array<{
      data?: {
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
        }
      }
    }>
    const edges = json[0]?.data?.video?.moments?.edges ?? []
    return edges.map((e) => ({
      positionSeconds: Math.round((e.node.positionMilliseconds ?? 0) / 1000),
      game:
        e.node.details?.game?.displayName ?? e.node.description ?? 'Unknown',
    }))
  })

// Global + channel chat badges, merged (channel wins) so the replay can render
// mod/VIP/sub/broadcaster icons like native Twitch chat. Official Helix API.
export const getChatBadges = createServerFn({ method: 'GET' })
  .validator((broadcasterId: string) => broadcasterId)
  .handler(async ({ data: broadcasterId }) => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')

    const token = await getAppToken()
    const [global, channel] = await Promise.all([
      getGlobalBadges(token),
      // A channel with no custom badges (or a bad id) shouldn't kill globals.
      getChannelBadges(token, broadcasterId).catch(() => ({})),
    ])
    return { ...global, ...channel } satisfies BadgeMap
  })

export const getVodChat = createServerFn({ method: 'GET' })
  .validator(
    (input: { videoId: string; offsetSeconds?: number; cursor?: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { headers } = getRequest()
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error('Unauthorized')

    const variables: Record<string, unknown> = { videoID: data.videoId }
    if (data.cursor) variables.cursor = data.cursor
    else variables.contentOffsetSeconds = Math.floor(data.offsetSeconds ?? 0)

    const res = await fetch(GQL, {
      method: 'POST',
      headers: {
        'Client-Id': GQL_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          operationName: 'VideoCommentsByOffsetOrCursor',
          variables,
          extensions: { persistedQuery: { version: 1, sha256Hash: HASH } },
        },
      ]),
    })
    if (!res.ok) {
      throw new Error(`Twitch GQL ${res.status}: ${await res.text()}`)
    }

    const json = (await res.json()) as Array<{
      data?: {
        video?: {
          comments?: {
            edges: Array<GqlEdge>
            pageInfo?: { hasNextPage?: boolean }
          }
        }
      }
    }>
    const block = json[0]?.data?.video?.comments
    if (!block) return { comments: [], cursor: null, hasMore: false }

    const comments: Array<ChatComment> = block.edges.map((e) => ({
      id: e.node.id,
      offset: e.node.contentOffsetSeconds,
      name: e.node.commenter?.displayName ?? 'unknown',
      color: e.node.message?.userColor ?? null,
      fragments: (e.node.message?.fragments ?? []).map((f) => ({
        text: f.text,
        emoteId: f.emote?.emoteID ?? undefined,
      })),
      // Twitch sends a placeholder badge with an empty setID — drop it.
      badges: (e.node.message?.userBadges ?? [])
        .filter((b) => b.setID)
        .map((b) => ({ setID: b.setID as string, version: b.version ?? '1' })),
    }))

    const hasMore = !!block.pageInfo?.hasNextPage
    const cursor = hasMore
      ? (block.edges[block.edges.length - 1]?.cursor ?? null)
      : null

    return { comments, cursor, hasMore }
  })
