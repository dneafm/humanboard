import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Inbox, Lightbulb, RefreshCw, FolderKanban, Search as SearchIcon, Bot, Network, Moon, Sun, Target } from 'lucide-react';
import { cn } from './lib/utils';
import InboxPage from './pages/Inbox';
import IdeasPage from './pages/Ideas';
import IdeaDetailPage from './pages/IdeaDetail';
import ReviewPage from './pages/Review';
import ProjectsPage from './pages/Projects';
import SearchPage from './pages/Search';
import MapPage from './pages/Map';
import GoalsPage from './pages/Goals';
import Chatbot from './components/Chatbot';
import { useAppStore } from './store';
import { useEffect } from 'react';

function Sidebar() {
  const { isDarkMode, toggleDarkMode } = useAppStore();
  const navItems = [
    { to: '/', icon: Inbox, label: 'Inbox' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/goals', icon: Target, label: 'Goals' },
    { to: '/map', icon: Network, label: 'Map' },
    { to: '/review', icon: RefreshCw, label: 'Review' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/search', icon: SearchIcon, label: 'Search' },
  ];

  return (
    <div className="w-64 bg-stone-50 dark:bg-stone-950 border-r border-stone-200 dark:border-stone-800 flex flex-col h-screen sticky top-0 transition-colors duration-300">
      <div className="p-6">
        <h1 className="text-xl font-semibold text-stone-800 dark:text-stone-100 tracking-tight flex items-center gap-2">
          <div className="w-6 h-6 bg-stone-800 dark:bg-stone-100 rounded-sm flex items-center justify-center">
            <span className="text-stone-50 dark:text-stone-900 text-xs font-bold">H</span>
          </div>
          HumanBoard
        </h1>
      </div>
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
                isActive 
                  ? "bg-stone-200/50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm" 
                  : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-stone-900 dark:hover:text-stone-100"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-stone-200 dark:border-stone-800 space-y-2">
        <button 
          onClick={toggleDarkMode}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-stone-900 dark:hover:text-stone-100 transition-all"
        >
          {isDarkMode ? (
            <>
              <Sun className="w-4 h-4" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              <span>Dark Mode</span>
            </>
          )}
        </button>
        <div className="flex items-center gap-3 px-3 py-2 text-sm text-stone-500 dark:text-stone-500">
          <Bot className="w-4 h-4" />
          <span>AI Active</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isDarkMode = useAppStore(state => state.isDarkMode);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans selection:bg-stone-200 dark:selection:bg-stone-800 transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <Routes>
            <Route path="/" element={<InboxPage />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/ideas/:id" element={<IdeaDetailPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </main>
        <Chatbot />
      </div>
    </BrowserRouter>
  );
}
