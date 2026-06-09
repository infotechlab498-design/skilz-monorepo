// import { StrictMode } from 'react';
// import { createRoot } from 'react-dom/client';
// import './index.css';
// import App from './App.jsx';
// import { store } from './redux/store.js';
// import { Provider } from 'react-redux';

// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//      <Provider store={store}>
//     <App />
//      </Provider>
//   </StrictMode>,
// )


import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import App from './App.jsx';
import { store } from './redux/store.js';
import { UserProvider } from './context/UserContext.jsx';
import { GameSessionProvider } from './context/GameSessionContext.jsx';
import ErrorBoundary from './Components/ErrorBoundary.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <UserProvider>
          <GameSessionProvider>
            <App />
          </GameSessionProvider>
        </UserProvider>
      </Provider>
    </ErrorBoundary>
  </StrictMode>
)
