"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Users, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import type { AppUser } from "@/lib/types";

export type DeptPermissions = {
  allowCreate: boolean;
  allowDelete: boolean;
  allowEdit: boolean;
  allowViewUnassigned: boolean;
};

type Props = {
  departmentId: string;
  departmentName?: string;
  members: AppUser[];
  initialManagers: string[];
  initialPermissions: Partial<DeptPermissions>;
  onSaved?: (next: {
    managers: string[];
    permissions: DeptPermissions;
  }) => void;
};

export default function ManagersSettings({
  departmentId,
  departmentName,
  members,
  initialManagers,
  initialPermissions,
  onSaved,
}: Props) {
  const [managers, setManagers] = useState<string[]>(initialManagers || []);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [perms, setPerms] = useState<DeptPermissions>({
    allowCreate: initialPermissions.allowCreate ?? true,
    allowDelete: initialPermissions.allowDelete ?? false,
    allowEdit: initialPermissions.allowEdit ?? true,
    allowViewUnassigned: initialPermissions.allowViewUnassigned ?? true,
  });

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.displayName?.toLowerCase() || "").includes(q) ||
        (m.email?.toLowerCase() || "").includes(q)
    );
  }, [members, search]);

  const toggleManager = (uid: string) => {
    setManagers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const save = async () => {
    if (!departmentId) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "departments", departmentId), {
        managerUserIds: managers,
        permissions: perms,
        updatedAt: new Date(),
      });
      toast.success("Settings saved");
      onSaved?.({ managers, permissions: perms });
    } catch (e) {
      console.error(e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-10 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b px-4 sm:px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl spacegrot font-semibold">
            Department Settings
          </h2>
          <p className="text-sm text-muted-foreground proximavara">
            Manage managers and member permissions
            {departmentName ? ` for ${departmentName}` : ""}.
          </p>
        </div>
        <Button onClick={save} disabled={saving} className="proximavara">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
      {/* Content grid */}
      <div className="px-4 sm:px-6 pb-6">
        <div className="grid grid-cols-1 xl:grid-cols-8 gap-3 items-start">
          {/* Managers - narrower section */}
          <div className="xl:col-span-3 rounded-xl border bg-card/50 backdrop-blur-xl overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="spacegrot font-semibold leading-6 text-base">
                    Managers
                  </h3>
                  <p className="text-xs text-muted-foreground proximavara leading-5 truncate">
                    Managers can access settings and override member
                    permissions.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4 proximavara">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members by name or email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-[600vh] overflow-y-auto divide-y rounded-md border">
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((m) => {
                    const isMgr = managers.includes(m.uid);
                    return (
                      <div
                        key={m.uid}
                        className={`flex items-center justify-between p-4 hover:bg-muted/40 transition`}
                      >
                        <button
                          onClick={() => toggleManager(m.uid)}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                            {(m.displayName || m.email || "?")!
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {m.displayName || m.email}
                            </div>
                            {m.displayName && (
                              <div className="text-sm text-muted-foreground truncate">
                                {m.email}
                              </div>
                            )}
                          </div>
                        </button>
                        <Checkbox
                          checked={isMgr}
                          onCheckedChange={() => toggleManager(m.uid)}
                        />
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground p-3 proximavara">
                    No members found.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Permissions - wider section */}
          <div className="xl:col-span-5 rounded-xl border bg-card/50 backdrop-blur-xl overflow-hidden self-start">
            <div className="p-5 border-b">
              <h3 className="font-semibold spacegrot">Member Permissions</h3>
              <p className="text-sm text-muted-foreground proximavara">
                Set what regular members can do in this department.
              </p>
            </div>
            <div className="divide-y">
              {[
                {
                  key: "allowCreate",
                  title: "Allow members to create projects",
                  desc: "When disabled, only managers can create projects.",
                },
                {
                  key: "allowDelete",
                  title: "Allow members to delete projects",
                  desc: "When disabled, only managers can delete projects.",
                },
                {
                  key: "allowEdit",
                  title: "Allow members to edit projects",
                  desc: "When disabled, only managers can edit projects.",
                },
                {
                  key: "allowViewUnassigned",
                  title: "Allow members to view unassigned projects",
                  desc: "When disabled, members can only see projects assigned to them or created by them.",
                },
              ].map((row) => (
                <div
                  key={row.key}
                  className="flex items-start justify-between p-5"
                >
                  <div className="pr-4">
                    <div className="font-medium spacegrot">{row.title}</div>
                    <div className="text-sm text-muted-foreground proximavara">
                      {row.desc}
                    </div>
                  </div>
                  <Switch
                    checked={(perms as any)[row.key]}
                    onCheckedChange={(val) =>
                      setPerms(
                        (p) => ({ ...(p as any), [row.key]: val }) as any
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
