import axios from 'axios';
import { getUserAccessToken, getPageAccessToken } from '../token-store/store';
import { FacebookPage, FacebookPost, FacebookComment, FacebookInsight } from '../types';

const API_BASE = 'https://graph.facebook.com/v26.0';

async function getClient(pageId?: string) {
  let token: string | undefined;
  if (pageId) {
    token = await getPageAccessToken(pageId);
    if (!token) {
      throw new Error(`No page access token found for page ${pageId}`);
    }
  } else {
    token = await getUserAccessToken();
    if (!token) {
      throw new Error('No user access token found. Please run the facebook_connect tool to authenticate.');
    }
  }

  return axios.create({
    baseURL: API_BASE,
    params: {
      access_token: token,
    },
  });
}

export async function getPages(): Promise<FacebookPage[]> {
  const client = await getClient();
  let allPages: FacebookPage[] = [];
  let nextUrl: string | undefined = undefined;

  // First request with limit 100
  const initialResponse = await client.get('/me/accounts', { params: { limit: 100 } });
  allPages = allPages.concat(initialResponse.data?.data || []);
  nextUrl = initialResponse.data?.paging?.next;

  // Follow pagination cursors for accounts with 100+ pages
  while (nextUrl) {
    const pagedResponse = await axios.get(nextUrl);
    const data = pagedResponse.data?.data || [];
    allPages = allPages.concat(data);
    nextUrl = pagedResponse.data?.paging?.next;
  }

  return allPages;
}


export async function getPage(pageId: string): Promise<FacebookPage> {
  const client = await getClient(pageId);
  const response = await client.get(`/${pageId}`, {
    params: { fields: 'id,name,category,access_token' }
  });
  return response.data;
}

export async function createPost(pageId: string, message: string): Promise<{ id: string }> {
  const client = await getClient(pageId);
  const response = await client.post(`/${pageId}/feed`, { message });
  return response.data;
}

export async function getPosts(pageId: string, limit: number = 10): Promise<FacebookPost[]> {
  const client = await getClient(pageId);
  const response = await client.get(`/${pageId}/posts`, {
    params: { limit, fields: 'id,message,created_time' }
  });
  return response.data.data;
}

export async function getComments(postId: string, limit: number = 10, pageId?: string): Promise<FacebookComment[]> {
  const resolvedPageId = pageId || (postId.includes('_') ? postId.split('_')[0] : undefined);
  const client = await getClient(resolvedPageId);
  const response = await client.get(`/${postId}/comments`, {
    params: { limit, fields: 'id,message,created_time,from' }
  });
  return response.data.data;
}


export async function createComment(pageId: string, postId: string, message: string): Promise<{ id: string }> {
  const client = await getClient(pageId);
  const response = await client.post(`/${postId}/comments`, { message });
  return response.data;
}

export async function replyToComment(pageId: string, commentId: string, message: string): Promise<{ id: string }> {
  const client = await getClient(pageId);
  const response = await client.post(`/${commentId}/comments`, { message });
  return response.data;
}


export async function getInsights(pageId: string, metric: string): Promise<FacebookInsight[]> {
  const client = await getClient(pageId);
  const response = await client.get(`/${pageId}/insights`, {
    params: { metric }
  });
  return response.data.data;
}

export async function updatePost(pageId: string, postId: string, message: string): Promise<{ success: boolean }> {
  const client = await getClient(pageId);
  const response = await client.post(`/${postId}`, { message });
  return response.data;
}

export async function createPhotoPost(
  pageId: string,
  options: { imagePath?: string; imageUrl?: string; caption?: string }
): Promise<{ id: string; post_id?: string }> {
  const token = await getPageAccessToken(pageId);
  if (!token) {
    throw new Error(`No page access token found for page ${pageId}`);
  }

  const formData = new FormData();
  if (options.caption) {
    formData.append('caption', options.caption);
  }

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
  return response.data;
}

export async function deletePost(pageId: string, postId: string): Promise<{ success: boolean }> {
  const client = await getClient(pageId);
  const response = await client.delete(`/${postId}`);
  return response.data;
}

export async function likePost(pageId: string, objectId: string): Promise<{ success: boolean }> {
  const client = await getClient(pageId);
  const response = await client.post(`/${objectId}/likes`);
  return response.data;
}

export async function unlikePost(pageId: string, objectId: string): Promise<{ success: boolean }> {
  const client = await getClient(pageId);
  const response = await client.delete(`/${objectId}/likes`);
  return response.data;
}



