import fs from 'fs';

const appPath = 'F:/backtest/humanboard/src/App.tsx';
let content = fs.readFileSync(appPath, 'utf-8');

// 1. Add WorkflowPage import after last page import
const workflowImport = "import { WorkflowPage } from './pages/Workflow';";
if (!content.includes('WorkflowPage')) {
  // Find where page imports end
  content = content.replace(
    "import { SearchPage } from './pages/Search';",
    "import { SearchPage } from './pages/Search';\nimport { WorkflowPage } from './pages/Workflow';"
  );
}

// 2. Add workflow to navItems
if (!content.includes('/workflow')) {
  content = content.replace(
    "{ to: '/search', icon: SearchIcon, label: 'Search' },",
    "{ to: '/search', icon: SearchIcon, label: 'Search' },\n    { to: '/workflow', icon: Network, label: 'Workflow' },"
  );
}

// 3. Add Route for WorkflowPage
if (!content.includes("path=\"/workflow\"")) {
  content = content.replace(
    "<Route path=\"/search\" element={<SearchPage />} />",
    "<Route path=\"/search\" element={<SearchPage />} />\n            <Route path=\"/workflow\" element={<WorkflowPage />} />"
  );
}

fs.writeFileSync(appPath, content, 'utf-8');
console.log('App.tsx updated successfully');
