import { Card } from '../ui/card';
import { Calendar } from 'lucide-react';
import MathBlock from '../ui/MathBlock';

const blogPosts = [
  {
    title: "Reflections on the Nature of Truth",
    date: "October 15, 2024",
    tags: ["philosophy", "epistemology"],
    excerpt: "Exploring different perspectives on what constitutes truth and how we come to know things in an uncertain world."
  },
  {
    title: "The Beauty of Mathematical Proof",
    date: "September 28, 2024",
    tags: ["math", "philosophy"],
    excerpt: "Why elegant proofs matter and what they reveal about the structure of mathematical thinking."
  },
  {
    title: "Faith and Reason in Modern Context",
    date: "September 10, 2024",
    tags: ["religion", "philosophy"],
    excerpt: "Examining the relationship between faith and reason, and how they complement rather than contradict each other."
  },
  {
    title: "Patterns in Chaos: A Mathematical Perspective",
    date: "August 22, 2024",
    tags: ["math", "science"],
    excerpt: "How mathematics helps us find order in seemingly chaotic systems and what that tells us about reality."
  },
  {
    title: "The Ethics of Technology",
    date: "August 5, 2024",
    tags: ["philosophy", "technology"],
    excerpt: "Considering our moral obligations as we develop increasingly powerful technologies."
  },
  {
    title: "Ancient Wisdom for Modern Problems",
    date: "July 18, 2024",
    tags: ["philosophy", "religion"],
    excerpt: "What ancient philosophical and religious traditions can teach us about contemporary challenges."
  }
];

const tagColors: Record<string, string> = {
  philosophy: "bg-purple-100 text-purple-700",
  math: "bg-blue-100 text-blue-700",
  religion: "bg-amber-100 text-amber-700",
  science: "bg-green-100 text-green-700",
  technology: "bg-pink-100 text-pink-700",
  epistemology: "bg-indigo-100 text-indigo-700"
};

export function BlogTab() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="mb-2">Blog</h2>
        <p className="text-muted-foreground">
          Thoughts and reflections on philosophy, mathematics, religion, and more
        </p>
      </div>

      <div className="space-y-6">
        {/* Example math-enabled post snippet */}
        <Card className="p-6 bg-card hover:border-primary/30 transition-colors">
          <div className="flex items-center space-x-2 text-muted-foreground mb-3">
            <Calendar size={16} />
            <span>Example</span>
          </div>
          <h3 className="mb-3">Writing Math Nicely</h3>
          <p className="text-muted-foreground mb-4">You can write LaTeX blocks and place them left, center, or right. Toggle draggable to move them around.</p>
          <div className="space-y-4">
            <MathBlock latex={"\\displaystyle \\sum_{n=0}^{\\infty} x^n = \\frac{1}{1-x}"} displayMode={true} align="center" />
            <MathBlock latex={"e^{i\\pi} + 1 = 0"} displayMode={false} align="left" />
            <MathBlock latex={"\\int_0^1 x^2 \\;dx = \\frac{1}{3}"} displayMode={true} align="right" />
          </div>
        </Card>

        {blogPosts.map((post, index) => (
          <Card key={index} className="p-6 bg-card hover:border-primary/30 transition-colors cursor-pointer">
            <div className="flex items-center space-x-2 text-muted-foreground mb-3">
              <Calendar size={16} />
              <span>{post.date}</span>
            </div>

            <h3 className="mb-3">{post.title}</h3>
            
            <p className="text-muted-foreground mb-4">
              {post.excerpt}
            </p>

            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, tagIndex) => (
                <span
                  key={tagIndex}
                  className={`px-3 py-1 rounded-full ${tagColors[tag] || 'bg-secondary text-secondary-foreground'}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
