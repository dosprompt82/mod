import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useNavigate } from "react-router-dom";
import { BookOpen, FilePen, Gavel, Home, Monitor, Moon, Plus, Settings, Sun, Zap } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { applyTheme, currentTheme, type Theme } from "../lib/theme";
import { useToast } from "./useToast";

const nav = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/drafts", label: "Drafts", icon: FilePen },
  { to: "/decisions", label: "Decisions", icon: Gavel },
];

const dot: Record<string, string> = { active: "bg-accent", waiting: "bg-warn", completed: "bg-ok", archived: "bg-faint" };

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["workspaces", "recent"], queryFn: () => api.workspaces("open", 8), refetchInterval: 15000 });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30000 });
  const [theme, setTheme] = useState<Theme>(currentTheme());

  const newWorkspace = async () => {
    try {
      const ws = await api.createWorkspace();
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
      onNavigate?.();
      navigate(`/w/${ws.id}`);
    } catch {
      toast("Couldn't create a workspace.", "error");
    }
  };
  const cycleTheme = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    applyTheme(next);
    void api.updateSettings({ theme: next }).catch(() => undefined);
  };
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${isActive ? "bg-surface font-medium text-ink shadow-card" : "text-muted hover:bg-surface/70 hover:text-ink"}`;

  return (
    <nav className="flex h-full flex-col gap-1 px-3 py-4" aria-label="Main">
      <div className="mb-4 flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22324d] text-[#f4d58d]"><Zap className="h-4 w-4" fill="currentColor" /></span>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">Personal Superpower</div>
          <div className="text-2xs text-muted">Your intelligence, amplified.</div>
        </div>
      </div>
      <NavLink to="/" end className={link} onClick={onNavigate}><Home className="h-4 w-4" /> Home</NavLink>
      <button className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted hover:bg-surface/70 hover:text-ink" onClick={newWorkspace}>
        <Plus className="h-4 w-4" /> New workspace
      </button>
      <div className="mt-4 px-2.5 eyebrow">Recent workspaces</div>
      <div className="mb-3 mt-1 space-y-0.5">
        {data?.workspaces.length ? data.workspaces.map((w) => (
          <NavLink key={w.id} to={`/w/${w.id}`} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-2 truncate rounded-md px-2.5 py-1 text-[0.82rem] ${isActive ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-surface/70 hover:text-ink"}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[w.status]}`} aria-label={w.status} />
            <span className="truncate">{w.title}</span>
          </NavLink>
        )) : <p className="px-2.5 py-1 text-xs text-faint">None yet</p>}
      </div>
      {nav.slice(1).map((n) => (
        <NavLink key={n.to} to={n.to} className={link} onClick={onNavigate}><n.icon className="h-4 w-4" /> {n.label}</NavLink>
      ))}
      <NavLink to="/settings" className={link} onClick={onNavigate}><Settings className="h-4 w-4" /> Settings</NavLink>
      <div className="mt-auto space-y-2 px-1 pt-4">
        <NavLink to="/settings" onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface/70" data-testid="ai-status">
          <span className={`h-2 w-2 rounded-full ${health?.provider === "mock" ? "bg-warn" : health?.ai_configured ? "bg-ok" : "bg-danger"}`} />
          {health?.provider === "mock" ? "Offline mock AI" : health?.ai_configured ? health.model : "AI not configured"}
        </NavLink>
        <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface/70" onClick={cycleTheme} aria-label={`Theme: ${theme}`}>
          <ThemeIcon className="h-3.5 w-3.5" /> <span>Theme: <span className="capitalize">{theme}</span></span>
        </button>
      </div>
    </nav>
  );
}
