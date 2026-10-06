"use client";

import { useEffect, useState } from "react";
import type React from "react";

import {
  clearAccountUserId,
  loadCurrentAccount,
  loginAccount,
  registerAccount,
} from "@/lib/account";
import { api } from "@/lib/api";
import {
  gradeLabel,
  gradeOptions,
  levelOptions,
} from "@/lib/student-options";
import type { AccountPayload, AccountRole, TeacherGroup } from "@/lib/types";

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    student: "学生",
    parent: "家长",
    teacher: "老师",
    admin: "管理员",
  };
  return labels[role] || role;
}

function AccountShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <section className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-teal-700">English Step</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">{title}</h1>
          </div>
          <a
            href="/"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/50"
          >
            返回学习首页
          </a>
        </div>
        {children}
      </section>
    </main>
  );
}

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await loginAccount(username, password);
      window.location.href = "/account";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountShell title="登录账号">
      <form
        onSubmit={submit}
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        {error ? (
          <p className="mb-4 rounded-md bg-coral-soft p-3 text-sm text-coral-strong">
            {error}
          </p>
        ) : null}
        <label className="block text-sm font-semibold">
          账号
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          密码
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "登录中" : "登录"}
        </button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          还没有账号？{" "}
          <a className="font-semibold text-primary" href="/register">
            注册一个
          </a>
        </p>
      </form>
    </AccountShell>
  );
}

export function RegisterPage() {
  const [role, setRole] = useState<AccountRole>("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number>(7);
  const [level, setLevel] = useState("low");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await registerAccount({ username, password, name, role, grade, level });
      window.location.href = "/account";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "注册失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountShell title="注册账号">
      <form
        onSubmit={submit}
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        {error ? (
          <p className="mb-4 rounded-md bg-coral-soft p-3 text-sm text-coral-strong">
            {error}
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          {(["student", "parent", "teacher"] as AccountRole[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRole(item)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                role === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              {roleLabel(item)}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-semibold">
          登录账号
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          密码
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          显示姓名
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        {role === "student" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              年级
              <select
                value={grade}
                onChange={(event) => setGrade(Number(event.target.value))}
                required
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
              >
                {gradeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              基础水平
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                required
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
              >
                {levelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "注册中" : "注册并进入"}
        </button>
      </form>
    </AccountShell>
  );
}

export function AccountPage() {
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [error, setError] = useState("");
  const [parentUserId, setParentUserId] = useState("");
  const [studentUserId, setStudentUserId] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDetail, setGroupDetail] = useState<{
    group: TeacherGroup;
    students: unknown[];
  } | null>(null);

  async function refresh() {
    try {
      const payload = await loadCurrentAccount();
      setAccount(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号加载失败。");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function linkParent() {
    if (!account?.student) return;
    setError("");
    try {
      const payload = await api<{ student: AccountPayload }>(
        "/api/parent-student-links",
        {
        method: "POST",
        body: JSON.stringify({
          studentUserId: account.student.id,
          parentUserId,
        }),
        },
      );
      setAccount(payload.student as AccountPayload);
      setParentUserId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "绑定失败。");
    }
  }

  async function bindChild() {
    if (!account?.user) return;
    setError("");
    try {
      const response = await api<{ parent: AccountPayload }>(
        "/api/parent-student-links",
        {
          method: "POST",
          body: JSON.stringify({
            studentUserId,
            parentUserId: account.user.id,
          }),
        },
      );
      setAccount(response.parent);
      setStudentUserId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "绑定失败。");
    }
  }

  async function createGroup() {
    if (!account?.user) return;
    setError("");
    try {
      const response = await api<{ groups: TeacherGroup[] }>("/api/teacher-groups", {
        method: "POST",
        body: JSON.stringify({
          teacherUserId: account.user.id,
          name: groupName,
        }),
      });
      setAccount({ ...account, groups: response.groups });
      setGroupName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建分组失败。");
    }
  }

  async function joinGroup() {
    if (!account?.user) return;
    setError("");
    try {
      const response = await api<{ groups: TeacherGroup[] }>("/api/group-members/join", {
        method: "POST",
        body: JSON.stringify({
          studentUserId: account.user.id,
          shareCode,
        }),
      });
      setAccount({ ...account, groups: response.groups });
      setShareCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入分组失败。");
    }
  }

  async function openGroup(groupId: string) {
    if (!account?.user) return;
    const response = await api<{ group: TeacherGroup; students: unknown[] }>(
      `/api/teacher-groups/${groupId}?teacherUserId=${account.user.id}`,
    );
    setGroupDetail(response);
  }

  if (!account) {
    return (
      <AccountShell title="账号中心">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            {error || "还没有登录账号。"}
          </p>
          <div className="mt-4 flex gap-3">
            <a className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/login">
              登录
            </a>
            <a className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold" href="/register">
              注册
            </a>
          </div>
        </section>
      </AccountShell>
    );
  }

  return (
    <AccountShell title="账号中心">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        {error ? (
          <p className="mb-4 rounded-md bg-coral-soft p-3 text-sm text-coral-strong">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">账号 ID</p>
            <p className="mt-1 break-all font-mono text-sm">{account.user.id}</p>
            <h2 className="mt-3 text-2xl font-black">
              {account.user.name} · {roleLabel(account.user.role)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              clearAccountUserId();
              window.location.href = "/login";
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold"
          >
            退出登录
          </button>
        </div>
      </section>

      {account.user.role === "student" ? (
        <section className="mt-5 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-bold">学生关联</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={parentUserId}
              onChange={(event) => setParentUserId(event.target.value)}
              placeholder="输入家长账号 ID"
              className="rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={linkParent}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              绑定家长
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={shareCode}
              onChange={(event) => setShareCode(event.target.value)}
              placeholder="输入老师分组分享 ID"
              className="rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={joinGroup}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              加入分组
            </button>
          </div>
          <div className="mt-4">
            <h3 className="font-bold">已加入分组</h3>
            <div className="mt-2 space-y-2">
              {(account.groups || []).map((group) => (
                <p key={group.id} className="rounded-md bg-background p-3 text-sm">
                  {group.name} · 老师：{group.teacherName || "未命名"}
                </p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {account.user.role === "parent" ? (
        <section className="mt-5 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-bold">绑定孩子</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={studentUserId}
              onChange={(event) => setStudentUserId(event.target.value)}
              placeholder="输入学生账号 ID"
              className="rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={bindChild}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              绑定孩子
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {(account.children || []).map((child) => (
              <p key={child.user.id} className="rounded-md bg-background p-3 text-sm">
                {child.user.name} · {gradeLabel(child.profile?.grade)} · ID：
                {child.user.id}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {account.user.role === "teacher" ? (
        <section className="mt-5 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-bold">老师分组</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="例如：2026 初一英语基础班"
              className="rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={createGroup}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              创建分组
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {(account.groups || []).map((group) => (
              <div
                key={group.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-background p-3 text-sm"
              >
                <span>
                  {group.name} · 分享 ID：<strong>{group.shareCode}</strong> · 学生{" "}
                  {group.studentCount || 0} 人
                </span>
                <button
                  type="button"
                  onClick={() => openGroup(group.id)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold"
                >
                  查看学生
                </button>
              </div>
            ))}
          </div>
          {groupDetail ? (
            <div className="mt-5 rounded-md border border-border bg-background p-4">
              <h3 className="font-bold">{groupDetail.group.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                当前学生数：{groupDetail.students.length}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </AccountShell>
  );
}
