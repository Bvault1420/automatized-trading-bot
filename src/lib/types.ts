export type GameVisibility = "public" | "unlisted" | "private";
export type GameStatus = "draft" | "published" | "removed";
export type ReportTarget = "game" | "comment" | "user";
export type ReportStatus = "open" | "resolved" | "dismissed";
export type NotificationType = "like" | "comment" | "follow" | "remix";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  website: string | null;
  is_admin: boolean;
  is_banned: boolean;
  follower_count: number;
  following_count: number;
  accepted_terms_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: string;
  author_id: string;
  title: string;
  description: string;
  html: string;
  thumbnail_url: string | null;
  tags: string[];
  visibility: GameVisibility;
  status: GameStatus;
  remix_of: string | null;
  allow_remix: boolean;
  like_count: number;
  comment_count: number;
  play_count: number;
  created_at: string;
  updated_at: string;
}

/** Zeile der View `game_cards` bzw. der Feed-RPCs. */
export interface GameCard {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  tags: string[];
  visibility: GameVisibility;
  status: GameStatus;
  like_count: number;
  comment_count: number;
  play_count: number;
  remix_of: string | null;
  allow_remix: boolean;
  created_at: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
  author_banned: boolean;
  liked_by_me: boolean;
  following_author: boolean;
}

export interface Comment {
  id: string;
  game_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "username" | "display_name" | "avatar_url"> | null;
}

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: NotificationType;
  game_id: string | null;
  comment_id: string | null;
  read: boolean;
  created_at: string;
  actor?: Pick<Profile, "username" | "display_name" | "avatar_url"> | null;
  game?: Pick<Game, "id" | "title" | "thumbnail_url"> | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: string;
  details: string;
  status: ReportStatus;
  resolved_by: string | null;
  created_at: string;
  reporter?: Pick<Profile, "username"> | null;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };
