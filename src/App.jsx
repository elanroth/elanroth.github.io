import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import Research from './pages/Research'
import Blog from './pages/Blog'
import Bookshelf from './pages/Bookshelf'
import './App.css'
import Anagrams from "./pages/Anagrams/Anagrams";




function App() {
  return (
    <Router>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/research" element={<Research />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/bookshelf" element={<Bookshelf />} />
            <Route path="/anagrams" element={<Anagrams />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
