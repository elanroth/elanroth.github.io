# Elan Roth - Personal Website

A React-based website for organizing research, projects, and hosting a blog about mathematics and philosophy.

## Features

- **Home**: Welcome page with quick links to all sections
- **Research & Projects**: Showcase current and past research projects with publications
- **Blog**: Posts about mathematics and philosophy with category filtering
- **Bookshelf**: Curated collection of influential books in mathematics and philosophy

## Tech Stack

- React 18
- React Router 6
- Vite
- CSS Modules with responsive design
- GitHub Pages for hosting

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

```bash
npm install
```

### Running Locally

```bash
npm run dev
```

The site will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Linting

```bash
npm run lint
```

## Deployment

The site automatically deploys to GitHub Pages when changes are pushed to the `main` branch via GitHub Actions.

## Customization

To customize the content:

1. **Research Projects**: Edit `src/pages/Research.jsx` to update your projects and publications
2. **Blog Posts**: Edit `src/pages/Blog.jsx` to add or modify blog posts
3. **Books**: Edit `src/pages/Bookshelf.jsx` to update your book collection
4. **Personal Info**: Update the name in `src/components/Navigation.jsx` and page titles in `index.html`

## License

MIT