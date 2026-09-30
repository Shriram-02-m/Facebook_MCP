import { getAuthUrl, startOAuthServer } from '../auth/oauth';
import * as api from '../facebook-api/client';
import { savePageAccessToken } from '../token-store/store';

export const TOOL_DEFINITIONS = [
  {
    name: 'facebook_connect',
    description: 'Initialize the Facebook authorization flow. Returns a URL that the user needs to open in their browser to authorize the app.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'facebook_get_pages',
    description: 'Return Facebook Pages that the authenticated user is authorized to manage. Automatically caches their access tokens for future operations.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'facebook_get_page',
    description: 'Get information about a selected Facebook Page.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_create_post',
    description: 'Create a post on the authorized Facebook Page. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        message: { type: 'string', description: 'The content of the post' }
      },
      required: ['pageId', 'message'],
    },
  },
  {
    name: 'facebook_get_posts',
    description: 'Retrieve recent posts from the Page.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        limit: { type: 'number', description: 'Number of posts to retrieve (default: 10)' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_get_comments',
    description: 'Retrieve comments from a selected post.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'The ID of the Facebook Post' },
        pageId: { type: 'string', description: 'The ID of the Facebook Page (optional, inferred from postId if present)' },
        limit: { type: 'number', description: 'Number of comments to retrieve (default: 10)' }
      },
      required: ['postId'],
    },
  },

  {
    name: 'facebook_create_comment',
    description: 'Post a comment on a Facebook Post on behalf of the Page. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postId: { type: 'string', description: 'The ID of the Facebook Post to comment on' },
        message: { type: 'string', description: 'The comment text' }
      },
      required: ['pageId', 'postId', 'message'],
    },
  },
  {
    name: 'facebook_reply_to_comment',
    description: 'Reply to a comment. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page managing the comment' },
        commentId: { type: 'string', description: 'The ID of the comment to reply to' },
        message: { type: 'string', description: 'The reply message' }
      },
      required: ['pageId', 'commentId', 'message'],
    },
  },

  {
    name: 'facebook_get_insights',
    description: 'Retrieve available Page performance/insight metrics (e.g. page_impressions, page_engaged_users).',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        metric: { type: 'string', description: 'The metric name to retrieve (e.g., page_impressions, page_engaged_users)' }
      },
      required: ['pageId', 'metric'],
    },
  },
  {
    name: 'facebook_delete_post',
    description: 'Delete a post. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postId: { type: 'string', description: 'The ID of the post to delete' }
      },
      required: ['pageId', 'postId'],
    },
  },
  {
    name: 'facebook_update_post',
    description: 'Update the message text of an existing post. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postId: { type: 'string', description: 'The ID of the post to update' },
        message: { type: 'string', description: 'The updated message text' }
      },
      required: ['pageId', 'postId', 'message'],
    },
  },
  {
    name: 'facebook_create_photo_post',
    description: 'Upload and publish a photo post to the Facebook Page. Supports a local image file path or public image URL. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        imagePath: { type: 'string', description: 'Absolute local path to the image file' },
        imageUrl: { type: 'string', description: 'Public URL of the image to upload' },
        caption: { type: 'string', description: 'Caption or message text for the photo' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_like_post',
    description: 'Like a post on behalf of the Facebook Page. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postId: { type: 'string', description: 'The ID of the post or object to like' }
      },
      required: ['pageId', 'postId'],
    },
  },
  {
    name: 'facebook_unlike_post',
    description: 'Remove a like from a post on behalf of the Facebook Page. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postId: { type: 'string', description: 'The ID of the post or object to unlike' }
      },
      required: ['pageId', 'postId'],
    },
  }
];

export async function handleToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case 'facebook_connect': {
      await startOAuthServer();
      const url = getAuthUrl();
      return {
        content: [{ type: 'text', text: `Please visit this URL to authorize the app: ${url}` }]
      };
    }
    
    case 'facebook_get_pages': {
      const pages = await api.getPages();
      // Cache the tokens
      for (const page of pages) {
        if (page.access_token) {
          await savePageAccessToken(page.id, page.access_token);
        }
      }
      // Hide access tokens from output
      const safePages = pages.map(({ access_token, ...rest }) => rest);
      return { content: [{ type: 'text', text: JSON.stringify(safePages, null, 2) }] };
    }
    
    case 'facebook_get_page': {
      const page = await api.getPage(args.pageId);
      const { access_token, ...safePage } = page;
      return { content: [{ type: 'text', text: JSON.stringify(safePage, null, 2) }] };
    }
    
    case 'facebook_create_post': {
      const result = await api.createPost(args.pageId, args.message);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    
    case 'facebook_update_post': {
      const result = await api.updatePost(args.pageId, args.postId, args.message);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    
    case 'facebook_create_photo_post': {
      const result = await api.createPhotoPost(args.pageId, {
        imagePath: args.imagePath,
        imageUrl: args.imageUrl,
        caption: args.caption,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    
    case 'facebook_get_posts': {
      const posts = await api.getPosts(args.pageId, args.limit);
      return { content: [{ type: 'text', text: JSON.stringify(posts, null, 2) }] };
    }
    
    case 'facebook_get_comments': {
      const comments = await api.getComments(args.postId, args.limit, args.pageId);
      return { content: [{ type: 'text', text: JSON.stringify(comments, null, 2) }] };
    }

    
    case 'facebook_create_comment': {
      const result = await api.createComment(args.pageId, args.postId, args.message);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'facebook_reply_to_comment': {
      const result = await api.replyToComment(args.pageId, args.commentId, args.message);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    
    case 'facebook_get_insights': {
      const insights = await api.getInsights(args.pageId, args.metric);
      return { content: [{ type: 'text', text: JSON.stringify(insights, null, 2) }] };
    }
    
    case 'facebook_delete_post': {
      const result = await api.deletePost(args.pageId, args.postId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'facebook_like_post': {
      const result = await api.likePost(args.pageId, args.postId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'facebook_unlike_post': {
      const result = await api.unlikePost(args.pageId, args.postId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}


