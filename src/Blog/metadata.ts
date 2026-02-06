export type BlogPostMeta = {
  title?: string;
  date?: string;
  excerpt?: string;
  tags?: string[];
};

export const blogMetadata: Record<string, BlogPostMeta> = {
  "computability_and_randomness": {
    title: "Foundations of Algorithmic Randomness and Computability",
    date: "2026-02-05",
    excerpt: "A tour of the history of computability and its application in algorithmic randomness accompanied by a Lean formalization",
    tags: [],
  },
};
