import { ChangeEvent, memo, useState } from 'react';

import { InputAdornment, Menu, MenuItem, Popover } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import {
  deleteChatSession,
  fetchChatSessions,
  mapSessionSummariesToChatTree,
} from '@/api/chatSessions.api';
import { ROUTES } from '@/app/router/constants/routes';
import { ChatsTree } from '@/features/Conversations/ChatsTree';
import { useDebounce } from '@/hooks/useDebounce';
import { selectCountConversations } from '@/redux/conversations/conversations.selectors';
import {
  clearConversations,
  saveFolder,
  updateChatTree,
} from '@/redux/conversations/conversationsSlice';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { TreeItem } from '@/typings/common';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';
import { TextFieldComponent } from '@/ui/TextFieldComponent';

import { ChatsTreeSearch } from './ChatsTreeSearch';

import styles from './Conversations.module.scss';

const collectChatIds = (items: TreeItem[]): string[] => {
  const ids: string[] = [];

  const walk = (nodes: TreeItem[]) => {
    for (const node of nodes) {
      if (node.type === 'chat') {
        ids.push(node.id);
      }
      if (Array.isArray(node.children) && node.children.length) {
        walk(node.children);
      }
    }
  };

  walk(items);
  return ids;
};

export const Conversations = memo(() => {
  const [clearAnchorEl, setClearAnchorEl] = useState<null | HTMLElement>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchedName, setSearchedName] = useState('');
  const debouncedSearch = useDebounce(searchedName, 500);
  const conversationLength = useAppSelector(selectCountConversations);
  const conversations = useAppSelector(state => state.chats.conversations);
  const isClearConfirmOpen = Boolean(clearAnchorEl);
  const isAddMenuOpen = Boolean(menuAnchorEl);

  const onSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchedName(event.target.value);
  };

  const onClickClear = (event: React.MouseEvent<HTMLButtonElement>) => {
    setClearAnchorEl(event.currentTarget);
  };

  const onClickCancel = () => {
    setClearAnchorEl(null);
  };

  const onClickResetSearch = () => {
    setSearchedName('');
  };

  const onClearConfirm = async () => {
    const chatIds = collectChatIds(conversations);
    if (chatIds.length === 0) {
      setClearAnchorEl(null);
      return;
    }

    const deleteResults = await Promise.allSettled(
      chatIds.map(chatId => deleteChatSession(chatId)),
    );

    const hasFailure = deleteResults.some(item => item.status === 'rejected');
    if (hasFailure) {
      try {
        const sessions = await fetchChatSessions();
        dispatch(
          updateChatTree({ chatTree: mapSessionSummariesToChatTree(sessions) }),
        );
      } catch (error) {
        // Keep current UI state if reconciliation fetch fails.
        void error;
      }
    } else {
      dispatch(clearConversations());
    }

    setClearAnchorEl(null);
  };

  const onOpenAddMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const onCloseAddMenu = () => {
    setMenuAnchorEl(null);
  };

  const onAddChat = () => {
    navigate(ROUTES.Home);
    onCloseAddMenu();
  };

  const onAddFolder = () => {
    dispatch(saveFolder({ name: 'New Folder' }));
    onCloseAddMenu();
  };

  return (
    <>
      <TextFieldComponent
        autoComplete="off"
        placeholder="Search conversation"
        fullWidth
        onChange={onSearchChange}
        value={searchedName}
        className={styles.textField}
        inputProps={{
          style: { marginTop: '3px' },
        }}
        InputProps={{
          startAdornment: (
            <div className={styles.searchContainer}>
              <InputAdornment position="start">
                <IconComponent type="search" className={styles.searchIcon} />
              </InputAdornment>
            </div>
          ),
          endAdornment: searchedName ? (
            <div className={styles.cancelContainer}>
              <InputAdornment position="end" className={styles.cancelIcon}>
                <IconComponent type="cancel" onClick={onClickResetSearch} />
              </InputAdornment>
            </div>
          ) : null,
        }}
      />
      <div className={styles.header}>
        <p>{`Conversations (${conversationLength})`}</p>
        <div className={styles.headerActions}>
          <button
            className={styles.addButton}
            onClick={onOpenAddMenu}
            title="Add"
            type="button"
          >
            <IconComponent type="plus" className={styles.addIcon} />
          </button>
          <ButtonComponent onClick={onClickClear} variant="text">
            Clear
          </ButtonComponent>
        </div>

        <Menu
          anchorEl={menuAnchorEl}
          open={isAddMenuOpen}
          onClose={onCloseAddMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={onAddChat}>Add Chat</MenuItem>
          <MenuItem onClick={onAddFolder}>Add Folder</MenuItem>
        </Menu>

        <Popover
          open={isClearConfirmOpen}
          anchorEl={clearAnchorEl}
          onClose={onClickCancel}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ className: styles.clearConfirmPopover }}
        >
          <div className={styles.clearConfirmContent}>
            <p className={styles.clearConfirmTitle}>Clear all conversations?</p>
            <p className={styles.clearConfirmHint}>
              This action cannot be undone.
            </p>
            <div className={styles.clearConfirmActions}>
              <ButtonComponent variant="text" onClick={onClickCancel}>
                Cancel
              </ButtonComponent>
              <ButtonComponent onClick={onClearConfirm}>
                Clear all
              </ButtonComponent>
            </div>
          </div>
        </Popover>
      </div>

      {debouncedSearch ? (
        <ChatsTreeSearch searchName={debouncedSearch} />
      ) : (
        <div className={styles.treeContainer}>
          <ChatsTree collapsible removable />
        </div>
      )}
    </>
  );
});

Conversations.displayName = 'Conversations';
