import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import WebGLPage from './pages/WebGLPage';
import CssSvgPage from './pages/CssSvgPage';
import Html2CanvasPage from './pages/Html2CanvasPage';
import './index.css';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/webgl" element={<WebGLPage />} />
        <Route path="/css-svg" element={<CssSvgPage />} />
        <Route path="/html2canvas" element={<Html2CanvasPage />} />
      </Routes>
    </HashRouter>
  );
}
