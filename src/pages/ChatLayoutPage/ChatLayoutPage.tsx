import { PropsWithChildren, useState } from 'react';

import classNames from 'classnames';

import { ApiSettings } from '@/features/ApiSettings';
import { Sidebar } from '@/features/Sidebar';

import styles from './ChatLayoutPage.module.scss';

export const ChatLayoutPage = ({ children }: PropsWithChildren) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className={classNames(['app', styles.wrapper])}>
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
      {children}
      <ApiSettings
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
