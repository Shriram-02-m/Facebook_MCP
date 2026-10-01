export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
}

export interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
}

export interface FacebookComment {
  id: string;
  message: string;
  created_time: string;
  from?: {
    name: string;
    id: string;
  };
}

export interface FacebookInsight {
  name: string;
  period: string;
  title: string;
  description: string;
  values: { value: number; end_time?: string }[];
}

export interface UserTokenMeta {
  obtained_at?: string;
  expires_at?: string;
  scopes?: string[];
}

// Tokens from the two Meta apps are stored in separate slots so the
// Consumer (personal) flow and the Business (Page) flow can never overwrite
// each other.
export interface AccessTokenStore {
  consumer_user_access_token?: string;
  consumer_token_meta?: UserTokenMeta;
  business_user_access_token?: string;
  business_token_meta?: UserTokenMeta;
  page_access_tokens?: Record<string, string>;
}

export type OAuthFlow = 'consumer' | 'business';

export interface UserProfile {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  picture?: { data: { url: string; width?: number; height?: number } };
  short_name?: string;
  link?: string;
  username?: string;
  verified?: boolean;
  updated_time?: string;
  age_range?: { min: number; max?: number };
  birthday?: string;
  gender?: string;
  hometown?: { id: string; name: string };
  location?: { id: string; name: string };
  [key: string]: any;
}

export interface UserPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  updated_time?: string;
  permalink_url?: string;
  post_id?: string;
  full_picture?: string;
  [key: string]: any;
}

export interface UserPhoto {
  id: string;
  name?: string;
  description?: string;
  created_time: string;
  link?: string;
  picture?: string;
  source?: string;
  width?: number;
  height?: number;
  album?: { id: string; name: string };
  images?: { height: number; width: number; source: string }[];
  [key: string]: any;
}

export interface UserVideo {
  id: string;
  title?: string;
  description?: string;
  created_time: string;
  updated_time?: string;
  length?: number;
  permalink_url?: string;
  picture?: string;
  status?: { video_status: string };
  views?: number;
  [key: string]: any;
}

export interface UserLike {
  id: string;
  name: string;
  category?: string;
  created_time?: string;
  fan_count?: number;
  [key: string]: any;
}

export interface UserFriend {
  id: string;
  name: string;
  [key: string]: any;
}
