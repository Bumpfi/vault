import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '#/features/auth/middleware'
import { fetchChatPage } from '#/server/twitch/gql'
import { getChannelBadges, getGlobalBadges } from '#/server/twitch/helix'
import type { BadgeMap } from '#/server/twitch/helix'

const twitchId = z.string().regex(/^\d+$/)

/** One page of chat replay, starting at an offset or continuing a cursor. */
export const getChatPage = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      videoId: twitchId,
      from: z.union([
        z.object({ offsetSeconds: z.number().nonnegative() }),
        z.object({ cursor: z.string().min(1) }),
      ]),
    }),
  )
  .handler(({ data }) => fetchChatPage(data.videoId, data.from))

/** Global and channel badges merged; the channel's version wins on conflict. */
export const getChatBadges = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(twitchId)
  .handler(async ({ data: broadcasterId }): Promise<BadgeMap> => {
    const [global, channel] = await Promise.all([
      getGlobalBadges(),
      // A channel without custom badges shouldn't hide the global ones.
      getChannelBadges(broadcasterId).catch(() => ({})),
    ])
    return { ...global, ...channel }
  })
