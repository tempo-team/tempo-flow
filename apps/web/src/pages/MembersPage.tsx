// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type MemberDto, type RoleDto, api } from "@/lib/api"

export function MembersPage() {
  const [members, setMembers] = useState<MemberDto[] | null>(null)
  const [roles, setRoles] = useState<RoleDto[]>([])
  const [toDelete, setToDelete] = useState<MemberDto | null>(null)

  function reload(): void {
    api
      .listMembers()
      .then(setMembers)
      .catch((e: Error) => toast.error("Failed to load members", { description: e.message }))
  }
  useEffect(() => {
    reload()
    api
      .listRoles()
      .then(setRoles)
      .catch(() => undefined)
  }, [])

  async function toggleActive(m: MemberDto): Promise<void> {
    try {
      await api.updateMember(m.id, { active: !m.active })
      reload()
    } catch (e) {
      toast.error("Update failed", { description: (e as Error).message })
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!toDelete) return
    try {
      await api.deleteMember(toDelete.id)
      toast.success(`Deleted ${toDelete.email}`)
      setToDelete(null)
      reload()
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">Manage users and their roles.</p>
        </div>
        <MemberDialog roles={roles} onSaved={reload}>
          <Button>
            <Plus className="mr-2 size-4" /> New user
          </Button>
        </MemberDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.email}</TableCell>
                  <TableCell className="text-muted-foreground">{m.name ?? "—"}</TableCell>
                  <TableCell className="space-x-1">
                    {m.roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Switch checked={m.active} onCheckedChange={() => toggleActive(m)} />
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <MemberDialog roles={roles} member={m} onSaved={reload}>
                      <Button variant="outline" size="sm">
                        Roles
                      </Button>
                    </MemberDialog>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(m)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium">{toDelete?.email}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface DialogProps {
  roles: RoleDto[]
  member?: MemberDto
  onSaved: () => void
  children: React.ReactNode
}

/** Create a new user, or (when `member` is set) edit an existing user's roles. */
function MemberDialog({ roles, member, onSaved, children }: DialogProps) {
  const isEdit = Boolean(member)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<string[]>(member?.roles ?? [])
  const [busy, setBusy] = useState(false)

  function toggle(role: string): void {
    setSelected((s) => (s.includes(role) ? s.filter((r) => r !== role) : [...s, role]))
  }

  async function save(): Promise<void> {
    setBusy(true)
    try {
      if (isEdit && member) {
        await api.setMemberRoles(member.id, selected)
        toast.success("Roles updated")
      } else {
        await api.createMember({ email, password, name: name || undefined, roles: selected })
        toast.success("User created")
      }
      onSaved()
      setOpen(false)
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Roles · ${member?.email}` : "New user"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!isEdit && (
            <>
              <Field label="Email">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              </Field>
              <Field label="Password">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                />
              </Field>
              <Field label="Name (optional)">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </>
          )}
          <div className="grid gap-2">
            <Label>Roles</Label>
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(r.name)}
                  onCheckedChange={() => toggle(r.name)}
                />
                {r.name}
                {r.description && (
                  <span className="text-xs text-muted-foreground">— {r.description}</span>
                )}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
