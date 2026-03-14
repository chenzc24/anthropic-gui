import { createContext, useEffect, useState } from 'react';

import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';

import {
  fetchChatSessions,
  importLegacyChatsToBackend,
  mapSessionSummariesToChatTree,
  readLegacyPersistedChats,
} from '@/api/chatSessions.api';
import { resetAgentStreamState } from '@/redux/agentStream/agentStream.slice';
import { updateChatTree } from '@/redux/conversations/conversationsSlice';
import { persistor, store } from '@/redux/store';
import { CustomThemeProvider } from '@/theme/CustomThemeProvider';

import { RouterComponent } from './router/RouterComponent';

type NavigationContextType = {
  didNewChatNavigate: boolean;
  setDidNewChatNavigate: React.Dispatch<React.SetStateAction<boolean>>;
};

export const NavigationContext = createContext<NavigationContextType>({
  didNewChatNavigate: false,
  setDidNewChatNavigate: () => {},
});

export const App = () => {
  const [didNewChatNavigate, setDidNewChatNavigate] = useState(false);
  const [chatLoadNotice, setChatLoadNotice] = useState('');

  useEffect(() => {
    let isActive = true;

    const hydrateConversations = async () => {
      try {
        let sessions = await fetchChatSessions();
        if (!isActive) {
          return;
        }

        if (sessions.length === 0) {
          const imported = await importLegacyChatsToBackend();
          if (imported > 0) {
            sessions = await fetchChatSessions();
            if (!isActive) {
              return;
            }
            setChatLoadNotice(
              `Imported ${imported} legacy chat(s) from local storage.`,
            );
          } else {
            const legacyTree = readLegacyPersistedChats();
            if (legacyTree.length > 0) {
              store.dispatch(updateChatTree({ chatTree: legacyTree }));
              setChatLoadNotice(
                'Loaded legacy local chat history (server unavailable).',
              );
              return;
            }
          }
        }

        const chatTree = mapSessionSummariesToChatTree(sessions);
        store.dispatch(updateChatTree({ chatTree }));
        if (sessions.length > 0) {
          return;
        }
        setChatLoadNotice('');
      } catch (error) {
        if (isActive) {
          const legacyTree = readLegacyPersistedChats();
          if (legacyTree.length > 0) {
            store.dispatch(updateChatTree({ chatTree: legacyTree }));
            setChatLoadNotice(
              'Loaded legacy local chat history (server unavailable).',
            );
          } else {
            store.dispatch(updateChatTree({ chatTree: [] }));
            setChatLoadNotice('Chat history failed to load from server.');
          }
        }
        void error;
      }
    };

    void hydrateConversations();

    return () => {
      isActive = false;
    };
  }, []);

  const handleBeforeLift = () => {
    store.dispatch(resetAgentStreamState());
  };

  return (
    <Provider store={store}>
      <PersistGate persistor={persistor} onBeforeLift={handleBeforeLift}>
        {chatLoadNotice && (
          <div
            style={{
              background: '#fff4dd',
              color: '#6b4e00',
              padding: '8px 12px',
              fontSize: '12px',
              borderBottom: '1px solid #f0d89f',
            }}
          >
            {chatLoadNotice}
          </div>
        )}
        <HashRouter>
          <NavigationContext.Provider
            value={{ didNewChatNavigate, setDidNewChatNavigate }}
          >
            <CustomThemeProvider>
              <RouterComponent />
            </CustomThemeProvider>
          </NavigationContext.Provider>
        </HashRouter>
      </PersistGate>
    </Provider>
  );
};
