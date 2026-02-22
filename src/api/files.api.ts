export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

export interface FileListResponse {
  files: FileNode[];
}

export interface FileContentResponse {
  content: string;
  error?: string;
}

export interface SaveFileRequest {
  path: string;
  content: string;
}

export const fetchFiles = async (signal?: AbortSignal): Promise<FileNode[]> => {
  try {
    const response = await fetch('/api/files', { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch files: ${response.statusText}`);
    }
    const data: FileListResponse = await response.json();
    return data.files;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching files:', error);
    throw error;
  }
};

export const fetchFileContent = async (
  path: string,
  signal?: AbortSignal,
): Promise<string> => {
  try {
    // path parameter should be encoded
    const encodedPath = encodeURIComponent(path);
    const response = await fetch(`/api/files/content?path=${encodedPath}`, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }

    const data: FileContentResponse = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    return data.content;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching file content:', error);
    throw error;
  }
};

export const saveFileContent = async (
  path: string,
  content: string,
  signal?: AbortSignal,
): Promise<void> => {
  try {
    const response = await fetch('/api/files/content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, content }),
      signal,
    });

    if (!response.ok) {
      // Try to get error message from body
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to save file: ${response.statusText}`,
      );
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error saving file content:', error);
    throw error;
  }
};

export const uploadFile = async (
  file: File,
  signal?: AbortSignal,
): Promise<{ filename: string; filepath: string; url: string }> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/agent/upload', {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    // Return the full file info from the backend
    return {
      filename: data.filename,
      filepath: data.filepath,
      url: data.url,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error uploading file:', error);
    throw error;
  }
};
