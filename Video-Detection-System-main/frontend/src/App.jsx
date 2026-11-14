import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ImageDetection from './pages/ImageDetection';
import AuditLog from './pages/AuditLog';
import MyVideos from './pages/MyVideos';
import History from './pages/History';
import Layout from './components/Layout';
import { WebSocketProvider } from './context/WebSocketContext';

function AppRoutes() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const location = useLocation();

  // Re-check auth state on every route change
  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('token'));
  }, [location]);

  // Listen for custom auth events (login/logout)
  useEffect(() => {
    const handleAuthChange = () => {
      setIsAuthenticated(!!localStorage.getItem('token'));
    };
    window.addEventListener('auth-change', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
        <Route index element={<Dashboard />} />
        <Route path="image-detection" element={<ImageDetection />} />
        <Route path="videos" element={<MyVideos />} />
        <Route path="history" element={<History />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <WebSocketProvider>
        <AppRoutes />
      </WebSocketProvider>
    </Router>
  );
}

export default App;
