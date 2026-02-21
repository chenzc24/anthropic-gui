import React from 'react';

import {
  Box,
  Paper,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';

import { AgentStep } from '@/typings/common';
import { IconComponent } from '@/ui/IconComponent';

// Styles could be integrated later, using inline styles for speed
const styles = {
  container: {
    marginTop: 10,
    marginBottom: 10,
    width: '100%',
  },
  stepContainer: {
    marginBottom: 8,
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
  },
  content: {
    padding: '12px 16px',
    backgroundColor: '#fff',
    borderTop: '1px solid #e0e0e0',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    fontSize: '0.85rem',
    overflowX: 'auto',
  },
  thoughtContent: {
    padding: '8px 16px',
    backgroundColor: '#fcfcfc',
    color: '#333',
    fontStyle: 'normal',
    borderLeft: '3px solid #1976d2',
    margin: '8px 0',
    whiteSpace: 'pre-wrap',
    fontFamily: 'var(--font-family-main)',
  },
} as const;

export const AgentSteps = ({ steps }: { steps: AgentStep[] }) => {
  if (!steps || steps.length === 0) return null;

  return (
    <Box sx={styles.container}>
      {steps.map((step: any, index: number) => (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={step.id || index}>
          {step.type === 'agent_thought' && (
            <Box sx={styles.thoughtContent}>
              <Typography variant="body2" component="div">
                {step.content}
              </Typography>
            </Box>
          )}

          {step.type === 'tool_call' && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<IconComponent type="arrowDown" />}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    label="Tool Call"
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    {step.toolName || 'Unknown Tool'}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ padding: 0 }}>
                <Box sx={styles.content}>
                  {/* Pretty print arguments if json */}
                  <pre style={{ margin: 0 }}>
                    {JSON.stringify(step.toolArgs, null, 2)}
                  </pre>
                </Box>
              </AccordionDetails>
            </Accordion>
          )}


          {step.type === 'files_generated' && step.files && (
            <Box mt={1} mb={1} p={1} bgcolor="#f0f8ff" borderRadius="4px">
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Generated Files:
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                {step.files.map((file: any, i: number) => {
                  const isImage = /\.(png|jpg|jpeg|gif)$/i.test(file.name);
                  return (
                    <Box key={i} p={1} border="1px solid #ddd" borderRadius={1} bgcolor="white">
                      {isImage ? (
                        <Box>
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                             <img 
                                src={file.url} 
                                alt={file.name} 
                                style={{ maxWidth: '100%', maxHeight: '300px', display: 'block' }} 
                             />
                          </a>
                          <Typography variant="caption" display="block" mt={0.5}>
                            {file.name}
                          </Typography>
                        </Box>
                      ) : (
                        <Box 
                          component="a" 
                          href={file.url} 
                          target="_blank" 
                          download 
                          display="flex" 
                          alignItems="center" 
                          gap={1} 
                          sx={{ textDecoration: 'none', color: '#1976d2' }}
                        >
                          <IconComponent type="openedFolder" /> 
                          <Typography variant="body2" sx={{ textDecoration: 'underline' }}>{file.name}</Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {step.type === 'tool_result' && (
            <Accordion>
              <AccordionSummary>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    label="Result"
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                  <Typography variant="subtitle2" sx={{ color: '#666' }}>
                    Observation
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ padding: 0 }}>
                <Box sx={styles.content}>{step.content}</Box>
              </AccordionDetails>
            </Accordion>
          )}

          {step.type === 'agent_error' && (
            <Paper sx={{ ...styles.stepContainer, borderColor: 'red' }}>
              <Box sx={{ ...styles.header, backgroundColor: '#ffebee' }}>
                <Typography color="error">Error</Typography>
              </Box>
              <Box sx={styles.content}>{step.content}</Box>
            </Paper>
          )}
        </React.Fragment>
      ))}
    </Box>
  );
};
