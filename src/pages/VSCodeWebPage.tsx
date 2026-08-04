import { useEffect } from 'react';

const DEFAULT_VSCODE_WEB_URL = 'https://code.wimps.dev/';

export default function VSCodeWebPage() {
  const vscodeUrl = import.meta.env.VITE_VSCODE_WEB_URL || DEFAULT_VSCODE_WEB_URL;

  useEffect(() => {
    window.location.replace(vscodeUrl);
  }, [vscodeUrl]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', backgroundColor: '#1e1e1e', color: '#c9d1d9' }}>
      Opening WIMPS Code...
    </main>
  );
}
