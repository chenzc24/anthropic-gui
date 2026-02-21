import { memo, useCallback, useMemo } from 'react';

import { SelectChangeEvent, Stack, Drawer, IconButton, Typography, Box } from '@mui/material';
import { X } from 'lucide-react';

import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import {
  selectApiMaxTokens,
  selectApiModel,
  selectApiTemperature,
  selectApiTopK,
  selectApiTopP,
} from '@/redux/apiSettings/apiSettings.selectors';
import {
  setMaxTokens,
  setModel,
  setTemperature,
  setTopK,
  setTopP,
  resetApiSettings,
} from '@/redux/apiSettings/apiSettings.slice';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { SelectComponent } from '@/ui/SelectComponent';
import { SliderComponent } from '@/ui/SliderComponent';

import { modelSelectItems } from './apiSettings.constants';

import styles from './ApiSettings.module.scss';


interface ApiSettingsProps {
  className?: string;
  open: boolean;
  onClose: () => void;
}

export const ApiSettings = memo(({ className, open, onClose }: ApiSettingsProps) => {
  const dispatch = useAppDispatch();
  const temperature = useAppSelector(selectApiTemperature);
  const model = useAppSelector(selectApiModel);
  const maxTokens = useAppSelector(selectApiMaxTokens);
  const topK = useAppSelector(selectApiTopK);
  const topP = useAppSelector(selectApiTopP);

  const onTemperatureChange = useCallback(
    (value: number) => {
      dispatch(setTemperature(value));
    },
    [dispatch],
  );

  const onMaxTokensChange = useCallback(
    (value: number) => {
      dispatch(setMaxTokens(value));
    },
    [dispatch],
  );

  const onTopPChange = useCallback(
    (value: number) => {
      dispatch(setTopP(value));
    },
    [dispatch],
  );

  const onTopKChange = useCallback(
    (value: number) => {
      dispatch(setTopK(value));
    },
    [dispatch],
  );

  const onModelChange = (event: SelectChangeEvent<unknown>) => {
    const newModel = event.target.value as string;

    dispatch(setModel(newModel));
  };

  const isModelWithMaxToken = useMemo(
    () => model.includes('100k') || model === 'claude-2',
    [model],
  );

  const resetSettings = useCallback(() => {
    dispatch(resetApiSettings());
  }, [dispatch]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      className={className}
      PaperProps={{
        sx: { width: '300px', padding: '20px' } 
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6" fontWeight="bold">Settings</Typography>
        <IconButton onClick={onClose} size="small">
          <X size={20} />
        </IconButton>
      </Box>

      <Stack gap="16px">
        <Box>
          <Typography variant="subtitle2" gutterBottom>Theme</Typography>
          <ThemeSwitcher />
        </Box>
        <SelectComponent
          label="Model"
          onChange={onModelChange}
          selectItems={modelSelectItems}
          value={model}
        />
        <SliderComponent
          label="Max tokens"
          value={maxTokens}
          handleChange={onMaxTokensChange}
          max={isModelWithMaxToken ? 100000 : 8000}
          min={1000}
          step={1}
        />
        <SliderComponent
          label="Temperature"
          value={temperature}
          handleChange={onTemperatureChange}
          max={1}
          min={0}
          step={0.1}
        />
        <SliderComponent
          label="Top K"
          value={topK}
          handleChange={onTopKChange}
          max={10}
          min={0}
          step={1}
        />
        <SliderComponent
          label="Top P"
          value={topP}
          handleChange={onTopPChange}
          max={1}
          min={0}
          step={0.1}
        />
        <ButtonComponent
          type="submit"
          variant="outlined"
          onClick={resetSettings}
          className={styles.resetBtn}
        >
          <span>Reset Settings</span>
        </ButtonComponent>
      </Stack>
    </Drawer>
  );
});

ApiSettings.displayName = 'ApiSettings';
