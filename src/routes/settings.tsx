import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { fetchSession } from '#/lib/session'
import {
  addStreamerByLogin,
  importFollows,
  listStreamers,
  setAllSubscribed,
  setSubscribed,
} from '#/server/streamers'
import { AppHeader } from '#/components/app-header'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const session = await fetchSession()
    if (!session) throw redirect({ to: '/login' })
  },
  component: Settings,
})

function Settings() {
  const qc = useQueryClient()
  const [login, setLogin] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)

  const streamers = useQuery({
    queryKey: ['streamers'],
    queryFn: () => listStreamers(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['streamers'] })

  const importMut = useMutation({
    mutationFn: () => importFollows(),
    onSuccess: (r) => {
      setMsg(`Imported ${r.imported} followed channels.`)
      void invalidate()
    },
    onError: (e) => setMsg(String(e)),
  })

  const addMut = useMutation({
    mutationFn: (value: string) => addStreamerByLogin({ data: value }),
    onSuccess: (r) => {
      setMsg(`Added ${r.added}.`)
      setLogin('')
      void invalidate()
    },
    onError: (e) => setMsg(String(e)),
  })

  const subMut = useMutation({
    mutationFn: (input: { id: number; subscribed: boolean }) =>
      setSubscribed({ data: input }),
    onSuccess: () => void invalidate(),
  })

  const deselectAllMut = useMutation({
    mutationFn: () => setAllSubscribed({ data: false }),
    onSuccess: () => void invalidate(),
  })

  const all = streamers.data ?? []
  const subscribedCount = all.filter((s) => s.subscribed).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((s) => {
      if (selectedOnly && !s.subscribed) return false
      if (q && !s.displayName.toLowerCase().includes(q)) return false
      return true
    })
  }, [all, search, selectedOnly])

  return (
    <div>
      <AppHeader />
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-6 text-3xl font-bold">Settings</h1>

        <section className="mb-6 space-y-4">
          <h2 className="text-lg font-semibold">Streamers</h2>

          <div className="flex gap-2">
            <Button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
            >
              {importMut.isPending ? 'Importing…' : 'Import my follows'}
            </Button>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (login.trim()) addMut.mutate(login)
            }}
          >
            <Input
              placeholder="Add by Twitch login (e.g. xqc)"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={addMut.isPending}>
              Add
            </Button>
          </form>

          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search streamers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Button
              variant={selectedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedOnly((v) => !v)}
            >
              Selected only
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => deselectAllMut.mutate()}
              disabled={deselectAllMut.isPending || subscribedCount === 0}
            >
              Deselect all
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {subscribedCount} / {all.length} subscribed
            </span>
          </div>

          {streamers.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length > 0 ? (
            filtered.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  {s.profileImageUrl ? (
                    <img
                      src={s.profileImageUrl}
                      alt=""
                      className="size-8 rounded-full"
                    />
                  ) : null}
                  <div>
                    <div className="font-medium">{s.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.broadcasterType || 'standard'}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={s.subscribed}
                  onCheckedChange={(checked) =>
                    subMut.mutate({ id: s.id, subscribed: checked })
                  }
                />
              </div>
            ))
          ) : all.length > 0 ? (
            <p className="text-sm text-muted-foreground">No matches.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No streamers yet. Import your follows to get started.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
