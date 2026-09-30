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

export interface AccessTokenStore {
  user_access_token?: string;
  page_access_tokens?: Record<string, string>;
}
