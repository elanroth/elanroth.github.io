import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { blogMetadata } from "./metadata";

type BlogPost = { slug: string; title: string; content: string; date?: string; excerpt?: string; tags?: string[] };

type BlogViewMode = "list" | "post";

const postModules = import.meta.glob("./content/*.md", { as: "raw", eager: true }) as Record<string, string>;

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
    if (activePostSlug || BLOG_POSTS.length === 0) return;
    setActivePostSlug(BLOG_POSTS[0].slug);
  }, [activePostSlug]);

  if (BLOG_POSTS.length === 0) {
    return (
      <div style={{ padding: 20, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)", color: "#6b7280", fontWeight: 600 }}>
        No posts yet.
      </div>
    );
  }

  if (blogView === "list") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {BLOG_POSTS.map((post) => (
          <button
            key={post.slug}
            type="button"
            onClick={() => {
              setActivePostSlug(post.slug);
              setBlogView("post");
            }}
            style={{
              padding: 18,
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "white",
              boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
              textAlign: "left",
              cursor: "pointer",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>{post.title}</div>
            {post.excerpt && <div style={{ color: "#475569", lineHeight: 1.6 }}>{post.excerpt}</div>}
          </button>
        ))}
      </div>
    );
  }

  const activePost = BLOG_POSTS.find((post) => post.slug === activePostSlug);
  const postContent = activePost?.content ? stripFirstHeading(activePost.content) : "";

  return (
    <div style={{ padding: 20, borderRadius: 12, border: "1px solid #e5e7eb", background: "white", boxShadow: "0 8px 18px rgba(0,0,0,0.04)" }}>
      <button
        type="button"
        onClick={() => setBlogView("list")}
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#f8fafc",
          fontWeight: 700,
          color: "#111827",
          cursor: "pointer",
        }}
      >
        Back to posts
      </button>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 26, color: "#111827" }}>
          {activePost?.title ?? "Post"}
        </div>
      </div>
      <div className="markdown" style={{ marginTop: 16 }}>
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {postContent}
        </ReactMarkdown>
      </div>
      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          onClick={() => setBlogView("list")}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#f8fafc",
            fontWeight: 700,
            color: "#111827",
            cursor: "pointer",
          }}
        >
          Back to posts
        </button>
      </div>
    </div>
  );
}
