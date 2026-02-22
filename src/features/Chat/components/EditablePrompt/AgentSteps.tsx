import React from 'react';

import { Box, Paper, Typography } from '@mui/material';

import { AgentStep } from '@/typings/common';
import { IconComponent } from '@/ui/IconComponent';

import { MarkdownDisplay } from './MarkdownDisplay';

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

  const normalizeGeneratedFiles = (step: any): any[] => {
    const toArray = (value: any): any[] => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') return [value];
      return [];
    };

    if (Array.isArray(step?.files)) {
      return step.files;
    }

    if (step?.files && typeof step.files === 'object') {
      return toArray(step.files);
    }

    if (typeof step?.files === 'string') {
      try {
        return toArray(JSON.parse(step.files));
      } catch {
        return [];
      }
    }

    if (typeof step?.content === 'string') {
      try {
        return toArray(JSON.parse(step.content));
      } catch {
        return [];
      }
    }

    return [];
  };

  const hasMeaningfulText = (value: unknown): boolean => {
    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim();
    return !['', '{}', '[]', 'null', 'undefined', 'None'].includes(normalized);
  };

  return (
    <Box sx={styles.container}>
      {steps.map((step: any, index: number) => (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={step.id || index}>
          {step.type === 'agent_thought' && hasMeaningfulText(step.content) && (
            <Box sx={styles.thoughtContent}>
              <MarkdownDisplay content={step.content} />
            </Box>
          )}

          {step.type === 'files_generated' &&
            (() => {
              const files = normalizeGeneratedFiles(step);
              if (files.length === 0) return null;

              return (
                <Box mt={1} mb={1} p={1} bgcolor="#f0f8ff" borderRadius="4px">
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 'bold', mb: 1 }}
                  >
                    Generated Files:
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={1}>
                    {files.map((file: any, i: number) => {
                      const fileName = file?.name || `file-${i + 1}`;
                      const fileUrl = file?.url || file?.path || '#';
                      const isImage = /\.(png|jpg|jpeg|gif)$/i.test(fileName);

                      return (
                        <Box
                          key={`${fileName}-${i}`} // eslint-disable-line react/no-array-index-key
                          p={1}
                          border="1px solid #ddd"
                          borderRadius={1}
                          bgcolor="white"
                        >
                          {isImage ? (
                            <Box>
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img
                                  src={fileUrl}
                                  alt={fileName}
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: '300px',
                                    display: 'block',
                                  }}
                                />
                              </a>
                              <Typography
                                variant="caption"
                                display="block"
                                mt={0.5}
                              >
                                {fileName}
                              </Typography>
                            </Box>
                          ) : (
                            <Box
                              component="a"
                              href={fileUrl}
                              target="_blank"
                              download
                              display="flex"
                              alignItems="center"
                              gap={1}
                              sx={{ textDecoration: 'none', color: '#1976d2' }}
                            >
                              <IconComponent type="openedFolder" />
                              <Typography
                                variant="body2"
                                sx={{ textDecoration: 'underline' }}
                              >
                                {fileName}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })()}

          {step.type === 'agent_error' && hasMeaningfulText(step.content) && (
            <Paper sx={{ ...styles.stepContainer, borderColor: 'red' }}>
              <Box sx={{ ...styles.header, backgroundColor: '#ffebee' }}>
                <Typography color="error">Error</Typography>
              </Box>
              <Box sx={{ padding: '8px' }}>
                <MarkdownDisplay content={step.content} />
              </Box>
            </Paper>
          )}
        </React.Fragment>
      ))}
    </Box>
  );
};
