import { getAuthUrl, startOAuthServer } from '../auth/oauth';
import * as api from '../facebook-api/client';
import { savePageAccessToken, getUserTokenMeta, hasConsumerToken, hasBusinessToken } from '../token-store/store';
import { OAuthFlow } from '../types';
import { wantsRaw, slimPost, slimComment, slimPhoto, slimVideo, slimLike, slimPage, slimInsight } from './summarize';

function requireFlow(args: any): OAuthFlow {
  const flow = (args && args.flow) || 'consumer';
  if (flow !== 'consumer' && flow !== 'business') {
    throw new Error(`Invalid flow "${flow}". Use flow="consumer" (personal account) or flow="business" (Page management).`);
  }
  return flow;
}

export const TOOL_DEFINITIONS = [
  {
    name: 'facebook_connect',
    description: 'Initialize the Facebook authorization flow for a specific Meta app. flow="consumer" authorizes the PERSONAL account (Consumer App, personal scopes). flow="business" authorizes PAGE management (Business App; uses BUSINESS_CONFIG_ID and then lets facebook_get_pages cache Page tokens). Returns a URL the user must open in a browser to authorize. Each flow writes its own token slot — one never overwrites the other.',
    inputSchema: {
      type: 'object',
      properties: {
        flow: {
          type: 'string',
          enum: ['consumer', 'business'],
          description: 'Which app to authorize against: "consumer" (personal account) or "business" (Page management).',
        },
      },
      required: ['flow'],
    },
  },
  {
    name: 'facebook_get_pages',
    description: 'Return Facebook Pages the authenticated user manages. Requires the BUSINESS user token (facebook_connect flow=business). Automatically caches Page access tokens for Page tools. Summarized by default; fields:"raw" for full nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
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
    description: 'Create a post on the authorized Facebook Page. Only Pages can be posted to via Graph API — Meta removed user-timeline posting (publish_actions). For personal profiles use facebook_share_dialog_url. NOTE: You must ask the user for confirmation before calling this tool.',
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
    description: 'Retrieve recent posts from the Page. By default returns a summarized view (long signed CDN image URLs are omitted); pass fields:"raw" for the full Graph node.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        limit: { type: 'number', description: 'Number of posts to retrieve (default: 10)' },
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_get_comments',
    description: 'Retrieve comments from a selected post. Summarized by default; fields:"raw" for full nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'The ID of the Facebook Post' },
        pageId: { type: 'string', description: 'The ID of the Facebook Page (optional, inferred from postId if present)' },
        limit: { type: 'number', description: 'Number of comments to retrieve (default: 10)' },
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
      required: ['postId'],
    },
  },

  {
    name: 'facebook_create_comment',
    description: 'Post a comment on a Facebook Page post on behalf of the Page. Personal-account commenting is NOT available in Graph API v26.0. NOTE: You must ask the user for confirmation before calling this tool.',
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
    description: 'Retrieve available Page performance/insight metrics (e.g. page_impressions, page_engaged_users). Summarized to the latest 7 values; fields:"raw" for the full time series.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        metric: { type: 'string', description: 'The metric name to retrieve (e.g., page_impressions, page_engaged_users)' },
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
      required: ['pageId', 'metric'],
    },
  },
  {
    name: 'facebook_delete_post',
    description: 'Delete a post from a Facebook Page. Page posts only — the Graph API does not support personal-account deletion. NOTE: You must ask the user for confirmation before calling this tool.',
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
    description: 'Update the message text of an existing post on the Page. Page posts only. NOTE: You must ask the user for confirmation before calling this tool.',
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
    description: 'Upload and publish a photo post to the Facebook Page. Supports a local image file path or public image URL. Publication to the feed is explicit and verified; the result includes a published flag and any warning from Graph. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        imagePath: { type: 'string', description: 'Absolute local path to the image file' },
        imageUrl: { type: 'string', description: 'Public URL of the image to upload' },
        caption: { type: 'string', description: 'Caption or message text for the photo' },
        publishToFeed: { type: 'boolean', description: 'Set false to keep the photo unpublished in the Page library (default: true)' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_unlike_post',
    description: 'Remove a like on behalf of the Facebook Page. User-level unlike is not available in Graph API v26.0. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postId: { type: 'string', description: 'The ID of the post or object to unlike' }
      },
      required: ['pageId', 'postId'],
    },
  },
  {
    name: 'facebook_get_cover',
    description: 'Get the Facebook Page cover photo (id, source URL, crop offsets).',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_set_cover_photo',
    description: 'Set the Page cover photo from a local image path, a public image URL, or an existing Page photo ID. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        imagePath: { type: 'string', description: 'Absolute local path to the image file' },
        imageUrl: { type: 'string', description: 'Public URL of the image' },
        photoId: { type: 'string', description: 'ID of an already-uploaded Page photo to reuse' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_set_profile_picture',
    description: 'Set the Page profile picture from a local image path, a public image URL, or an existing Page photo ID. Requires pages_manage_metadata. Upload is kept out of the feed (unpublished) and no story is generated. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        imagePath: { type: 'string', description: 'Absolute local path to the image file' },
        imageUrl: { type: 'string', description: 'Public URL of the image' },
        photoId: { type: 'string', description: 'ID of an already-uploaded Page photo to reuse' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_bulk_like',
    description: 'Like many Page posts in one call. Pass postIds explicitly, or set all:true to like every post in the Page feed (up to limit). NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postIds: { type: 'array', items: { type: 'string' }, description: 'Post IDs to like' },
        all: { type: 'boolean', description: 'Like every feed post instead of an explicit list' },
        limit: { type: 'number', description: 'Max posts when all:true (default 50)' }
      },
      required: ['pageId'],
    },
  },
  {
    name: 'facebook_bulk_comment',
    description: 'Post one comment message to many Page posts. Pass postIds explicitly or all:true. Duplicate identical comments by the Page on the same post are skipped. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postIds: { type: 'array', items: { type: 'string' }, description: 'Post IDs to comment on' },
        all: { type: 'boolean', description: 'Comment on every feed post instead of an explicit list' },
        limit: { type: 'number', description: 'Max posts when all:true (default 50)' },
        message: { type: 'string', description: 'Comment text' }
      },
      required: ['pageId', 'message'],
    },
  },
  {
    name: 'facebook_like_post',
    description: 'Like a post on behalf of the Facebook Page. User-level likes are not available in Graph API v26.0. NOTE: You must ask the user for confirmation before calling this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the Facebook Page' },
        postId: { type: 'string', description: 'The ID of the post or object to like' }
      },
      required: ['pageId', 'postId'],
    },
  },

  // ─── Personal account (Facebook Login) tools ───────────────────────────────

  {
    name: 'facebook_get_me',
    description: 'Get the basic profile of the authenticated personal Facebook account (name, id, email, avatar). Requires public_profile and email scopes.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'facebook_get_my_profile',
    description: 'Get extended profile fields for the authenticated personal account: age_range, birthday, gender, hometown, location, locale, timezone. Each field returns only if its user_* permission was granted.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'facebook_get_my_posts',
    description: "Read the authenticated user's own timeline posts. Requires user_posts. IMPORTANT: under Meta's current platform rules this returns only posts published by this app or apps the user still authorizes — it does NOT expose the user's full historical feed. An empty array is expected, not an error. Summarized by default (image URLs omitted); fields:\"raw\" for full nodes.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of posts to retrieve (default: 25, max: 100)' },
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
      required: [],
    },
  },
  {
    name: 'facebook_get_my_photos',
    description: "Read photos of the authenticated user. Requires user_photos. Summarized by default (signed CDN URLs omitted); fields:\"raw\" for full nodes.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of photos to retrieve (default: 25, max: 100)' },
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
      required: [],
    },
  },
  {
    name: 'facebook_get_my_videos',
    description: "Read videos uploaded by the authenticated user. Requires user_videos. Summarized by default; fields:\"raw\" for full nodes.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of videos to retrieve (default: 25, max: 100)' },
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
      required: [],
    },
  },
  {
    name: 'facebook_get_my_likes',
    description: 'List Pages that the authenticated user has liked. Requires user_likes. Summarized by default; fields:"raw" for full nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of liked pages to retrieve (default: 25, max: 100)' },
        fields: { type: 'string', enum: ['summary', 'raw'], description: 'summary (default) or raw full node' }
      },
      required: [],
    },
  },
  {
    name: 'facebook_get_my_friends',
    description: 'List the authenticated users friends. WARNING: since Graph API v2.0 /me/friends returns ONLY friends who also signed in with this same app — for a standalone personal app this is normally an empty list. This is a Meta platform limitation, not a bug.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of friends to retrieve (default: 25)' }
      },
      required: [],
    },
  },
  {
    name: 'facebook_check_token',
    description: 'Inspect a stored user access token: which app it belongs to, its granted scopes, expiry, and validity. flow="consumer" checks the personal-account token, flow="business" checks the Page-management token. Never returns the token itself.',
    inputSchema: {
      type: 'object',
      properties: {
        flow: { type: 'string', enum: ['consumer', 'business'], description: 'Which token slot to inspect (default: consumer).' },
      },
      required: [],
    },
  },
  {
    name: 'facebook_share_dialog_url',
    description: 'Meta removed the Graph API ability to post to a personal timeline (publish_actions is deprecated). This returns a Facebook Share Dialog URL that the USER must open in a browser and confirm manually. Use it instead of pretending to post as a user.',
    inputSchema: {
      type: 'object',
      properties: {
        link: { type: 'string', description: 'URL to share (required by the Share Dialog)' },
        quote: { type: 'string', description: 'Optional quote/caption text shown with the share' }
      },
      required: ['link'],
    },
  }
];

const resolvePostIds = async (args: any): Promise<string[]> => {
  if (Array.isArray(args.postIds) && args.postIds.length) return args.postIds;
  if (args.all) {
    const posts = await api.listPagePostIds(args.pageId, args.limit || 50);
    return posts.map(p => p.id);
  }
  throw new Error('Provide postIds: [...] or all:true');
};

const jsonResult = (data: any) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

export async function handleToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case 'facebook_connect': {
      const flow = requireFlow(args);
      await startOAuthServer();
      const url = getAuthUrl(flow);
      return {
        content: [{
          type: 'text',
          text: `Authorize the ${flow === 'consumer' ? 'personal-account (Consumer App)' : 'Page-management (Business App)'} flow by opening this URL:\n${url}`
        }]
      };
    }

    case 'facebook_get_pages': {
      const pages = await api.getPages();
      // Cache tokens selectively: a Page with no management tasks is not
      // useful for write tools, and silently replacing a previously good
      // page token with one that has no management capabilities is worse
      // than leaving the store slot alone.
      const cached: string[] = [];
      const skipped: string[] = [];
      for (const page of pages) {
        const tasks = (page as any).tasks || [];
        const manageable = tasks.some((t: string) =>
          ['MANAGE', 'CREATE_CONTENT', 'ADVERTISE', 'MODERATE', 'ANALYZE'].includes(t)
        );
        if (page.access_token && manageable) {
          await savePageAccessToken(page.id, page.access_token);
          cached.push(page.id);
        } else {
          skipped.push(page.id);
        }
      }

      const safePages = pages.map(({ access_token, ...rest }) => rest);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            {
              pages: wantsRaw(args) ? safePages : safePages.map(slimPage),
              token_cache: {
                cached_page_ids: cached,
                pages_without_manage_tasks: skipped,
              },
            },
            null,
            2
          ),
        }],
      };
    }

    case 'facebook_get_page': {
      const page = await api.getPage(args.pageId);
      const { access_token, ...safePage } = page;
      return jsonResult(safePage);
    }

    case 'facebook_create_post': {
      const result = await api.createPost(args.pageId, args.message);
      return jsonResult(result);
    }

    case 'facebook_update_post': {
      const result = await api.updatePost(args.pageId, args.postId, args.message);
      return jsonResult(result);
    }

    case 'facebook_create_photo_post': {
      const result = await api.createPhotoPost(args.pageId, {
        imagePath: args.imagePath,
        imageUrl: args.imageUrl,
        caption: args.caption,
        publishToFeed: args.publishToFeed,
      });
      return jsonResult(result);
    }

    case 'facebook_get_posts': {
      const posts = await api.getPosts(args.pageId, args.limit);
      return jsonResult(wantsRaw(args) ? posts : posts.map(slimPost));
    }

    case 'facebook_get_comments': {
      const comments = await api.getComments(args.postId, args.limit, args.pageId);
      return jsonResult(wantsRaw(args) ? comments : comments.map(slimComment));
    }

    case 'facebook_create_comment': {
      const result = await api.createComment(args.pageId, args.postId, args.message);
      return jsonResult(result);
    }

    case 'facebook_reply_to_comment': {
      const result = await api.replyToComment(args.pageId, args.commentId, args.message);
      return jsonResult(result);
    }

    case 'facebook_get_insights': {
      const insights = await api.getInsights(args.pageId, args.metric);
      return jsonResult(wantsRaw(args) ? insights : insights.map(slimInsight));
    }

    case 'facebook_delete_post': {
      const result = await api.deletePost(args.pageId, args.postId);
      return jsonResult(result);
    }

    case 'facebook_like_post': {
      const result = await api.likePost(args.pageId, args.postId);
      return jsonResult(result);
    }

    case 'facebook_unlike_post': {
      const result = await api.unlikePost(args.pageId, args.postId);
      return jsonResult(result);
    }

    case 'facebook_get_cover': {
      const cover = await api.getPageCover(args.pageId);
      return jsonResult(cover);
    }

    case 'facebook_set_cover_photo': {
      const result = await api.setPageCover(args.pageId, {
        photoId: args.photoId,
        imagePath: args.imagePath,
        imageUrl: args.imageUrl,
      });
      return jsonResult(result);
    }

    case 'facebook_set_profile_picture': {
      const result = await api.setPagePicture(args.pageId, {
        photoId: args.photoId,
        imagePath: args.imagePath,
        imageUrl: args.imageUrl,
      });
      return jsonResult(result);
    }

    case 'facebook_bulk_like': {
      const postIds = await resolvePostIds(args);
      const results = await api.bulkLikePosts(args.pageId, postIds);
      const ok = results.filter(r => r.ok).length;
      return jsonResult({ total: postIds.length, succeeded: ok, failed: postIds.length - ok, results });
    }

    case 'facebook_bulk_comment': {
      const postIds = await resolvePostIds(args);
      const results = await api.bulkCommentPosts(args.pageId, postIds, args.message);
      const ok = results.filter(r => r.ok).length;
      return jsonResult({ total: postIds.length, succeeded: ok, failed: postIds.length - ok, results });
    }

    // ── Personal account (Facebook Login use case) ──────────────────────────

    case 'facebook_get_me': {
      const profile = await api.getMyProfile();
      return jsonResult(profile);
    }

    case 'facebook_get_my_profile': {
      const extended = await api.getMyExtendedProfile();
      return jsonResult(extended);
    }

    case 'facebook_get_my_posts': {
      const posts = await api.getMyPosts(Math.min(args.limit || 25, 100));
      return jsonResult(wantsRaw(args) ? posts : posts.map(slimPost));
    }

    case 'facebook_get_my_photos': {
      const photos = await api.getMyPhotos(Math.min(args.limit || 25, 100));
      return jsonResult(wantsRaw(args) ? photos : photos.map(slimPhoto));
    }

    case 'facebook_get_my_videos': {
      const videos = await api.getMyVideos(Math.min(args.limit || 25, 100));
      return jsonResult(wantsRaw(args) ? videos : videos.map(slimVideo));
    }

    case 'facebook_get_my_likes': {
      const likes = await api.getMyLikes(Math.min(args.limit || 25, 100));
      return jsonResult(wantsRaw(args) ? likes : likes.map(slimLike));
    }

    case 'facebook_get_my_friends': {
      const friends = await api.getMyFriends(Math.min(args.limit || 25, 100));
      return jsonResult({
        note: 'Meta only returns friends who also authorized this same app. An empty list is the normal result for personal-use apps.',
        friends,
      });
    }

    case 'facebook_check_token': {
      const requested = (args && args.flow) || 'consumer';
      const flow: OAuthFlow = requested === 'business' ? 'business' : 'consumer';

      const consumerMeta = await getUserTokenMeta('consumer');
      const businessMeta = await getUserTokenMeta('business');

      // Report presence/expiry for BOTH slots (never the token values).
      const stored = {
        consumer: {
          present: await hasConsumerToken(),
          requested_scopes: consumerMeta?.scopes || null,
          obtained_at: consumerMeta?.obtained_at || null,
          stored_expires_at: consumerMeta?.expires_at || null,
        },
        business: {
          present: await hasBusinessToken(),
          requested_scopes: businessMeta?.scopes || null,
          obtained_at: businessMeta?.obtained_at || null,
          stored_expires_at: businessMeta?.expires_at || null,
        },
      };

      // Live debug only the requested flow so a missing other-app token
      // never fails the whole call.
      let live: any;
      try {
        live = await api.debugUserToken(flow);
      } catch (e: any) {
        live = { flow, error: e.message };
      }

      return jsonResult({ checked_flow: flow, stored, live });
    }

    case 'facebook_share_dialog_url': {
      const url = api.buildShareDialogUrl(args.link, args.quote);
      return jsonResult({
        share_dialog_url: url,
        note: 'Meta removed Graph API posting to personal timelines. Open this URL; the user must click "Share" in the browser themselves.',
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}


