import { PropsWithChildren, useState } from 'react';

import classNames from 'classnames';

import { ApiSettings } from '@/features/ApiSettings';
import { Sidebar } from '@/features/Sidebar';

import styles from './ChatLayoutPage.module.scss';

export const ChatLayoutPage = ({ children }: PropsWithChildren) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div
      className={classNames([
        'app',
        styles.wrapper,
        isSidebarCollapsed && styles.collapsed,
      ])}
    >
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      {children}
      <ApiSettings
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
