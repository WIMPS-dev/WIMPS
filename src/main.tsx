import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import './global.css';
import DocsPage from './pages/DocsPage';
import HomePage from './pages/HomePage';
import IdePage from './pages/IdePage';
// import LoginPage from './pages/LoginPage';
// import RegisterPage from './pages/RegisterPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter basename="/">
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* TEMP: login disabled - redirect to classic IDE so URLs don't 404 */}
          <Route path="/login" element={<Navigate to="/classic" replace />} />
          <Route path="/register" element={<Navigate to="/classic" replace />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/classic" element={<IdePage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
