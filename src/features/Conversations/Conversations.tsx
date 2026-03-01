import { ChangeEvent, memo, useState } from 'react';

import { InputAdornment, Menu, MenuItem } from '@mui/material';
import OutsideClickHandler from 'react-outside-click-handler';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/constants/routes';
import { ChatsTree } from '@/features/Conversations/ChatsTree';
import { useDebounce } from '@/hooks/useDebounce';
import { selectCountConversations } from '@/redux/conversations/conversations.selectors';
import {
  clearConversations,
  saveFolder,
} from '@/redux/conversations/conversationsSlice';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';
import { TextFieldComponent } from '@/ui/TextFieldComponent';

import { ChatsTreeSearch } from './ChatsTreeSearch';

import styles from './Conversations.module.scss';

export const Conversations = memo(() => {
  const [isClearing, setIsClearing] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchedName, setSearchedName] = useState('');
  const debouncedSearch = useDebounce(searchedName, 500);
  const conversationLength = useAppSelector(selectCountConversations);
  const isAddMenuOpen = Boolean(menuAnchorEl);

  const onSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchedName(event.target.value);
  };

  const onClickClear = () => {
    setIsClearing(true);
  };

  const onClickCancel = () => {
    setIsClearing(false);
  };

  const onClickResetSearch = () => {
    setSearchedName('');
  };

  const onClearConfirm = () => {
    dispatch(clearConversations());
    setIsClearing(false);
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

  const onOutsideClick = () => {
    onClickCancel();
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
          <OutsideClickHandler onOutsideClick={onOutsideClick}>
            {isClearing ? (
              <div className={styles.confirmationClear}>
                <IconComponent type="confirm" onClick={onClearConfirm} />
                <IconComponent type="cancel" onClick={onClickCancel} />
              </div>
            ) : (
              <ButtonComponent onClick={onClickClear} variant="text">
                Clear
              </ButtonComponent>
            )}
          </OutsideClickHandler>
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
