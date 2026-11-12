import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { blogMetadata } from "./metadata";

type BlogPost = { slug: string; title: string; content: string; date?: string; excerpt?: string; tags?: string[] };

type BlogViewMode = "list" | "post";

const postModules = import.meta.glob("./content/*.md", { query: "?raw", import: 'default', eager: true }) as Record<string, string>;

function titleFromMarkdown(markdown: string, fallback: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return fallback;
}

function titleFromSlug(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function stripFirstHeading(markdown: string) {
  return markdown.replace(/^#\s+.*\n+/, "");
}

function getPostSlugFromUrl() {
  try {
    const url = new URL(window.location.href);
    const slug = url.searchParams.get("post");
    return slug ?? "";
  } catch {
    return "";
  }
}

function setPostSlugInUrl(slug?: string) {
  try {
    const url = new URL(window.location.href);
    if (slug) {
      url.searchParams.set("tab", "blog");
      url.searchParams.set("post", slug);
    } else {
      url.searchParams.delete("post");
    }
    window.history.pushState({}, "", url.toString());
  } catch {
    console.log("uh oh im in the BlogView")
  }
}

const BLOG_POSTS: BlogPost[] = Object.entries(postModules)
  .map(([path, content]) => {
    const slug = path.split("/").pop()?.replace(/\.md$/, "") ?? "post";
    const fallback = titleFromSlug(slug);
    const meta = blogMetadata[slug];
    return {
      slug,
      title: meta?.title ?? titleFromMarkdown(content, fallback),
      date: meta?.date,
      excerpt: meta?.excerpt ?? "",
      tags: meta?.tags ?? [],
      content,
    };
  })
  .sort((a, b) => {
    const aTime = a.date ? Date.parse(a.date) : Number.NaN;
    const bTime = b.date ? Date.parse(b.date) : Number.NaN;
    const aHasDate = !Number.isNaN(aTime);
    const bHasDate = !Number.isNaN(bTime);
    if (aHasDate && bHasDate && aTime !== bTime) return bTime - aTime;
    if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

export default function BlogView() {
  const [activePostSlug, setActivePostSlug] = useState<string>(BLOG_POSTS[0]?.slug ?? "");
  const [blogView, setBlogView] = useState<BlogViewMode>("list");

  useEffect(() => {
    const slugFromUrl = getPostSlugFromUrl();
    if (slugFromUrl) {
      setActivePostSlug(slugFromUrl);
      setBlogView("post");
    }

    function handlePopState() {
      const nextSlug = getPostSlugFromUrl();
      if (!nextSlug) {
        setBlogView("list");
        return;
      }
      setActivePostSlug(nextSlug);
      setBlogView("post");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (activePostSlug || BLOG_POSTS.length === 0) return;
    setActivePostSlug(BLOG_POSTS[0].slug);
  }, [activePostSlug]);

  useEffect(() => {
    if (blogView !== "post") return;
    const exists = BLOG_POSTS.some((post) => post.slug === activePostSlug);
    if (exists) return;
    setBlogView("list");
    setPostSlugInUrl(undefined);
  }, [activePostSlug, blogView]);

  if (BLOG_POSTS.length === 0) {
    return (
      <div className="site-card site-meta">
        No posts yet.
      </div>
    );
  }

  if (blogView === "list") {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        {BLOG_POSTS.map((post) => (
          <button
            key={post.slug}
            type="button"
            onClick={() => {
              setActivePostSlug(post.slug);
              setBlogView("post");
              setPostSlugInUrl(post.slug);
            }}
            className="site-card site-post-link"
          >
            <div className="site-card-title" style={{ fontSize: 21, color: "var(--accent-dark)" }}>{post.title}</div>
            {post.date && <div className="site-meta">{post.date}</div>}
            {post.excerpt && <div className="site-card-text" style={{ marginTop: 0 }}>{post.excerpt}</div>}
          </button>
        ))}
      </div>
    );
  }

  const activePost = BLOG_POSTS.find((post) => post.slug === activePostSlug);
  const postContent = activePost?.content ? stripFirstHeading(activePost.content) : "";

  return (
    <article className="site-card" style={{ padding: "22px 26px" }}>
      <button
        type="button"
        onClick={() => {
          setBlogView("list");
          setPostSlugInUrl(undefined);
        }}
        className="site-btn"
      >
        Back to posts
      </button>
      <h1 className="site-post-title">{activePost?.title ?? "Post"}</h1>
      {activePost?.date && <div className="site-meta" style={{ marginTop: 6 }}>{activePost.date}</div>}
      <div className="markdown" style={{ marginTop: 16 }}>
        <ReactMarkdown>
          {postContent}
        </ReactMarkdown>
      </div>
      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          onClick={() => {
            setBlogView("list");
            setPostSlugInUrl(undefined);
          }}
          className="site-btn"
        >
          Back to posts
        </button>
      </div>
    </article>
  );
}
