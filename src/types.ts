export interface Env {
  DB: D1Database;
  PROXY_ROUTES: KVNamespace;
  ASSETS: Fetcher;

  // 环境变量与 Secrets
  DOMAIN?: string;
  CF_ZONE_ID?: string;
  CF_API_TOKEN?: string;
  ADMIN_TOKEN?: string;
}

export type SubdomainStatus =
  | 'SOFT_LOCKED'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'REJECTED'
  | 'REVOKED';

export interface SubdomainRow {
  id: number;
  prefix: string;
  status: SubdomainStatus;
  platform: string;
  origin_url: string;
  cf_record_id: string | null;
  title: string;
  category: 'tool' | 'creative' | 'game';
  stack: string;
  tagline: string;
  author_name: string;
  xhs_comment_raw: string | null;
  theme_bg: string;
  is_dark: number;
  is_featured: number;
  show_in_gallery: number;
  client_token: string | null;
  client_ip_hash: string | null;
  lock_expires_at: string | null;
  status_note: string | null;
  fail_streak: number;
  last_http_status: number | null;
  approved_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProxyRouteValue {
  origin: string;
  status: SubdomainStatus;
  title?: string;
  author?: string;
  updated_at?: string;
}
