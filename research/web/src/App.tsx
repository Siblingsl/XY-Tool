import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Emails from './pages/Emails';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Reports from './pages/Reports';
import Pipeline from './pages/Pipeline';
import Skills from './pages/Skills';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Clusters from './pages/Clusters';
import Compare from './pages/Compare';
import Workbench from './pages/Workbench';
import MaturityBoard from './pages/MaturityBoard';
import SourceInsights from './pages/SourceInsights';
import CompetitorWatch from './pages/CompetitorWatch';
import AutomationRules from './pages/AutomationRules';
import KnowledgeBase from './pages/KnowledgeBase';
import ScrapeCenter from './pages/ScrapeCenter';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="emails" element={<Emails />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="skills" element={<Skills />} />
          <Route path="clusters" element={<Clusters />} />
          <Route path="compare" element={<Compare />} />
          <Route path="workbench" element={<Workbench />} />
          <Route path="maturity" element={<MaturityBoard />} />
          <Route path="sources" element={<SourceInsights />} />
          <Route path="competitor-watch" element={<CompetitorWatch />} />
          <Route path="automation-rules" element={<AutomationRules />} />
          <Route path="knowledge" element={<KnowledgeBase />} />
          <Route path="scrape" element={<ScrapeCenter />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
