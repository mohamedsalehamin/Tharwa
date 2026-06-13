export type YoutubePlaylistVideo = {
  videoId: string;
  title: string;
  position: number;
};

export type YoutubePlaylistMeta = {
  playlistId: string;
  title: string | null;
  videos: YoutubePlaylistVideo[];
};

const VIDEO_ID_RE = /^[\w-]{11}$/;

export function parseYoutubePlaylistId(raw: string): string {
  const t = raw.trim();
  const fromQuery = t.match(/[?&]list=([\w-]+)/)?.[1];
  if (fromQuery) return fromQuery;
  if (/^[\w-]{12,}$/.test(t) && !VIDEO_ID_RE.test(t)) return t;
  throw new Error('Invalid YouTube playlist URL or playlist ID');
}

async function fetchPlaylistViaDataApi(
  playlistId: string,
  apiKey: string,
): Promise<YoutubePlaylistMeta> {
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}`,
  );
  if (!playlistRes.ok) {
    throw new Error(`YouTube API playlists error (${playlistRes.status})`);
  }
  const playlistJson = (await playlistRes.json()) as {
    items?: Array<{ snippet?: { title?: string } }>;
  };
  const playlistTitle = playlistJson.items?.[0]?.snippet?.title ?? null;

  const videos: YoutubePlaylistVideo[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube API playlistItems error (${res.status})`);
    }
    const data = (await res.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          position?: number;
          resourceId?: { videoId?: string };
        };
      }>;
      nextPageToken?: string;
    };

    for (const item of data.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title?.trim();
      if (!videoId || !title || title === 'Private video' || title === 'Deleted video') continue;
      videos.push({
        videoId,
        title,
        position: item.snippet?.position ?? videos.length,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  if (videos.length === 0) {
    throw new Error('Playlist has no public videos');
  }

  return { playlistId, title: playlistTitle, videos };
}

async function fetchPlaylistViaRss(playlistId: string): Promise<YoutubePlaylistMeta> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`,
    { headers: { 'User-Agent': 'TharwaLearn/1.0' } },
  );
  if (!res.ok) {
    throw new Error(`YouTube playlist feed unavailable (${res.status})`);
  }
  const xml = await res.text();
  const feedTitle =
    xml.match(/<feed[\s\S]*?<title>([^<]+)<\/title>/)?.[1]?.replace(/^Playlist:\s*/i, '').trim() ??
    null;

  const videos: YoutubePlaylistVideo[] = [];
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  for (const [, body] of entries) {
    const videoId = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
    const title = body.match(/<title>([^<]+)<\/title>/)?.[1]?.trim();
    if (!videoId || !title) continue;
    videos.push({ videoId, title, position: videos.length });
  }

  if (videos.length === 0) {
    throw new Error('Playlist feed returned no videos — set YOUTUBE_API_KEY for private/large playlists');
  }

  return { playlistId, title: feedTitle, videos };
}

export async function fetchYoutubePlaylist(
  playlistInput: string,
  apiKey?: string,
): Promise<YoutubePlaylistMeta> {
  const playlistId = parseYoutubePlaylistId(playlistInput);
  if (apiKey) {
    try {
      return await fetchPlaylistViaDataApi(playlistId, apiKey);
    } catch {
      // fall through to RSS when API fails (quota, permissions, etc.)
    }
  }
  return fetchPlaylistViaRss(playlistId);
}
