import { useState } from 'react'
import './Bookshelf.css'

function Bookshelf() {
  const [selectedCategory, setSelectedCategory] = useState('all')

  const books = [
    {
      id: 1,
      title: 'Gödel, Escher, Bach: An Eternal Golden Braid',
      author: 'Douglas Hofstadter',
      category: 'mathematics',
      year: '1979',
      rating: 5,
      description: 'A masterpiece exploring the connections between logic, art, and music through the lens of mathematical thinking.'
    },
    {
      id: 2,
      title: 'Being and Time',
      author: 'Martin Heidegger',
      category: 'philosophy',
      year: '1927',
      rating: 5,
      description: 'A foundational work in phenomenology and existentialism, exploring the nature of being and human existence.'
    },
    {
      id: 3,
      title: 'A Mathematician\'s Apology',
      author: 'G.H. Hardy',
      category: 'mathematics',
      year: '1940',
      rating: 4,
      description: 'A deeply personal essay on the aesthetic beauty of mathematics and the life of a mathematician.'
    },
    {
      id: 4,
      title: 'Critique of Pure Reason',
      author: 'Immanuel Kant',
      category: 'philosophy',
      year: '1781',
      rating: 5,
      description: 'Kant\'s revolutionary work on epistemology and metaphysics that shaped modern philosophy.'
    },
    {
      id: 5,
      title: 'The Art of Mathematics',
      author: 'Jerry P. King',
      category: 'mathematics',
      year: '1992',
      rating: 4,
      description: 'An exploration of mathematics as an art form, emphasizing creativity and beauty in mathematical thought.'
    },
    {
      id: 6,
      title: 'Meditations on First Philosophy',
      author: 'René Descartes',
      category: 'philosophy',
      year: '1641',
      rating: 5,
      description: 'Descartes\' foundational work on rationalism and the search for certain knowledge.'
    }
  ]

  const filteredBooks = selectedCategory === 'all' 
    ? books 
    : books.filter(book => book.category === selectedCategory)

  const renderStars = (rating) => {
    return '⭐'.repeat(rating)
  }

  return (
    <div className="bookshelf">
      <header className="bookshelf-header">
        <h1>Bookshelf</h1>
        <p>Books that have shaped my thinking in mathematics and philosophy</p>
      </header>

      <div className="category-filter">
        <button 
          className={selectedCategory === 'all' ? 'filter-btn active' : 'filter-btn'}
          onClick={() => setSelectedCategory('all')}
        >
          All Books
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

      <div className="books-grid">
        {filteredBooks.map(book => (
          <div key={book.id} className="book-card">
            <div className="book-spine"></div>
            <div className="book-content">
              <div className="book-category">{book.category}</div>
              <h3>{book.title}</h3>
              <p className="book-author">by {book.author}</p>
              <p className="book-year">{book.year}</p>
              <div className="book-rating">{renderStars(book.rating)}</div>
              <p className="book-description">{book.description}</p>
            </div>
          </div>
        ))}
      </div>

      {filteredBooks.length === 0 && (
        <div className="no-books">
          <p>No books found in this category.</p>
        </div>
      )}
    </div>
  )
}

export default Bookshelf
