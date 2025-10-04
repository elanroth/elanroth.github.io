import { useState } from 'react'
import './Blog.css'

function Blog() {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const blogPosts = [
    {
      id: 1,
      title: 'The Beauty of Mathematical Proof',
      category: 'mathematics',
      date: 'January 2024',
      excerpt: 'Exploring the elegance and structure of mathematical proofs, and why they represent the pinnacle of logical reasoning.',
      readTime: '5 min read'
    },
    {
      id: 2,
      title: 'Philosophy of Mathematics: Platonism vs Formalism',
      category: 'philosophy',
      date: 'December 2023',
      excerpt: 'A deep dive into the philosophical foundations of mathematics, examining whether mathematical objects exist independently or are merely formal constructions.',
      readTime: '8 min read'
    },
    {
      id: 3,
      title: 'The Intersection of Logic and Epistemology',
      category: 'philosophy',
      date: 'November 2023',
      excerpt: 'How formal logic shapes our understanding of knowledge and truth in philosophical discourse.',
      readTime: '6 min read'
    },
    {
      id: 4,
      title: 'Number Theory: The Queen of Mathematics',
      category: 'mathematics',
      date: 'October 2023',
      excerpt: 'An introduction to the fascinating world of number theory and its applications in modern cryptography.',
      readTime: '7 min read'
    }
  ]

  const filteredPosts = selectedCategory === 'all' 
    ? blogPosts 
    : blogPosts.filter(post => post.category === selectedCategory)

  return (
    <div className="blog">
      <header className="blog-header">
        <h1>Blog</h1>
        <p>Thoughts on mathematics, philosophy, and their beautiful intersection</p>
      </header>

      <div className="category-filter">
        <button 
          className={selectedCategory === 'all' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setSelectedCategory('all')}
        >
          All Posts
        </button>
        <button 
          className={selectedCategory === 'mathematics' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setSelectedCategory('mathematics')}
        >
          Mathematics
        </button>
        <button 
          className={selectedCategory === 'philosophy' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setSelectedCategory('philosophy')}
        >
          Philosophy
        </button>
      </div>

      <div className="blog-posts">
        {filteredPosts.map(post => (
          <article key={post.id} className="blog-post-card">
            <div className="post-category">{post.category}</div>
            <h2>{post.title}</h2>
            <div className="post-meta">
              <span className="post-date">{post.date}</span>
              <span className="post-read-time">{post.readTime}</span>
            </div>
            <p>{post.excerpt}</p>
            <button className="read-more">Read More →</button>
          </article>
        ))}
      </div>

      {filteredPosts.length === 0 && (
        <div className="no-posts">
          <p>No posts found in this category.</p>
        </div>
      )}
    </div>
  )
}

export default Blog
