import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Products from './pages/Products';
import KamiPool from './pages/KamiPool';
import Orders from './pages/Orders';
import AutoReply from './pages/AutoReply';
import License from './pages/License';
import ListingRewrite from './pages/ListingRewrite';
import AiSettings from './pages/AiSettings';
import Profile from './pages/Profile';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="products" element={<Products />} />
          <Route path="listing-rewrite" element={<ListingRewrite />} />
          <Route path="item-drafts" element={<Navigate to="/listing-rewrite" replace />} />
          <Route path="kami" element={<KamiPool />} />
          <Route path="orders" element={<Orders />} />
          <Route path="auto-reply" element={<AutoReply />} />
          <Route path="ai-settings" element={<AiSettings />} />
          <Route path="license" element={<License />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
