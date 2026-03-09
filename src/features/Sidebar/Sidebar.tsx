import { memo } from 'react';

import classNames from 'classnames';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/app/router/constants/routes';
import { Logo } from '@/components/Logo';
import { Logout } from '@/components/Logout';
import { Conversations } from '@/features/Conversations';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';

import styles from './Sidebar.module.scss';

interface SidebarProps {
  className?: string;
  onOpenSettings?: () => void;
}

export const Sidebar = memo(({ className, onOpenSettings }: SidebarProps) => {
  const navigate = useNavigate();

  const onClickEditor = () => {
    navigate(ROUTES.Editor);
  };

  return (
    <div className={classNames(className, styles.wrapper)}>
      <Logo />
      <ButtonComponent onClick={onClickEditor} className={styles.editorBtn}>
        <span>IO Editor</span>
        <IconComponent type="edit" className={styles.newChatIcon} />
      </ButtonComponent>
      <Conversations />
      <div className={styles.bottomItems}>
        <div className={styles.actionsRow}>
          <div className={styles.logoutWrap}>
            <Logout />
          </div>
          {onOpenSettings && (
            <button
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
});

Sidebar.displayName = 'Sidebar';
