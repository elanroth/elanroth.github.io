import { Link, useLocation } from 'react-router-dom'
import './Navigation.css'

function Navigation() {
  const location = useLocation()

  const isActive = (path) => {
    return location.pathname === path ? 'active' : ''
  }

  return (
    <nav className="navigation">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <h2>Elan Roth</h2>
        </Link>
        <ul className="nav-links">
          <li>
            <Link to="/" className={isActive('/')}>Home</Link>
          </li>
          <li>
            <Link to="/research" className={isActive('/research')}>Research & Projects</Link>
          </li>
          <li>
            <Link to="/blog" className={isActive('/blog')}>Blog</Link>
          </li>
          <li>
            <Link to="/bookshelf" className={isActive('/bookshelf')}>Bookshelf</Link>
          </li>
          <li>
            <Link to="/anagrams" className={isActive('/anagrams')}>Anagrams</Link>
          </li>

        </ul>
      </div>
    </nav>
  )
}

export default Navigation
