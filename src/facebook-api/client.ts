import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import {
  getConsumerUserAccessToken,
  getBusinessUserAccessToken,
  getPageAccessToken,
} from '../token-store/store';
import {
  FacebookPage, FacebookPost, FacebookComment, FacebookInsight,
  UserProfile, UserPost, UserPhoto, UserVideo, UserLike, UserFriend,
} from '../types';

dotenv.config();

const API_BASE = 'https://graph.facebook.com/v26.0';

// ── Explicit token selection ────────────────────────────────────────────────
// Personal-account   → getConsumerClient()    (Consumer App user token)
// List managed pages → getBusinessUserClient()(Business App user token)
// Page operations    → getPageClient(pageId)  (Page access token)
// There is deliberately no implicit getClient() fallback; every caller states
// which identity it acts as.

async function getConsumerClient(): Promise<AxiosInstance> {
  const token = await getConsumerUserAccessToken();
  if (!token) {
    throw new Error(
      'No CONSUMER user access token found. Run facebook_connect with flow=consumer first.'
    );
  }
  return axios.create({ baseURL: API_BASE, params: { access_token: token } });
}

async function getBusinessUserClient(): Promise<AxiosInstance> {
  const token = await getBusinessUserAccessToken();
  if (!token) {
    throw new Error(
      'No BUSINESS user access token found. Run facebook_connect with flow=business first.'
    );
  }
  return axios.create({ baseURL: API_BASE, params: { access_token: token } });
}

async function getPageClient(pageId: string): Promise<AxiosInstance> {
  const token = await getPageAccessToken(pageId);
  if (!token) {
    throw new Error(
      `No page access token stored for page ${pageId}. ` +
      'Run facebook_connect flow=business, then facebook_get_pages to cache it.'
    );
  }
  return axios.create({ baseURL: API_BASE, params: { access_token: token } });
}

function unwrapGraphError(err: any): string {
  const e = err?.response?.data?.error;
  if (!e) return err?.message || 'Unknown Graph API error';
  return `(#${e.code ?? '?'}) ${e.message}`;
}

// ── Business user token → Pages list (and caches page tokens) ───────────────

export async function getPages(): Promise<FacebookPage[]> {
  const client = await getBusinessUserClient();
  let allPages: FacebookPage[] = [];
  let nextUrl: string | undefined;

  const initialResponse = await client.get('/me/accounts', { params: { limit: 100 } });
  allPages = allPages.concat(initialResponse.data?.data || []);
  nextUrl = initialResponse.data?.paging?.next;

  while (nextUrl) {
    const pagedResponse = await axios.get(nextUrl);
    allPages = allPages.concat(pagedResponse.data?.data || []);
    nextUrl = pagedResponse.data?.paging?.next;
  }
  return allPages;
}

// ── Page operations (Page access token) ─────────────────────────────────────

export async function getPage(pageId: string): Promise<FacebookPage> {
  const client = await getPageClient(pageId);
  const response = await client.get(`/${pageId}`, {
    params: { fields: 'id,name,category,access_token' }
  });
  return response.data;
}

export async function createPost(pageId: string, message: string): Promise<{ id: string }> {
  const client = await getPageClient(pageId);
  const response = await client.post(`/${pageId}/feed`, { message });
  return response.data;
}

export async function getPosts(pageId: string, limit: number = 10): Promise<FacebookPost[]> {
  const client = await getPageClient(pageId);
  const response = await client.get(`/${pageId}/posts`, {
    params: { limit, fields: 'id,message,created_time' }
  });
  return response.data.data;
}

export async function getComments(postId: string, limit: number = 10, pageId?: string): Promise<FacebookComment[]> {
  // Prefer the Page token (we manage this Page); fall back to the consumer
  // token for reading comments on a post the user can see.
  let client: AxiosInstance;
  try {
    if (!pageId && postId.includes('_')) pageId = postId.split('_')[0];
    client = await getPageClient(pageId!);
  } catch {
    client = await getConsumerClient();
  }
  const response = await client.get(`/${postId}/comments`, {
    params: { limit, fields: 'id,message,created_time,from' }
  });
  return response.data.data;
}

export async function createComment(pageId: string, postId: string, message: string): Promise<{ id: string }> {
  const client = await getPageClient(pageId);
  const response = await client.post(`/${postId}/comments`, { message });
  return response.data;
}

export async function replyToComment(pageId: string, commentId: string, message: string): Promise<{ id: string }> {
  const client = await getPageClient(pageId);
  const response = await client.post(`/${commentId}/comments`, { message });
  return response.data;
}

export async function getInsights(pageId: string, metric: string): Promise<FacebookInsight[]> {
  const client = await getPageClient(pageId);
  const response = await client.get(`/${pageId}/insights`, { params: { metric } });
  return response.data.data;
}

export async function updatePost(pageId: string, postId: string, message: string): Promise<{ success: boolean }> {
  const client = await getPageClient(pageId);
  const response = await client.post(`/${postId}`, { message });
  return response.data;
}

export async function createPhotoPost(
  pageId: string,
  options: { imagePath?: string; imageUrl?: string; caption?: string; publishToFeed?: boolean }
): Promise<{ id: string; post_id?: string; published: boolean; warning?: string }> {
  const token = await getPageAccessToken(pageId);
  if (!token) {
    throw new Error(`No page access token found for page ${pageId}`);
  }

  // Publish to the Page feed is the whole point, so request it explicitly
  // instead of relying on Meta's undocumented default behavior.
  const publishToFeed = options.publishToFeed !== false;

  const formData = new FormData();
  if (options.caption) formData.append('caption', options.caption);
  formData.append('published', publishToFeed ? 'true' : 'false');

  if (options.imageUrl) {
    formData.append('url', options.imageUrl);
  } else if (options.imagePath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fileBuffer = await fs.readFile(options.imagePath);
    formData.append('source', new Blob([fileBuffer]), path.basename(options.imagePath));
  } else {
    throw new Error('Either imagePath or imageUrl must be provided to create a photo post.');
  }

  const response = await axios.post(`${API_BASE}/${pageId}/photos`, formData, {
    params: { access_token: token },
  });
  const result = response.data;

  if (publishToFeed) {
    // Proof of publication: a published photos/upload returns post_id.
    // If Meta omitted it, fail loudly rather than silently library-only.
    if (!result.post_id) {
      return {
        ...result,
        published: false,
        warning: 'Upload succeeded but Graph returned no post_id — the photo may only be in the Page photo library. Verify at /' + pageId + '/photos?access_token=... before assuming it is live.',
      };
    }
    // Verify the story is actually visible in the Page feed.
    try {
      await axios.get(`${API_BASE}/${result.post_id}`, {
        params: { access_token: token, fields: 'id,created_time' },
      });
    } catch (e: any) {
      return {
        ...result,
        published: true,
        warning: `post_id returned but feed read-back failed (${e?.response?.data?.error?.message || e.message}). The post exists but was not immediately visible.`,
      };
    }
  }

  return { ...result, published: publishToFeed };
}

export async function deletePost(pageId: string, postId: string): Promise<{ success: boolean }> {
  const client = await getPageClient(pageId);
  const response = await client.delete(`/${postId}`);
  return response.data;
}

export async function likePost(pageId: string, objectId: string): Promise<{ success: boolean }> {
  const client = await getPageClient(pageId);
  const response = await client.post(`/${objectId}/likes`);
  return response.data;
}

export async function unlikePost(pageId: string, objectId: string): Promise<{ success: boolean }> {
  const client = await getPageClient(pageId);
  const response = await client.delete(`/${objectId}/likes`);
  return response.data;
}

// ── Page images (cover / profile) — Page access token ────────────────────────

export async function getPageCover(pageId: string): Promise<Record<string, any>> {
  const client = await getPageClient(pageId);
  const response = await client.get(`/${pageId}`, {
    params: { fields: 'cover{id,cover_id,source,offset_x,offset_y},name' },
  });
  return response.data;
}

export async function uploadPagePhoto(
  pageId: string,
  source: { imagePath?: string; imageUrl?: string },
  caption?: string
): Promise<{ id: string; post_id?: string }> {
  const token = await getPageAccessToken(pageId);
  if (!token) throw new Error(`No page access token found for page ${pageId}`);

  const form = new FormData();
  if (caption) form.append('caption', caption);
  if (source.imageUrl) {
    form.append('url', source.imageUrl);
    form.append('published', 'false');
  } else if (source.imagePath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const buf = await fs.readFile(source.imagePath);
    form.append('source', new Blob([buf]), path.basename(source.imagePath));
    form.append('published', 'false');
  } else {
    throw new Error('uploadPagePhoto needs imagePath or imageUrl');
  }
  const res = await axios.post(`${API_BASE}/${pageId}/photos`, form, {
    params: { access_token: token },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return res.data;
}

export async function setPageCover(
  pageId: string,
  opts: { photoId?: string; imagePath?: string; imageUrl?: string }
): Promise<{ success: boolean; note: string }> {
  const token = await getPageAccessToken(pageId);
  if (!token) throw new Error(`No page access token found for page ${pageId}`);

  let photoId = opts.photoId;
  if (!photoId) {
    const up = await uploadPagePhoto(pageId, { imagePath: opts.imagePath, imageUrl: opts.imageUrl });
    photoId = up.id;
  }
  const res = await axios.post(`${API_BASE}/${pageId}`, null, {
    params: { access_token: token, cover: photoId },
  });
  return {
    success: !!res.data.success,
    note: 'Cover set via /{page}?cover=<photo_id>. Facebook copies the image into the Cover Photos album; the original upload object may later stop resolving, which is expected.',
  };
}

export async function setPagePicture(
  pageId: string,
  opts: { photoId?: string; imagePath?: string; imageUrl?: string }
): Promise<{ success: boolean; note: string }> {
  const token = await getPageAccessToken(pageId);
  if (!token) throw new Error(`No page access token found for page ${pageId}`);

  let photoId = opts.photoId;
  if (!photoId) {
    const up = await uploadPagePhoto(pageId, { imagePath: opts.imagePath, imageUrl: opts.imageUrl });
    photoId = up.id;
  }
  const res = await axios.post(`${API_BASE}/${pageId}/picture`, null, {
    params: { access_token: token, photo: photoId, suppress_stories: true },
  });
  return { success: !!res.data.success, note: 'Profile picture set via /{page}/picture photo=<id> (pages_manage_metadata required).' };
}

// ── Bulk engagement (Page tokens) ────────────────────────────────────────────

export interface PagePostLite {
  id: string;
  created_time: string;
  message?: string;
}

export async function listPagePostIds(pageId: string, limit = 50): Promise<PagePostLite[]> {
  const client = await getPageClient(pageId);
  const all: PagePostLite[] = [];

  const initial = await client.get(`/${pageId}/posts`, { params: { limit, fields: 'id,created_time,message' } });
  all.push(...(initial.data?.data || []));
  let nextUrl: string | undefined = initial.data?.paging?.next;

  while (nextUrl) {
    const paged: any = await axios.get(nextUrl);
    all.push(...(paged.data?.data || []));
    nextUrl = paged.data?.paging?.next;
  }
  return all;
}

export async function bulkLikePosts(pageId: string, postIds: string[]): Promise<Array<{ id: string; ok: boolean; error?: string }>> {
  const client = await getPageClient(pageId);
  const out: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of postIds) {
    try {
      await client.post(`/${id}/likes`);
      out.push({ id, ok: true });
    } catch (e: any) {
      out.push({ id, ok: false, error: e?.response?.data?.error?.message || e.message });
    }
  }
  return out;
}

export async function bulkCommentPosts(
  pageId: string,
  postIds: string[],
  message: string
): Promise<Array<{ id: string; ok: boolean; commentId?: string; error?: string }>> {
  const client = await getPageClient(pageId);
  const out: Array<{ id: string; ok: boolean; commentId?: string; error?: string }> = [];
  for (const id of postIds) {
    try {
      // Skip if we (the page) already posted this exact comment.
      const existing = await client.get(`/${id}/comments`, { params: { limit: 50, fields: 'message,from' } });
      const dupe = (existing.data.data || []).some(
        (c: any) => c.message === message && c.from?.id === pageId
      );
      if (dupe) { out.push({ id, ok: true, commentId: 'skipped(duplicate)', error: undefined }); continue; }
      const r: any = await client.post(`/${id}/comments`, { message });
      out.push({ id, ok: true, commentId: r.data?.id });
    } catch (e: any) {
      out.push({ id, ok: false, error: e?.response?.data?.error?.message || e.message });
    }
  }
  return out;
}

// ── Personal-account operations (Consumer user token) ───────────────────────

export async function getMyProfile(): Promise<UserProfile> {
  const client = await getConsumerClient();
  const response = await client.get('/me', {
    params: {
      fields: 'id,name,first_name,last_name,short_name,email,link,verified,updated_time,picture.width(200).height(200)',
    },
  });
  return response.data;
}

export async function getMyExtendedProfile(): Promise<Record<string, any>> {
  const client = await getConsumerClient();
  const response = await client.get('/me', {
    params: {
      fields: 'id,name,age_range,birthday,gender,hometown,location,locale,timezone,updated_time',
    },
  });
  return response.data;
}

export async function getMyPosts(limit: number = 25): Promise<UserPost[]> {
  const client = await getConsumerClient();
  try {
    const response = await client.get('/me/posts', {
      params: {
        limit,
        fields: 'id,message,story,created_time,updated_time,permalink_url,post_id,full_picture',
      },
    });
    return response.data.data || [];
  } catch (err: any) {
    throw new Error(unwrapGraphError(err), { cause: err });
  }
}

export async function getMyPhotos(limit: number = 25): Promise<UserPhoto[]> {
  const client = await getConsumerClient();
  try {
    const response = await client.get('/me/photos', {
      params: { limit, fields: 'id,name,description,created_time,link,picture,source,width,height,album{id,name}' },
    });
    return response.data.data || [];
  } catch (err: any) {
    throw new Error(unwrapGraphError(err), { cause: err });
  }
}

export async function getMyVideos(limit: number = 25): Promise<UserVideo[]> {
  const client = await getConsumerClient();
  try {
    const response = await client.get('/me/videos', {
      params: { limit, fields: 'id,title,description,created_time,updated_time,length,permalink_url,picture,views,status' },
    });
    return response.data.data || [];
  } catch (err: any) {
    throw new Error(unwrapGraphError(err), { cause: err });
  }
}

export async function getMyLikes(limit: number = 25): Promise<UserLike[]> {
  const client = await getConsumerClient();
  try {
    const response = await client.get('/me/likes', {
      params: { limit, fields: 'id,name,category,created_time,fan_count' },
    });
    return response.data.data || [];
  } catch (err: any) {
    throw new Error(unwrapGraphError(err), { cause: err });
  }
}

export async function getMyFriends(limit: number = 25): Promise<UserFriend[]> {
  const client = await getConsumerClient();
  try {
    const response = await client.get('/me/friends', {
      params: { limit, fields: 'id,name' },
    });
    return response.data.data || [];
  } catch (err: any) {
    throw new Error(unwrapGraphError(err), { cause: err });
  }
}

/**
 * Inspect a stored user token via /debug_token using the SAME app that issued
 * it (App Token = {appId}|{appSecret}). Never returns the token value itself.
 */
export async function debugUserToken(
  flow: 'consumer' | 'business'
): Promise<Record<string, any>> {
  const token =
    flow === 'consumer'
      ? await getConsumerUserAccessToken()
      : await getBusinessUserAccessToken();
  if (!token) {
    throw new Error(
      `No ${flow} user access token found. Run facebook_connect with flow=${flow}.`
    );
  }

  const envNames =
    flow === 'consumer'
      ? { id: 'CONSUMER_APP_ID', secret: 'CONSUMER_APP_SECRET' }
      : { id: 'BUSINESS_APP_ID', secret: 'BUSINESS_APP_SECRET' };
  const appId = process.env[envNames.id];
  const appSecret = process.env[envNames.secret];
  if (!appId || !appSecret) {
    throw new Error(`${envNames.id} / ${envNames.secret} are not configured, so this token cannot be inspected.`);
  }

  // POST form-body so the app secret ({appId}|{appSecret}) never appears in
  // URLs, proxy logs, or browser history.
  const response = await axios.post(`${API_BASE}/debug_token`, new URLSearchParams({
    input_token: token,
    access_token: `${appId}|${appSecret}`,
  }));
  const d = response.data.data || {};
  return {
    flow,
    app_id: d.app_id,
    type: d.type,
    token_type: d.token_type,
    valid: d.is_valid,
    scopes: d.scopes,
    expires_at: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
  };
}

/**
 * Build a Facebook Share Dialog URL for personal timeline sharing.
 * The Graph API cannot post as a user (publish_actions was removed).
 */
export function buildShareDialogUrl(link: string, quote?: string): string {
  const appId = process.env.CONSUMER_APP_ID;
  if (!appId) {
    throw new Error('CONSUMER_APP_ID is not configured, so the Share Dialog URL cannot be built.');
  }
  const params = new URLSearchParams({ app_id: appId, href: link });
  if (quote) params.set('quote', quote);
  return `https://www.facebook.com/dialog/share?${params.toString()}`;
}
