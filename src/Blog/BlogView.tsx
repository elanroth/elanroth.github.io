import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { blogMetadata } from "./metadata";

type BlogPost = { slug: string; title: string; content: string; date?: string };

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

const BLOG_POSTS: BlogPost[] = Object.entries(postModules)
  .map(([path, content]) => {
    const slug = path.split("/").pop()?.replace(/\.md$/, "") ?? "post";
    const fallback = titleFromSlug(slug);
    const meta = blogMetadata[slug];
    return {
      slug,
      title: meta?.title ?? titleFromMarkdown(content, fallback),
      date: meta?.date,
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
              padding: 16,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "white",
              boxShadow: "0 8px 18px rgba(0,0,0,0.04)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>{post.title}</div>
            <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13, fontWeight: 700 }}>{post.date ?? "Date TBD"}</div>
          </button>
        ))}
      </div>
    );
  }

  const activePost = BLOG_POSTS.find((post) => post.slug === activePostSlug);

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
        <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13, fontWeight: 700 }}>
          {activePost?.date ?? "Date TBD"}
        </div>
      </div>
      <div className="markdown" style={{ marginTop: 16 }}>
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {activePost?.content ?? ""}
        </ReactMarkdown>
      </div>
    </div>
  );
}
