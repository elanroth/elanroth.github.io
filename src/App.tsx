import { useState } from 'react';
import Game from './Banagrams/engine_2/Game';
import { LobbyGate, type LobbyChoice } from './Banagrams/engine_2/LobbyGate';

export default function App() {
  const [choice, setChoice] = useState<LobbyChoice | null>(null);

  if (!choice) {
    return <LobbyGate onEnter={setChoice} />;
  }

  return <Game gameId={choice.gameId} playerId={choice.playerId} nickname={choice.nickname} />;

  // return (
  //   <div className="min-h-screen flex flex-col">
  //     <header className="border-b border-border bg-card/70 backdrop-blur-md sticky top-0 z-50">
  //       <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
  //         <div className="flex items-center justify-between py-4">
  //           <h1>Elan Roth</h1>
            
  //           <div className="flex items-center space-x-4">
  //             <nav className="flex space-x-1">
  //               {tabs.map((tab) => {
  //                 const Icon = tab.icon;
  //                 if (tab.id === 'cv') {
  //                   return (
  //                     <a
  //                       key={tab.id}
  //                       href={pdfUrl}
  //                       target="_blank"
  //                       rel="noopener noreferrer"
  //                       className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary`}
  //                     >
  //                       <span>{tab.label}</span>
  //                     </a>
  //                   );
  //                 }

  //                 return (
  //                   <button
  //                     key={tab.id}
  //                     onClick={() => setActiveTab(tab.id)}
  //                     className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
  //                       activeTab === tab.id
  //                         ? 'bg-primary text-primary-foreground'
  //                         : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
  //                     }`}
  //                   >
  //                     <span>{tab.label}</span>
  //                   </button>
  //                 );
  //               })}
  //             </nav>
  //           </div>
  //         </div>
  //       </div>
  //     </header>

  //     <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
  //       {activeTab === 'home' && <Home />}
  //       {activeTab === 'bookshelf' && <Bookshelf />}
  //       {activeTab === 'cv' && <CVTab />}
  //       {activeTab === 'blog' && <BlogTab />}
  //     </main>
  //   </div>
  // );
    // UNTIL COMMENT
  
}
