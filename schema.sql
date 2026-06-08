-- ==========================================
-- SalesFlow Pro - Database Schema (Supabase)
-- ==========================================
-- ※このスクリプトは Supabase の SQL Editor に貼り付けて「RUN」を実行してください。

-- 1. ユーザー権限テーブル (profiles)
-- Supabaseの標準認証ユーザーと紐づくプロフィール情報です
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  user_id text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('管理者', '営業', '内務')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 案件テーブル (projects)
CREATE TABLE public.projects (
  id text PRIMARY KEY, -- JS側で生成したID (例: p12345678)
  customer text NOT NULL,
  customer_no text,
  quote_no text,
  probability text,
  steps jsonb DEFAULT '[false, false, false, false, false, false]'::jsonb,
  files jsonb DEFAULT '[]'::jsonb,
  chats jsonb DEFAULT '[]'::jsonb,
  sales_rep_id text NOT NULL,
  sales_rep_name text NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 活動履歴テーブル (activities)
CREATE TABLE public.activities (
  id text PRIMARY KEY,
  text text NOT NULL,
  time text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- セキュリティ設定 (RLS: Row Level Security)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 今回は社内利用を想定し、ログイン済みのユーザーならすべての操作を許可するシンプルな設定にします
CREATE POLICY "Enable all access for authenticated users" ON public.profiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON public.projects FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON public.activities FOR ALL USING (auth.role() = 'authenticated');
