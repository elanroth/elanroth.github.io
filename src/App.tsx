import { useState, useEffect } from 'react';
import { Home as HomeIcon, BookOpen, FileText, PenLine, Moon, Sun } from 'lucide-react';
import { Home } from './components/tabs/Home';
import { Bookshelf } from './components/tabs/Bookshelf';
import { CVTab } from './components/tabs/CVTab';
import { BlogTab } from './components/tabs/BlogTab';

type Tab = 'home' | 'bookshelf' | 'cv' | 'blog';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDark]);

  const tabs = [
    { id: 'home' as Tab, label: 'Home', icon: HomeIcon },
    { id: 'bookshelf' as Tab, label: 'Bookshelf', icon: BookOpen },
    { id: 'cv' as Tab, label: 'CV', icon: FileText },
    { id: 'blog' as Tab, label: 'Blog', icon: PenLine }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/70 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <h1>Your Name</h1>
            
            <div className="flex items-center space-x-4">
              <nav className="flex space-x-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>

              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        {activeTab === 'home' && <Home />}
        {activeTab === 'bookshelf' && <Bookshelf />}
        {activeTab === 'cv' && <CVTab />}
        {activeTab === 'blog' && <BlogTab />}
      </main>

      <footer className="border-t border-border py-6 text-center text-muted-foreground">
        <p>© 2024 Your Name</p>
      </footer>
    </div>
  );
}
