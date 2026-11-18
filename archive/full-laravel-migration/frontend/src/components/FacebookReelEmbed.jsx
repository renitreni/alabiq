import React, { useMemo } from "react";

// Landscape 16:9 — matches how Facebook renders this reel in the embed player.
const EMBED_WIDTH = 560;
const EMBED_HEIGHT = 315;

function buildEmbedUrl(reelUrl) {
  const params = new URLSearchParams({
    href: reelUrl,
    show_text: "false",
    width: String(EMBED_WIDTH),
  });
  return `https://www.facebook.com/plugins/video.php?${params.toString()}`;
}

const FacebookReelEmbed = ({ reelUrl, title, className = "" }) => {
  const embedUrl = useMemo(() => buildEmbedUrl(reelUrl), [reelUrl]);

  return (
    <div className={`w-full max-w-2xl mx-auto ${className}`}>
      <div className="relative rounded-3xl border border-brand-border bg-brand-dark p-1.5 shadow-2xl shadow-brand-orange/10 overflow-hidden">
        <div className="relative w-full aspect-video overflow-hidden rounded-[1.25rem] bg-black">
          <iframe
            src={embedUrl}
            title={title}
            width={EMBED_WIDTH}
            height={EMBED_HEIGHT}
            className="absolute inset-0 h-full w-full border-0"
            scrolling="no"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
};

export default FacebookReelEmbed;
