import { Link } from 'react-router-dom'
import './Home.css'

function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Welcome to My Research Hub</h1>
        <p className="subtitle">
          Exploring the intersections of mathematics, philosophy, and technology
        </p>
      </section>

      <section className="intro">
        <p>
          This is my personal space for organizing research, documenting projects, 
          and sharing thoughts on mathematics and philosophy. Feel free to explore 
          my work and ideas.
        </p>
      </section>

      <section className="quick-links">
        <div className="link-card">
          <h3>Research & Projects</h3>
          <p>Explore my current and past research projects, including publications and ongoing work.</p>
          <Link to="/research" className="card-link">View Research →</Link>
        </div>

        <div className="link-card">
          <h3>Blog</h3>
          <p>Read my thoughts and explorations on mathematics, philosophy, and their connections.</p>
          <Link to="/blog" className="card-link">Read Blog →</Link>
        </div>

        <div className="link-card">
          <h3>Bookshelf</h3>
          <p>Discover books that have influenced my thinking and research.</p>
          <Link to="/bookshelf" className="card-link">Browse Books →</Link>
        </div>
      </section>
    </div>
  )
}

export default Home
