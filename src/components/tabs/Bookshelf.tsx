import { Card } from '../ui/card';
import { BookOpen } from 'lucide-react';

const books = [
  {
    title: "Book Title 1",
    author: "Author Name",
    thoughts: "A brief reflection on what this book meant to you and what you learned from it."
  },
  {
    title: "Book Title 2",
    author: "Author Name",
    thoughts: "Your key takeaways and how this book influenced your thinking or work."
  },
  {
    title: "Book Title 3",
    author: "Author Name",
    thoughts: "What resonated with you and why you'd recommend it to others."
  },
  {
    title: "Book Title 4",
    author: "Author Name",
    thoughts: "A memorable quote or idea that stayed with you after finishing this book."
  },
  {
    title: "Book Title 5",
    author: "Author Name",
    thoughts: "How this book challenged your perspective or introduced you to new concepts."
  },
  {
    title: "Book Title 6",
    author: "Author Name",
    thoughts: "The main ideas you took away and how they apply to your work or life."
  }
];

export function Bookshelf() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="mb-2">Bookshelf</h2>
        <p className="text-muted-foreground">
          Books I've read and reflections on what I learned from them
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {books.map((book, index) => (
          <Card key={index} className="p-6 bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-start space-x-3 mb-3">
              <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                <BookOpen className="text-primary" size={20} />
              </div>
              <div>
                <h3 className="mb-1">{book.title}</h3>
                <p className="text-muted-foreground">{book.author}</p>
              </div>
            </div>
            <p className="text-muted-foreground">{book.thoughts}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
