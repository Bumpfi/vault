import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'

// Unofficial Twitch GraphQL — same anonymous endpoint TwitchDownloader uses to
// read VOD chat. Undocumented / ToS gray area; can break if Twitch changes it.
const GQL = 'https://gql.twitch.tv/gql'
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const HASH = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a'

export interface ChatFragment {
  text: string
  emoteId?: string
}

export interface ChatComment {
  id: string
  offset: number
  name: string
  color: string | null
  fragments: Array<ChatFragment>
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
    message?: { userColor?: string | null; fragments?: Array<GqlFragment> } | null
  }
}

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
    }))

    const hasMore = !!block.pageInfo?.hasNextPage
    const cursor = hasMore
      ? (block.edges[block.edges.length - 1]?.cursor ?? null)
      : null

    return { comments, cursor, hasMore }
  })
