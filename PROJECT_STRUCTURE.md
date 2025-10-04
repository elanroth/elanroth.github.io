# Project Structure

## Overview
This is a React-based website built with Vite, featuring a modern design for showcasing research, blog posts, and a bookshelf.

## Directory Structure

```
elanroth.github.io/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions workflow for deployment
├── public/
│   └── vite.svg                # Favicon
├── src/
│   ├── components/
│   │   ├── Navigation.jsx      # Navigation bar component
│   │   └── Navigation.css      # Navigation styles
│   ├── pages/
│   │   ├── Home.jsx            # Home page component
│   │   ├── Home.css
│   │   ├── Research.jsx        # Research & Projects page
│   │   ├── Research.css
│   │   ├── Blog.jsx            # Blog page
│   │   ├── Blog.css
│   │   ├── Bookshelf.jsx       # Bookshelf page
│   │   └── Bookshelf.css
│   ├── App.jsx                 # Main app component with routing
│   ├── App.css                 # App-level styles
│   ├── main.jsx                # Entry point
│   └── index.css               # Global styles
├── .editorconfig               # Editor configuration
├── .gitignore                  # Git ignore rules
├── eslint.config.js            # ESLint configuration
├── index.html                  # HTML template
├── package.json                # Dependencies and scripts
├── vite.config.js              # Vite configuration
└── README.md                   # Project documentation

```

## Key Files

### App.jsx
Main application component that sets up React Router with routes for:
- `/` - Home page
- `/research` - Research & Projects page
- `/blog` - Blog page
- `/bookshelf` - Bookshelf page

### Navigation.jsx
Sticky navigation bar with:
- Logo/name
- Links to all pages
- Active link highlighting
- Responsive design

### Page Components

**Home.jsx**
- Hero section with welcome message
- Introduction text
- Quick link cards to other sections

**Research.jsx**
- Tabbed interface (Current Projects, Past Projects, Publications)
- Project cards with status badges
- Sample project data (ready to be customized)

**Blog.jsx**
- Category filter buttons (All, Mathematics, Philosophy)
- Blog post cards with metadata
- Sample posts about math and philosophy

**Bookshelf.jsx**
- Category filter buttons (All, Mathematics, Philosophy)
- Book cards with visual spine accent
- Star ratings and book descriptions

## Styling

- Uses CSS custom properties for theming
- Supports dark mode (default) and light mode (via system preference)
- Fully responsive design with mobile-first approach
- Consistent color scheme with gradient accents (#646cff primary)
- Card-based layouts with hover effects
- Smooth animations and transitions

## Customization

To add your own content:

1. **Research Projects**: Edit the arrays in `src/pages/Research.jsx`
2. **Blog Posts**: Edit the `blogPosts` array in `src/pages/Blog.jsx`
3. **Books**: Edit the `books` array in `src/pages/Bookshelf.jsx`
4. **Personal Info**: Update name in `src/components/Navigation.jsx`
5. **Page Title**: Update in `index.html`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Deployment

The site uses GitHub Actions to automatically deploy to GitHub Pages when changes are pushed to the `main` branch. The workflow:

1. Checks out the code
2. Sets up Node.js
3. Installs dependencies
4. Builds the project
5. Deploys to GitHub Pages

After merging to main, enable GitHub Pages in repository settings with source set to "GitHub Actions".
