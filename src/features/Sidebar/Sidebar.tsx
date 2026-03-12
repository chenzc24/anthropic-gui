import { memo } from 'react';

import classNames from 'classnames';
import { ChevronLeft, ChevronRight, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/constants/routes';
import { Logo } from '@/components/Logo';
import { Logout } from '@/components/Logout';
import { Conversations } from '@/features/Conversations';
import { cleanApiKey } from '@/redux/apiSettings/apiSettings.slice';
import { useAppDispatch } from '@/redux/hooks';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';

import styles from './Sidebar.module.scss';

interface SidebarProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSettings?: () => void;
}

export const Sidebar = memo(
  ({
    className,
    isCollapsed = false,
    onToggleCollapse,
    onOpenSettings,
  }: SidebarProps) => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();

    const onClickEditor = () => {
      navigate(ROUTES.Editor);
    };

    const onLogout = () => {
      dispatch(cleanApiKey());
    };

    return (
      <div
        className={classNames(className, styles.wrapper, {
          [styles.collapsed]: isCollapsed,
        })}
      >
        <div className={styles.topRow}>
          <div className={styles.logoWrap}>
            <Logo />
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={styles.collapseBtn}
              onClick={onToggleCollapse}
            >
              {isCollapsed ? (
                <ChevronRight size={18} />
              ) : (
                <ChevronLeft size={18} />
              )}
            </button>
          )}
        </div>
        <ButtonComponent onClick={onClickEditor} className={styles.editorBtn}>
          {!isCollapsed && <span>IO Editor</span>}
          <IconComponent type="edit" className={styles.newChatIcon} />
        </ButtonComponent>
        {!isCollapsed && <Conversations />}
        <div className={styles.bottomItems}>
          <div className={styles.actionsRow}>
            {!isCollapsed ? (
              <div className={styles.logoutWrap}>
                <Logout />
              </div>
            ) : (
              <button
                type="button"
                onClick={onLogout}
                title="Logout"
                className={styles.iconActionBtn}
              >
                <LogOut size={18} />
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                title="Settings"
                className={styles.settingsBtn}
              >
                <Settings size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);

Sidebar.displayName = 'Sidebar';
