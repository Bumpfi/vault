import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminOverview, removeUser, setRegistrationEnabled } from './functions'
import { SettingRow } from '#/components/setting-row'
import { Button } from '#/components/ui/button'
import { Switch } from '#/components/ui/switch'

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient()
  const overview = useQuery({ queryKey: ['admin'], queryFn: () => getAdminOverview() })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const setRegistration = useMutation({
    mutationFn: (enabled: boolean) => setRegistrationEnabled({ data: enabled }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeUser({ data: userId }),
    onSuccess: refresh,
  })

  if (!overview.data) return null
  const { registrationEnabled, users } = overview.data

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Administration</h2>

      <SettingRow
        title="Open registration"
        description="Let new people sign up with their Twitch account. Each user gets their own library and watch progress."
      >
        <Switch
          checked={registrationEnabled}
          onCheckedChange={(checked) => setRegistration.mutate(checked)}
        />
      </SettingRow>

      <div className="space-y-2 rounded-md border p-3">
        <div className="font-medium">Users</div>
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {u.image ? (
                <img src={u.image} alt="" className="size-6 shrink-0 rounded-full" />
              ) : null}
              <span className="truncate text-sm">{u.name}</span>
              {u.role === 'admin' ? (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  ADMIN
                </span>
              ) : null}
            </div>
            {u.id !== currentUserId ? (
              <Button
                variant="outline"
                size="sm"
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    confirm(`Remove ${u.name} and all their data? This can't be undone.`)
                  ) {
                    remove.mutate(u.id)
                  }
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
