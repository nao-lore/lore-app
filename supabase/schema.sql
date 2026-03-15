-- Lore Database Schema for Supabase
-- Run this in the Supabase SQL editor to set up tables

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Users (handled by Supabase Auth, but add profile table)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  ui_lang text default 'en',
  output_lang text default 'en',
  theme text default 'system',
  provider text default 'gemini',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Projects
create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  pinned boolean default false,
  color text,
  icon text,
  created_at timestamptz default now(),
  trashed_at timestamptz
);

-- Logs
create table public.logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default '',
  output_mode text not null default 'handoff',
  tags text[] default '{}',
  -- Worklog fields
  today jsonb default '[]',
  decisions jsonb default '[]',
  todo jsonb default '[]',
  related_projects jsonb default '[]',
  -- Handoff fields
  current_status jsonb default '[]',
  completed jsonb default '[]',
  next_actions jsonb default '[]',
  next_action_items jsonb default '[]',
  action_backlog jsonb default '[]',
  blockers jsonb default '[]',
  constraints jsonb default '[]',
  decision_rationales jsonb default '[]',
  resume_context jsonb default '[]',
  resume_checklist jsonb default '[]',
  handoff_meta jsonb,
  checked_actions jsonb default '[]',
  -- Metadata
  source_reference jsonb,
  memo text,
  workload_level text,
  pinned boolean default false,
  related_log_ids uuid[] default '{}',
  classification_confidence real,
  suggested_project_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz,
  imported_at timestamptz,
  trashed_at timestamptz
);

-- Todos
create table public.todos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  log_id uuid references public.logs(id) on delete set null,
  text text not null,
  done boolean default false,
  priority text default 'medium',
  tag text,
  due_date text,
  pinned boolean default false,
  sort_order real default 0,
  archived_at timestamptz,
  snoozed_until text,
  created_at timestamptz default now(),
  trashed_at timestamptz
);

-- Master Notes (1 per project)
create table public.master_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null unique,
  overview text default '',
  current_status text default '',
  decisions jsonb default '[]',
  open_issues jsonb default '[]',
  next_actions jsonb default '[]',
  related_log_ids uuid[] default '{}',
  updated_at timestamptz default now()
);

-- Log Summaries (cached AI analysis)
create table public.log_summaries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  log_id uuid references public.logs(id) on delete cascade not null unique,
  summary text,
  decisions jsonb default '[]',
  issues jsonb default '[]',
  actions jsonb default '[]',
  cached_at timestamptz default now()
);

-- Weekly Reports
create table public.weekly_reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade,
  week_start text not null,
  week_end text not null,
  summary text,
  achievements jsonb default '[]',
  decisions jsonb default '[]',
  open_items jsonb default '[]',
  completed_todos jsonb default '[]',
  pending_todos jsonb default '[]',
  next_week jsonb default '[]',
  stats jsonb,
  generated_at timestamptz default now()
);

-- Knowledge Bases
create table public.knowledge_bases (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null unique,
  patterns jsonb default '[]',
  best_practices jsonb default '[]',
  common_decisions jsonb default '[]',
  generated_at timestamptz default now(),
  log_count integer default 0
);

-- AI Contexts (per project)
create table public.ai_contexts (
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  content text default '',
  updated_at timestamptz default now(),
  primary key (user_id, project_id)
);

-- Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.logs enable row level security;
alter table public.todos enable row level security;
alter table public.master_notes enable row level security;
alter table public.log_summaries enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.knowledge_bases enable row level security;
alter table public.ai_contexts enable row level security;

-- RLS Policies: users can only access their own data
create policy "Users can view own data" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own data" on public.profiles for update using (auth.uid() = id);

create policy "Users can CRUD own projects" on public.projects for all using (auth.uid() = user_id);
create policy "Users can CRUD own logs" on public.logs for all using (auth.uid() = user_id);
create policy "Users can CRUD own todos" on public.todos for all using (auth.uid() = user_id);
create policy "Users can CRUD own master_notes" on public.master_notes for all using (auth.uid() = user_id);
create policy "Users can CRUD own log_summaries" on public.log_summaries for all using (auth.uid() = user_id);
create policy "Users can CRUD own weekly_reports" on public.weekly_reports for all using (auth.uid() = user_id);
create policy "Users can CRUD own knowledge_bases" on public.knowledge_bases for all using (auth.uid() = user_id);
create policy "Users can CRUD own ai_contexts" on public.ai_contexts for all using (auth.uid() = user_id);

-- Indexes for common queries
create index idx_logs_user_project on public.logs(user_id, project_id);
create index idx_logs_user_created on public.logs(user_id, created_at desc);
create index idx_todos_user on public.todos(user_id);
create index idx_todos_log on public.todos(log_id);
create index idx_projects_user on public.projects(user_id);
