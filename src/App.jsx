import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import AppToast from '@/components/AppToast';
import MarkupStudio from '@/pages/MarkupStudio';
import SignMode from '@/pages/SignMode';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MarkupStudio />} />
          <Route path="/sign" element={<SignMode />} />
        </Routes>
        <AppToast />
      </BrowserRouter>
    </ToastProvider>
  );
}
