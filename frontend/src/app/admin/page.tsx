"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import {
  Users,
  UserPlus,
  Activity,
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface Stats {
  total_users: number;
  new_today: number;
  new_this_week: number;
  new_this_month: number;
  by_role: Record<string, number>;
  active_this_week: number;
  recent_registrations: {
    id: number;
    username: string;
    email: string;
    role: string;
    created_at: string | null;
  }[];
}

interface UserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  pages: number;
}

async function adminFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem("vision_token");
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

async function adminMutate<T>(
  path: string,
  method: "PATCH" | "DELETE",
  body?: Record<string, unknown>,
): Promise<T | null> {
  const token = localStorage.getItem("vision_token");
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(data.detail || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-primary)] bg-gradient-to-br from-[var(--color-glass-from)] to-[var(--color-glass-to)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </span>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-3xl font-mono font-bold text-[var(--color-text-primary)] tabular-nums">
        {value}
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-[var(--color-neon-purple)]/15 text-[var(--color-neon-purple)]",
    trader: "bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]",
    viewer: "bg-[var(--color-neon-cyan)]/15 text-[var(--color-neon-cyan)]",
  };
  return (
    <span
      className={`inline-block text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold ${colors[role] ?? colors.viewer}`}
    >
      {role}
    </span>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function EditUserModal({
  user: targetUser,
  role,
  isActive,
  loading,
  onRoleChange,
  onActiveChange,
  onSave,
  onClose,
}: {
  user: UserRow;
  role: string;
  isActive: boolean;
  loading: boolean;
  onRoleChange: (r: string) => void;
  onActiveChange: (a: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-6 pb-5 space-y-5">
          <div>
            <h3 className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
              Edit User
            </h3>
            <p className="text-[11px] font-mono text-[var(--color-text-muted)] mt-1">
              {targetUser.username} ({targetUser.email})
            </p>
          </div>

          {/* Role selector */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Role
            </label>
            <div className="flex gap-2">
              {["admin", "trader", "viewer"].map((r) => (
                <button
                  key={r}
                  onClick={() => onRoleChange(r)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-mono font-semibold uppercase border transition-colors ${
                    role === r
                      ? "border-[var(--color-neon-blue)] bg-[var(--color-neon-blue)]/15 text-[var(--color-neon-blue)]"
                      : "border-[var(--color-border-primary)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              Account Active
            </label>
            <button
              onClick={() => onActiveChange(!isActive)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isActive ? "bg-[var(--color-neon-green)]" : "bg-[var(--color-bg-hover)]"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  isActive ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--color-border-primary)] text-xs font-mono text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-[var(--color-neon-blue)] text-xs font-mono font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteUserModal({
  user: targetUser,
  loading,
  onConfirm,
  onClose,
}: {
  user: UserRow;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--color-bear)]/30 bg-[var(--color-bg-secondary)] shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-bear)]/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-[var(--color-bear)]" />
            </div>
            <div>
              <h3 className="text-sm font-mono font-bold text-[var(--color-text-primary)]">
                Delete User
              </h3>
              <p className="text-[11px] font-mono text-[var(--color-text-muted)] mt-1">
                Permanently delete <span className="text-[var(--color-text-primary)] font-semibold">{targetUser.username}</span>? This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--color-border-primary)] text-xs font-mono text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-[var(--color-bear)] text-xs font-mono font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, token, loading: authLoading, checkAuth } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [usersData, setUsersData] = useState<UsersResponse | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Auth check
  useEffect(() => {
    if (!token) {
      checkAuth();
    }
  }, [token, checkAuth]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  // Fetch stats
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    adminFetch<Stats>("/api/v1/admin/stats")
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [user]);

  // Fetch users
  const fetchUsers = useCallback(() => {
    if (!user || user.role !== "admin") return;
    setLoadingData(true);
    adminFetch<UsersResponse>(
      `/api/v1/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`
    )
      .then((data) => {
        setUsersData(data);
        setLoadingData(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoadingData(false);
      });
  }, [user, page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Search debounce
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // --- Mutation handlers ---
  const handleUpdateUser = useCallback(async () => {
    if (!editingUser) return;
    setActionLoading(true);
    try {
      await adminMutate(`/api/v1/admin/users/${editingUser.id}`, "PATCH", {
        role: editRole,
        is_active: editActive,
      });
      toast.success(`Updated ${editingUser.username}`);
      setEditingUser(null);
      fetchUsers();
      adminFetch<Stats>("/api/v1/admin/stats").then(setStats);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionLoading(false);
    }
  }, [editingUser, editRole, editActive, fetchUsers]);

  const handleDeleteUser = useCallback(async () => {
    if (!deletingUser) return;
    setActionLoading(true);
    try {
      await adminMutate(`/api/v1/admin/users/${deletingUser.id}`, "DELETE");
      toast.success(`Deleted ${deletingUser.username}`);
      setDeletingUser(null);
      fetchUsers();
      adminFetch<Stats>("/api/v1/admin/stats").then(setStats);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionLoading(false);
    }
  }, [deletingUser, fetchUsers]);

  const handleToggleActive = useCallback(async (u: UserRow) => {
    try {
      await adminMutate(`/api/v1/admin/users/${u.id}`, "PATCH", {
        is_active: !u.is_active,
      });
      toast.success(`${u.username} ${u.is_active ? "deactivated" : "activated"}`);
      fetchUsers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  }, [fetchUsers]);

  const openEditModal = (u: UserRow) => {
    setEditRole(u.role);
    setEditActive(u.is_active);
    setEditingUser(u);
  };

  if (authLoading || !user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-[var(--color-text-muted)] font-mono text-sm animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <div className="h-5 w-px bg-[var(--color-border-primary)]" />
          <h1 className="text-sm font-mono font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--color-neon-purple)]" />
            Admin Panel
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-[var(--color-bear)]/30 bg-[var(--color-bear)]/10 px-4 py-3 text-sm font-mono text-[var(--color-bear)]">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Users"
              value={stats.total_users}
              icon={Users}
              color="text-[var(--color-neon-blue)]"
            />
            <StatCard
              label="New Today"
              value={stats.new_today}
              icon={UserPlus}
              color="text-[var(--color-neon-green)]"
            />
            <StatCard
              label="New This Week"
              value={stats.new_this_week}
              icon={UserPlus}
              color="text-[var(--color-neon-cyan)]"
            />
            <StatCard
              label="Active (7d)"
              value={stats.active_this_week}
              icon={Activity}
              color="text-[var(--color-neon-purple)]"
            />
          </div>
        )}

        {/* Role Breakdown + Recent */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Role Breakdown */}
            <div className="rounded-xl border border-[var(--color-border-primary)] bg-gradient-to-br from-[var(--color-glass-from)] to-[var(--color-glass-to)] p-5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
                Users by Role
              </h2>
              <div className="space-y-3">
                {Object.entries(stats.by_role).map(([role, count]) => {
                  const pct = stats.total_users > 0 ? (count / stats.total_users) * 100 : 0;
                  return (
                    <div key={role}>
                      <div className="flex items-center justify-between mb-1">
                        <RoleBadge role={role} />
                        <span className="text-sm font-mono font-semibold text-[var(--color-text-primary)] tabular-nums">
                          {count}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--color-bg-hover)]">
                        <div
                          className="h-1.5 rounded-full bg-[var(--color-neon-blue)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(stats.by_role).length === 0 && (
                  <p className="text-xs font-mono text-[var(--color-text-muted)]">No users yet</p>
                )}
              </div>
            </div>

            {/* Recent Registrations */}
            <div className="rounded-xl border border-[var(--color-border-primary)] bg-gradient-to-br from-[var(--color-glass-from)] to-[var(--color-glass-to)] p-5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
                Recent Registrations
              </h2>
              <div className="space-y-2">
                {stats.recent_registrations.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 py-2 border-b border-[var(--color-border-primary)]/50 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center text-xs font-mono font-bold text-[var(--color-neon-cyan)]">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold text-[var(--color-text-primary)] truncate">
                        {u.username}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
                        {u.email}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <RoleBadge role={u.role} />
                      <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">
                        {timeAgo(u.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
                {stats.recent_registrations.length === 0 && (
                  <p className="text-xs font-mono text-[var(--color-text-muted)]">No registrations yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Full User List */}
        <div className="rounded-xl border border-[var(--color-border-primary)] bg-gradient-to-br from-[var(--color-glass-from)] to-[var(--color-glass-to)]">
          <div className="flex items-center justify-between p-5 border-b border-[var(--color-border-primary)]">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              All Users {usersData && `(${usersData.total})`}
            </h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-neon-blue)]/50 w-48"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--color-border-primary)]">
                  <th className="text-left px-5 py-3 text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
                    User
                  </th>
                  <th className="text-left px-5 py-3 text-[var(--color-text-muted)] uppercase tracking-wider font-semibold hidden sm:table-cell">
                    Email
                  </th>
                  <th className="text-left px-5 py-3 text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
                    Role
                  </th>
                  <th className="text-left px-5 py-3 text-[var(--color-text-muted)] uppercase tracking-wider font-semibold hidden md:table-cell">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
                    Joined
                  </th>
                  <th className="text-right px-5 py-3 text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {usersData?.users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--color-border-primary)]/30 hover:bg-[var(--color-bg-hover)]/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {u.username}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[var(--color-text-secondary)] hidden sm:table-cell">
                      {u.email}
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <span
                        className={`inline-flex items-center gap-1 ${u.is_active ? "text-[var(--color-neon-green)]" : "text-[var(--color-bear)]"}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-[var(--color-neon-green)]" : "bg-[var(--color-bear)]"}`}
                        />
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[var(--color-text-muted)]">
                      {timeAgo(u.created_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {u.id !== user?.id && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors group"
                            title="Edit user"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-neon-blue)]" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            className="p-1.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors group"
                            title={u.is_active ? "Deactivate" : "Activate"}
                          >
                            <span
                              className={`block w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                                u.is_active
                                  ? "border-[var(--color-neon-green)] bg-[var(--color-neon-green)]/20 group-hover:bg-[var(--color-bear)]/20 group-hover:border-[var(--color-bear)]"
                                  : "border-[var(--color-bear)] bg-[var(--color-bear)]/20 group-hover:bg-[var(--color-neon-green)]/20 group-hover:border-[var(--color-neon-green)]"
                              }`}
                            />
                          </button>
                          <button
                            onClick={() => setDeletingUser(u)}
                            className="p-1.5 rounded hover:bg-[var(--color-bear)]/10 transition-colors group"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-bear)]" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {usersData && usersData.users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[var(--color-text-muted)]">
                      {search ? "No users match your search" : "No users yet"}
                    </td>
                  </tr>
                )}
                {loadingData && !usersData && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[var(--color-text-muted)] animate-pulse">
                      Loading users...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {usersData && usersData.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border-primary)]">
              <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                Page {usersData.page} of {usersData.pages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)]" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(usersData.pages, p + 1))}
                  disabled={page >= usersData.pages}
                  className="p-1.5 rounded hover:bg-[var(--color-bg-hover)] disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          role={editRole}
          isActive={editActive}
          loading={actionLoading}
          onRoleChange={setEditRole}
          onActiveChange={setEditActive}
          onSave={handleUpdateUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          loading={actionLoading}
          onConfirm={handleDeleteUser}
          onClose={() => setDeletingUser(null)}
        />
      )}
    </div>
  );
}
