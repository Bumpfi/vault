import { createFileRoute } from '@tanstack/react-router'
import { AppHeader } from '#/components/app-header'
import { AdminPanel } from '#/features/admin/admin-panel'
import { Preferences } from '#/features/settings/preferences'
import { StreamerManager } from '#/features/streamers/streamer-manager'

export const Route = createFileRoute('/_authed/settings')({
  head: () => ({ meta: [{ title: 'Settings — Vault' }] }),
  component: Settings,
})

function Settings() {
  const { user } = Route.useRouteContext()
  return (
    <div>
      <AppHeader />
      <div className="mx-auto max-w-2xl space-y-10 p-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <Preferences />
        {user.role === 'admin' ? <AdminPanel currentUserId={user.id} /> : null}
        <StreamerManager />
      </div>
    </div>
  )
}
