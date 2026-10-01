// Response-shaping helpers: Graph API nodes contain huge signed CDN URLs and
// redundant timestamps. MCP responses feed an LLM context window, so tools
// return a trimmed view by default and expose `fields:"raw"` for full data.

const MAX_TEXT = 300;

export function truncate(text: string | undefined | null, maxlen: number = MAX_TEXT): string | undefined {
  if (!text) return undefined;
  return text.length > maxlen ? text.slice(0, maxlen) + '...' : text;
}

export function slimPost(p: any): any {
  return {
    id: p.id,
    created_time: p.created_time,
    message: truncate(p.message),
    story: p.story,
    permalink_url: p.permalink_url,
    image: p.full_picture ? '[has image — use fields:"raw" for the URL]' : undefined,
    picture_preview: (p.attachments?.data?.[0]?.media?.image?.src
      ? '[has attachment image]'
      : undefined),
  };
}

export function slimComment(c: any): any {
  return {
    id: c.id,
    from: c.from?.name,
    from_id: c.from?.id,
    message: truncate(c.message),
    created_time: c.created_time,
  };
}

export function slimPhoto(p: any): any {
  return {
    id: p.id,
    name: truncate(p.name, 120),
    created_time: p.created_time,
    album: p.album?.name,
    link: p.link,
    image_src: '[signed CDN URL omitted — request fields:"raw" or use the link]',
  };
}

export function slimVideo(v: any): any {
  return {
    id: v.id,
    title: truncate(v.title, 120),
    created_time: v.created_time,
    length: v.length,
    permalink_url: v.permalink_url,
    views: v.views,
  };
}

export function slimLike(l: any): any {
  return {
    id: l.id,
    name: l.name,
    category: l.category,
    fan_count: l.fan_count,
    created_time: l.created_time,
  };
}

export function slimPage(p: any): any {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    tasks: p.tasks,
  };
}

export function slimInsight(i: any): any {
  const values = Array.isArray(i.values) ? i.values.slice(-7) : i.values;
  return {
    name: i.name,
    period: i.period,
    title: i.title,
    description: truncate(i.description, 160),
    values: Array.isArray(values)
      ? values.map((v: any) => ({ value: v.value, end_time: v.end_time ? String(v.end_time).slice(0, 10) : undefined }))
      : values,
    omitted_values: Array.isArray(i.values) ? Math.max(0, i.values.length - values.length) : 0,
  };
}

export function wantsRaw(args: any): boolean {
  return args && args.fields === 'raw';
}
