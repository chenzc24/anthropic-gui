import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AgentStreamState {
  activeChatId: string | null;
  isStreaming: boolean;
  isLoading: boolean;
  isWaitingForInput: boolean;
  inputPrompt: string;
  updatingAiPromptId: string;
}

const initialState: AgentStreamState = {
  activeChatId: null,
  isStreaming: false,
  isLoading: false,
  isWaitingForInput: false,
  inputPrompt: '',
  updatingAiPromptId: '',
};

export const agentStreamSlice = createSlice({
  name: 'agentStream',
  initialState,
  reducers: {
    setAgentStreamState: (
      state,
      action: PayloadAction<Partial<AgentStreamState>>,
    ) => {
      Object.assign(state, action.payload);
    },
    resetAgentStreamState: () => initialState,
  },
});

export const { setAgentStreamState, resetAgentStreamState } =
  agentStreamSlice.actions;
