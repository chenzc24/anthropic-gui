import React, { useMemo, useState, useEffect } from 'react';

import {
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Box,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  X as CloseIcon,
  FileText as FileIcon,
  Image as ImageIcon,
  Code as CodeIcon,
  Download as DownloadIcon,
  Eye as PreviewIcon,
  Settings as SettingsIcon,
} from 'lucide-react';

import { ChatContent, ChatFile } from '@/typings/common';

interface ChatFileDrawerProps {
  open: boolean;
  onClose: () => void;
  chatContent?: ChatContent[];
}

export const ChatFileDrawer: React.FC<ChatFileDrawerProps> = ({
  open,
  onClose,
  chatContent,
}) => {
  const [previewFile, setPreviewFile] = useState<ChatFile | null>(null);

  // Extract all assets from chat content
  const allFiles = useMemo(() => {
    if (!chatContent) return [];
    return chatContent
      .flatMap(c => c.assets || [])
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [chatContent]);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon />;

      case 'code':
      case 'json':
      case 'il':
        return <CodeIcon />;

      case 'config':
        return <SettingsIcon />;

      default:
        return <FileIcon />;
    }
  };

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = (file: ChatFile) => {
    setPreviewFile(file);
  };

  const closePreview = () => {
    setPreviewFile(null);
  };

  // Preview Content Fetcher (Mock for now, assumes URL is accessible or content is needed via fetch)
  // In a real app, you might need to fetch the content if it's text/code.
  // For this implementation, we will try to fetch if it's code/json.
  const [previewContent, setPreviewContent] = useState<string>('');

  useEffect(() => {
    if (
      previewFile &&
      (previewFile.type === 'code' ||
        previewFile.type === 'json' ||
        previewFile.type === 'config' ||
        previewFile.type === 'il' ||
        previewFile.type === 'unknown')
    ) {
      setPreviewContent('Loading...');
      if (previewFile.url && previewFile.url.startsWith('http')) {
        fetch(previewFile.url)
          .then(res => res.text())
          .then(text => setPreviewContent(text))
          .catch(err =>
            setPreviewContent(`Error loading file: ${err.message}`),
          );
      } else {
        // If it's a local path or not fetchable directly, we might need a backend proxy or just show the path
        setPreviewContent(
          `Cannot preview this file directly in browser.\nPath: ${previewFile.url}`,
        );
      }
    }
  }, [previewFile]);

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: { width: 350, padding: 2 },
        }}
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
        >
          <Typography variant="h6" fontWeight="bold">
            Generated Files ({allFiles.length})
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider />

        <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
          {allFiles.length === 0 ? (
            <Box p={2} textAlign="center">
              <Typography variant="body2" color="textSecondary">
                No files generated yet.
              </Typography>
            </Box>
          ) : (
            allFiles.map(file => (
              <React.Fragment key={file.id}>
                <ListItem
                  alignItems="flex-start"
                  sx={{ paddingLeft: 0, paddingRight: 0 }}
                >
                  <Box mr={2} mt={1} color="action.active">
                    {getFileIcon(file.type)}
                  </Box>
                  <ListItemText
                    primary={
                      <Typography
                        variant="subtitle2"
                        style={{ wordBreak: 'break-all' }}
                      >
                        {file.name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="textSecondary">
                        {new Date(file.timestamp).toLocaleTimeString()} {' • '}
                        {file.type.toUpperCase()}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      aria-label="preview"
                      onClick={() => handlePreview(file)}
                      size="small"
                    >
                      <PreviewIcon size={16} />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="download"
                      onClick={() => handleDownload(file.url, file.name)}
                      size="small"
                    >
                      <DownloadIcon size={16} />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider component="li" />
              </React.Fragment>
            ))
          )}
        </List>
      </Drawer>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewFile}
        onClose={closePreview}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {previewFile?.name}
          <IconButton
            aria-label="close"
            onClick={closePreview}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: theme => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {previewFile?.type === 'image' ? (
            <img
              src={previewFile.url}
              alt={previewFile.name}
              style={{
                maxWidth: '100%',
                height: 'auto',
                display: 'block',
                margin: '0 auto',
              }}
            />
          ) : (
            <pre
              style={{
                margin: 0,
                padding: 16,
                backgroundColor: '#f5f5f5',
                borderRadius: 4,
                overflow: 'auto',
                maxHeight: '60vh',
              }}
            >
              <code>{previewContent}</code>
            </pre>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              previewFile && handleDownload(previewFile.url, previewFile.name)
            }
            color="primary"
          >
            Download
          </Button>
          <Button onClick={closePreview} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
